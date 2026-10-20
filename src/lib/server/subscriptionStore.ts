import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SubscriptionOffer } from "@/lib/subscription";
import { isTvDayValid, TRIAL_DAYS, TV_ACCESS_HOURS } from "@/lib/subscription";
import { defaultQuotaSettings, type QuotaSettings } from "@/lib/server/quotaSettings";

/**
 * Stockage serveur des abonnements et des quotas journaliers (source de vérité).
 *
 * Les documents vivent dans Firestore, dans des collections réservées au serveur :
 *   - `subscriptions/{accountKey}` : essai et offres ;
 *   - `usage/{accountKey}`         : compteur de combinaisons du jour.
 *
 * `accountKey` vaut `firebase:{uid}` pour un utilisateur connecté et `guest:{id}`
 * pour un visiteur. Ces collections ne sont modifiables que par le SDK Admin :
 * un client ne peut donc ni remettre son quota à zéro, ni s'octroyer une offre.
 *
 * L'authentification utilise les identifiants par défaut de l'application
 * (compte de service) ou `firebase-admin` déjà initialisé par l'environnement.
 */

const SUBSCRIPTIONS_COLLECTION = "subscriptions";
const USAGE_COLLECTION = "usage";

export interface ServerSubscription {
  trialStartedAt: string;
  trialEndsAt: string;
  offers: SubscriptionOffer[];
  /** Fin de l'accès TV ouvert par un paiement à la journée (ISO 8601). */
  tvAccessUntil?: string;
}

export interface ServerUsage {
  day: string;
  count: number;
}

/** Date locale (AAAA-MM-JJ) — alignée sur le calcul client. */
export function localDay(date: Date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysIso(isoDay: string, days: number): string {
  const next = new Date(`${isoDay}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

let adminUnavailable = false;
let credentialsChecked = false;

/**
 * Instance Firestore via le SDK Admin. Renvoie null si les identifiants serveur
 * ne sont pas disponibles (développement local sans compte de service) : l'appelant
 * retombe alors sur le mode démo (quota géré côté client). Le diagnostic n'est
 * journalisé qu'une seule fois pour ne pas polluer les logs à chaque requête.
 */
export function getAdminDb(): Firestore | null {
  if (adminDb) return adminDb;
  if (adminUnavailable) return null;
  try {
    adminApp = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
    adminDb = getFirestore(adminApp);
    return adminDb;
  } catch (error) {
    adminUnavailable = true;
    console.warn(
      "Firebase Admin indisponible : le quota est géré côté client (mode local).",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Vrai si des identifiants par défaut sont réellement disponibles. La vérification
 * n'a lieu qu'une fois puis est mise en cache, afin de ne pas interroger Firestore
 * en vain à chaque requête en développement local.
 */
export async function isAdminConfigured(): Promise<boolean> {
  if (adminDb) return true;
  if (adminUnavailable) return false;
  if (!credentialsChecked) {
    const db = getAdminDb();
    if (!db) return false;
    try {
      // Requête triviale : échoue immédiatement si aucun identifiant n'est présent.
      await db.collection(USAGE_COLLECTION).doc("__healthcheck__").get();
      credentialsChecked = true;
    } catch (error) {
      adminUnavailable = true;
      console.warn(
        "Firebase Admin indisponible : le quota est géré côté client (mode local).",
        error instanceof Error ? error.message : error
      );
      adminDb = null;
      return false;
    }
  }
  return true;
}

/** Indique si l'utilisateur a le rôle admin, d'après son profil Firestore. */
export async function isAdminUser(db: Firestore, accountKey: string): Promise<boolean> {
  if (!accountKey.startsWith("firebase:")) return false;
  const uid = accountKey.slice("firebase:".length);
  try {
    const snapshot = await db.collection("users").doc(uid).get();
    return snapshot.data()?.role === "admin";
  } catch (error) {
    console.error("Lecture du rôle impossible.", error);
    return false;
  }
}

export interface AdminAccountSummary {
  accountKey: string;
  uid: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan: "standard" | "premium";
  createdAt: string | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  offers: SubscriptionOffer[];
  hasTvAccess: boolean;
  hasCombinationAccess: boolean;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
}

async function readUserIdSet(
  db: Firestore,
  field: "favorites" | "basket" | "network"
): Promise<Set<string>> {
  const snapshot = await db.collection(field).get();
  return new Set(snapshot.docs.map(document => document.id));
}

/**
 * Comptes connus du serveur, avec leurs droits réels.
 *
 * Deux sources sont fusionnées :
 *  - la collection `users` (profils créés par l'application, rôle et plan) ;
 *  - la collection `subscriptions` (essai et offres, écrite par le serveur).
 *
 * Les profils sont éventuellement complétés par les identifiants rencontrés dans
 * `favorites`, `basket` et `network`, afin de couvrir les comptes dont le profil
 * n'existe pas encore mais qui utilisent déjà l'application.
 *
 * Page réservée à l'administration : ne jamais exposer cette liste publiquement.
 */
export async function listAdminAccounts(
  db: Firestore,
  quotas: QuotaSettings = defaultQuotaSettings()
): Promise<AdminAccountSummary[]> {
  const [usersSnapshot, subscriptionsSnapshot, favorites, basket, network] = await Promise.all([
    db.collection("users").get(),
    db.collection(SUBSCRIPTIONS_COLLECTION).get(),
    readUserIdSet(db, "favorites"),
    readUserIdSet(db, "basket"),
    readUserIdSet(db, "network"),
  ]);

  const profileByUid = new Map<string, Record<string, unknown>>();
  usersSnapshot.docs.forEach(document => {
    profileByUid.set(document.id, (document.data() ?? {}) as Record<string, unknown>);
  });

  const subscriptionByUid = new Map<string, Record<string, unknown>>();
  subscriptionsSnapshot.docs.forEach(document => {
    if (!document.id.startsWith("firebase:")) return;
    subscriptionByUid.set(
      document.id.slice("firebase:".length),
      (document.data() ?? {}) as Record<string, unknown>
    );
  });

  const uids = new Set<string>([
    ...profileByUid.keys(),
    ...subscriptionByUid.keys(),
    ...favorites,
    ...basket,
    ...network,
  ]);

  const accounts: AdminAccountSummary[] = [];
  for (const uid of uids) {
    const profile = profileByUid.get(uid);
    const accountKey = `firebase:${uid}`;
    const role: "user" | "admin" = profile?.role === "admin" ? "admin" : "user";

    const usageSnapshot = await db.collection(USAGE_COLLECTION).doc(accountKey).get();
    const state: LoadedState = {
      subscription: toSubscription(subscriptionByUid.get(uid)),
      usage: toUsage(usageSnapshot.data(), localDay()),
    };
    const entitlements = computeEntitlements(state, role === "admin", quotas);

    accounts.push({
      accountKey,
      uid,
      email: typeof profile?.email === "string" ? profile.email : "",
      name: typeof profile?.name === "string" ? profile.name : "",
      role,
      plan: role === "admin" || profile?.plan === "premium" ? "premium" : "standard",
      createdAt: typeof profile?.createdAt === "string" ? profile.createdAt : null,
      trialActive: entitlements.trialActive,
      trialEndsAt: entitlements.trialEndsAt,
      offers: entitlements.offers,
      hasTvAccess: entitlements.hasTvAccess,
      hasCombinationAccess: entitlements.hasCombinationAccess,
      usedToday: entitlements.usedToday,
      dailyLimit: entitlements.dailyLimit,
      remainingToday: entitlements.remainingToday,
    });
  }

  return accounts.sort((first, second) => {
    const firstDate = first.createdAt ? new Date(first.createdAt).getTime() : 0;
    const secondDate = second.createdAt ? new Date(second.createdAt).getTime() : 0;
    return secondDate - firstDate;
  });
}

/**
 * Change le plan d'un compte (`standard` ou `premium`).
 *
 * Les règles Firestore interdisent ce changement depuis le navigateur : seul le
 * serveur, avec les droits Admin, peut le faire. Le rôle n'est jamais modifié ici
 * (il reste réservé à la console Firebase).
 */
export async function setAccountPlan(
  db: Firestore,
  uid: string,
  plan: "standard" | "premium"
): Promise<"standard" | "premium"> {
  const normalized = plan === "premium" ? "premium" : "standard";
  await db.collection("users").doc(uid).set({ plan: normalized }, { merge: true });
  return normalized;
}

/**
 * Rattache un identifiant anonyme à un compte, à la première connexion.
 *
 * Le rattachement sert à repérer les comptes qui abuseaient du quota invité
 * (compteur remis à zéro en vidant le stockage du navigateur). Il est ignoré
 * silencieusement si Firestore n'est pas disponible.
 */
export async function linkGuestToUser(
  db: Firestore | null,
  guestId: string,
  accountKey: string
): Promise<void> {
  if (!db || !guestId) return;
  try {
    const reference = db.collection("guestLinks").doc(guestId);
    const snapshot = await reference.get();
    if (snapshot.exists) return;
    await reference.set({ accountKey, linkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Rattachement invité impossible.", error);
  }
}

/** Compte associé à un identifiant anonyme, ou null s'il n'a jamais été rattaché. */
export async function resolveGuestLink(db: Firestore, guestId: string): Promise<string | null> {
  try {
    const snapshot = await db.collection("guestLinks").doc(guestId).get();
    const accountKey = snapshot.data()?.accountKey;
    return typeof accountKey === "string" ? accountKey : null;
  } catch (error) {
    console.error("Lecture du rattachement invité impossible.", error);
    return null;
  }
}

function isOffer(value: unknown): value is SubscriptionOffer {
  return value === "tv" || value === "combinations" || value === "pack";
}

function toSubscription(data: Record<string, unknown> | undefined): ServerSubscription | null {
  if (!data) return null;
  const trialStartedAt = typeof data.trialStartedAt === "string" ? data.trialStartedAt : null;
  const trialEndsAt = typeof data.trialEndsAt === "string" ? data.trialEndsAt : null;
  if (!trialStartedAt || !trialEndsAt) return null;
  const offers = Array.isArray(data.offers) ? data.offers.filter(isOffer) : [];
  const tvAccessUntil = typeof data.tvAccessUntil === "string" ? data.tvAccessUntil : undefined;
  return { trialStartedAt, trialEndsAt, offers, tvAccessUntil };
}

function toUsage(data: Record<string, unknown> | undefined, today: string): ServerUsage {
  if (!data || data.day !== today) return { day: today, count: 0 };
  const count = data.count;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? { day: today, count }
    : { day: today, count: 0 };
}

export interface LoadedState {
  subscription: ServerSubscription | null;
  usage: ServerUsage;
}

/** Charge l'abonnement et le quota du jour (compteur remis à zéro au changement de jour). */
export function loadState(db: Firestore, accountKey: string): Promise<LoadedState> {
  const today = localDay();
  return db.runTransaction(async transaction => {
    const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(accountKey);
    const usageRef = db.collection(USAGE_COLLECTION).doc(accountKey);
    const [subscriptionSnapshot, usageSnapshot] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(usageRef),
    ]);
    return {
      subscription: toSubscription(subscriptionSnapshot.data()),
      usage: toUsage(usageSnapshot.data(), today),
    };
  });
}

/** Démarre l'essai de 3 jours si aucun abonnement n'existe encore. */
export async function ensureTrial(
  db: Firestore,
  accountKey: string,
  state: LoadedState
): Promise<LoadedState> {
  if (state.subscription) return state;
  const today = localDay();
  const subscription: ServerSubscription = {
    trialStartedAt: today,
    trialEndsAt: addDaysIso(today, TRIAL_DAYS),
    offers: [],
  };
  await db.collection(SUBSCRIPTIONS_COLLECTION).doc(accountKey).set(subscription, { merge: true });
  return { subscription, usage: state.usage };
}

/** Active ou désactive une offre, en démarrant l'essai au besoin.
 *
 * L'offre TV est payée à la journée : son activation ouvre un accès de
 * `TV_ACCESS_HOURS` heures ; une TV expirée se rachète pour une nouvelle journée.
 */
export async function setOffer(
  db: Firestore,
  accountKey: string,
  offer: SubscriptionOffer,
  state: LoadedState
): Promise<LoadedState> {
  const ensured = await ensureTrial(db, accountKey, state);
  const subscription = ensured.subscription;
  if (!subscription) return ensured;

  const update: Record<string, unknown> = {};
  let offers = subscription.offers;
  let tvAccessUntil = subscription.tvAccessUntil;

  if (subscription.offers.includes(offer)) {
    if (offer === "tv" && isTvDayValid(subscription)) {
      // Désactivation de l'accès TV en cours de journée.
      offers = offers.filter(item => item !== offer);
      update.tvAccessUntil = FieldValue.delete();
      tvAccessUntil = undefined;
    } else if (offer === "tv") {
      // Journée TV expirée : nouveau paiement pour une nouvelle journée.
      tvAccessUntil = new Date(Date.now() + TV_ACCESS_HOURS * 3_600_000).toISOString();
      update.tvAccessUntil = tvAccessUntil;
    } else {
      offers = offers.filter(item => item !== offer);
    }
  } else {
    offers = [...offers, offer];
    if (offer === "tv") {
      tvAccessUntil = new Date(Date.now() + TV_ACCESS_HOURS * 3_600_000).toISOString();
      update.tvAccessUntil = tvAccessUntil;
    }
  }

  update.offers = offers;
  await db.collection(SUBSCRIPTIONS_COLLECTION).doc(accountKey).set(update, { merge: true });
  return { subscription: { ...subscription, offers, tvAccessUntil }, usage: ensured.usage };
}

export interface ServerEntitlements {
  trialActive: boolean;
  trialEndsAt: string | null;
  offers: SubscriptionOffer[];
  hasTvAccess: boolean;
  hasCombinationAccess: boolean;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  canGenerate: boolean;
  reason: "trial-daily-limit" | "offer-daily-limit" | "no-offer" | null;
}

/** Calcule les droits serveur (source de vérité) à partir de l'état stocké. */
export function computeEntitlements(
  state: LoadedState,
  isAdmin: boolean,
  quotas: QuotaSettings = defaultQuotaSettings()
): ServerEntitlements {
  const today = localDay();
  const subscription = state.subscription;
  const trialActive = !!subscription && today < subscription.trialEndsAt;
  const offers = subscription?.offers ?? [];
  const hasTvAccess = !!subscription
    && (trialActive || offers.includes("pack") || (offers.includes("tv") && isTvDayValid(subscription)));
  const hasCombinationAccess = !!subscription
    && (trialActive || offers.includes("combinations") || offers.includes("pack"));

  if (isAdmin) {
    return {
      trialActive,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      offers,
      hasTvAccess: true,
      hasCombinationAccess: true,
      dailyLimit: Number.POSITIVE_INFINITY,
      usedToday: state.usage.count,
      remainingToday: Number.POSITIVE_INFINITY,
      canGenerate: true,
      reason: null,
    };
  }

  if (trialActive) {
    const remaining = Math.max(0, quotas.trialDailyLimit - state.usage.count);
    return {
      trialActive: true,
      trialEndsAt: subscription.trialEndsAt,
      offers,
      hasTvAccess: true,
      hasCombinationAccess: true,
      dailyLimit: quotas.trialDailyLimit,
      usedToday: state.usage.count,
      remainingToday: remaining,
      canGenerate: remaining > 0,
      reason: remaining > 0 ? null : "trial-daily-limit",
    };
  }

  if (hasCombinationAccess) {
    const remaining = Math.max(0, quotas.premiumDailyLimit - state.usage.count);
    return {
      trialActive: false,
      trialEndsAt: subscription.trialEndsAt,
      offers,
      hasTvAccess,
      hasCombinationAccess: true,
      dailyLimit: quotas.premiumDailyLimit,
      usedToday: state.usage.count,
      remainingToday: remaining,
      canGenerate: remaining > 0,
      reason: remaining > 0 ? null : "offer-daily-limit",
    };
  }

  return {
    trialActive: false,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    offers,
    hasTvAccess,
    hasCombinationAccess: false,
    dailyLimit: 0,
    usedToday: state.usage.count,
    remainingToday: 0,
    canGenerate: false,
    reason: "no-offer",
  };
}

/** Calcule les droits d'un visiteur non connecté à partir de son compteur invité. */
export function computeGuestEntitlements(
  used: number,
  quotas: QuotaSettings = defaultQuotaSettings()
): ServerEntitlements {
  const remaining = Math.max(0, quotas.guestLimit - used);
  return {
    trialActive: false,
    trialEndsAt: null,
    offers: [],
    hasTvAccess: false,
    hasCombinationAccess: false,
    dailyLimit: quotas.guestLimit,
    usedToday: used,
    remainingToday: remaining,
    canGenerate: remaining > 0,
    reason: remaining > 0 ? null : "no-offer",
  };
}

export interface ConsumeResult {
  accepted: number;
  entitlements: ServerEntitlements;
}

/**
 * Consomme `requested` générations du quota courant de façon **atomique** :
 * la lecture et l'écriture du compteur ont lieu dans une même transaction, ce qui
 * empêche tout dépassement en cas de requêtes simultanées.
 *
 * Ne consomme rien si le quota est insuffisant.
 */
export async function consumeCombinations(
  db: Firestore,
  accountKey: string,
  requested: number,
  isAdmin: boolean,
  quotas: QuotaSettings = defaultQuotaSettings()
): Promise<ConsumeResult> {
  const today = localDay();
  const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(accountKey);
  const usageRef = db.collection(USAGE_COLLECTION).doc(accountKey);

  return db.runTransaction(async transaction => {
    const [subscriptionSnapshot, usageSnapshot] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(usageRef),
    ]);

    let subscription = toSubscription(subscriptionSnapshot.data());
    let state: LoadedState = { subscription, usage: toUsage(usageSnapshot.data(), today) };

    // Démarre l'essai à la première génération si l'abonnement n'existe pas encore.
    if (!subscription && !isAdmin) {
      const startedAt = today;
      subscription = {
        trialStartedAt: startedAt,
        trialEndsAt: addDaysIso(startedAt, TRIAL_DAYS),
        offers: [],
      };
      transaction.set(subscriptionRef, subscription, { merge: true });
      state = { subscription, usage: state.usage };
    }

    const entitlements = computeEntitlements(state, isAdmin, quotas);
    if (!Number.isSafeInteger(requested) || requested <= 0) {
      return { accepted: 0, entitlements };
    }
    if (!Number.isFinite(entitlements.remainingToday)) {
      return { accepted: requested, entitlements };
    }
    if (entitlements.remainingToday < requested) {
      return { accepted: 0, entitlements };
    }

    const nextCount = state.usage.count + requested;
    transaction.set(usageRef, { day: today, count: nextCount }, { merge: true });

    const updated: LoadedState = { subscription: state.subscription, usage: { day: today, count: nextCount } };
    return { accepted: requested, entitlements: computeEntitlements(updated, isAdmin, quotas) };
  });
}

/** Consomme `requested` générations du quota invité (transaction atomique). */
export async function consumeGuestCombinations(
  db: Firestore,
  guestId: string,
  requested: number,
  quotas: QuotaSettings = defaultQuotaSettings()
): Promise<ConsumeResult> {
  const today = localDay();
  const accountKey = `guest:${guestId}`;
  const usageRef = db.collection(USAGE_COLLECTION).doc(accountKey);

  return db.runTransaction(async transaction => {
    const usageSnapshot = await transaction.get(usageRef);
    const used = toUsage(usageSnapshot.data(), today).count;
    const entitlements = computeGuestEntitlements(used, quotas);

    if (!Number.isSafeInteger(requested) || requested <= 0) {
      return { accepted: 0, entitlements };
    }
    if (entitlements.remainingToday < requested) {
      return { accepted: 0, entitlements };
    }

    const nextCount = used + requested;
    transaction.set(usageRef, { day: today, count: nextCount }, { merge: true });
    return { accepted: requested, entitlements: computeGuestEntitlements(nextCount, quotas) };
  });
}
