/**
 * Gestion client des offres, de l'essai gratuit de 3 jours et des quotas journaliers.
 *
 * Sémantique métier (v2) :
 *  - Un visiteur non connecté génère 2 combinaisons gratuites, puis doit se connecter.
 *  - À la première connexion, un essai de 3 jours démarre : accès complet (live + combinaisons),
 *    plafonné à 4 générations de combinaisons par jour.
 *  - Après l'essai : l'offre TV (vidéos en direct) se paie 300 FCFA par jour (accès 24 h),
 *    l'offre Combinaisons (5 générations/jour) 1 500 FCFA/mois, et le pack Combinaisons + TV
 *    3 000 FCFA/mois donne les deux accès.
 *  - Sans offre TV, l'accès aux vidéos en direct est limité aux matchs suivis dans le panier.
 */

/** Prix de l'offre TV, payé à la journée (accès aux vidéos pendant 24 h). */
export const TV_DAILY_PRICE_FCFA = 300;
/** Durée d'accès TV ouverte par un paiement à la journée. */
export const TV_ACCESS_HOURS = 24;
/** Prix de l'offre Combinaisons (mensuel). */
export const COMBINATIONS_MONTHLY_PRICE_FCFA = 1500;
/** Prix du pack Combinaisons + TV (mensuel). */
export const PACK_MONTHLY_PRICE_FCFA = 3000;

export const OFFER_LABELS = {
  tv: { fr: "Offre TV", en: "TV plan" },
  combinations: { fr: "Offre Combinaisons", en: "Combinations plan" },
} as const;

/** Nombre de combinaisons gratuites pour un visiteur non connecté. */
export const GUEST_COMBINATION_LIMIT = 2;
/** Durée de l'essai offert à la première connexion. */
export const TRIAL_DAYS = 3;
/** Nombre de combinaisons par jour pendant l'essai. */
export const TRIAL_DAILY_LIMIT = 4;
/** Nombre de combinaisons par jour avec l'offre Combinaisons. */
export const COMBINATION_DAILY_LIMIT = 5;

export const GUEST_COMBINATION_COUNT_KEY = "ikprono_guest_combination_count";
const SUBSCRIPTION_PREFIX = "ikprono_subscription_";
const USAGE_PREFIX = "ikprono_combination_usage_";
const SUBSCRIPTION_EVENT = "ikprono-subscription-change";

export type SubscriptionOffer = "tv" | "combinations" | "pack";

/** Date au format YYYY-MM-DD dans le fuseau local. */
export function localDay(date: Date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysIso(isoDay: string, days: number): string {
  const next = new Date(`${isoDay}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function storageKey(prefix: string, accountId: string) {
  return `${prefix}${accountId}`;
}

interface StoredSubscription {
  trialStartedAt: string;
  trialEndsAt: string;
  offers: SubscriptionOffer[];
  /** Fin de l'accès TV ouvert par un paiement à la journée (ISO 8601). */
  tvAccessUntil?: string;
  updatedAt?: string;
}

interface StoredUsage {
  day: string;
  count: number;
  guestCount: number;
}

function isOffer(value: unknown): value is SubscriptionOffer {
  return value === "tv" || value === "combinations" || value === "pack";
}

/** Fin de l'accès TV ouverte par un nouveau paiement à la journée. */
function nextTvAccessUntil(): string {
  return new Date(Date.now() + TV_ACCESS_HOURS * 3_600_000).toISOString();
}

/** Vrai si l'accès TV payé à la journée est encore valable. */
export function isTvDayValid(subscription: { tvAccessUntil?: string } | null | undefined): boolean {
  return !!subscription?.tvAccessUntil && Date.now() < new Date(subscription.tvAccessUntil).getTime();
}

function parseSubscription(value: string | null): StoredSubscription | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredSubscription).trialStartedAt === "string" &&
      typeof (parsed as StoredSubscription).trialEndsAt === "string" &&
      Array.isArray((parsed as StoredSubscription).offers) &&
      (parsed as StoredSubscription).offers.every(isOffer)
    ) {
      return parsed as StoredSubscription;
    }
  } catch (error) {
    console.error("Abonnement local illisible.", error);
  }
  return null;
}

export function readSubscription(accountId: string): StoredSubscription | null {
  if (typeof window === "undefined") return null;
  return parseSubscription(localStorage.getItem(storageKey(SUBSCRIPTION_PREFIX, accountId)));
}

export function writeSubscription(accountId: string, subscription: StoredSubscription): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    storageKey(SUBSCRIPTION_PREFIX, accountId),
    JSON.stringify({ ...subscription, updatedAt: new Date().toISOString() })
  );
  window.dispatchEvent(new Event(SUBSCRIPTION_EVENT));
}

/** Supprime l'abonnement local (annulation d'une tentative d'offre refusée). */
export function clearSubscription(accountId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(SUBSCRIPTION_PREFIX, accountId));
  window.dispatchEvent(new Event(SUBSCRIPTION_EVENT));
}

/**
 * Démarre l'essai à la première connexion si aucun abonnement n'existe encore.
 * Le compteur de combinaisons invité (non connecté uniquement) est alors remis à zéro.
 */
export function ensureTrialStarted(accountId: string): StoredSubscription {
  const existing = readSubscription(accountId);
  if (existing) return existing;
  const today = localDay();
  const subscription: StoredSubscription = {
    trialStartedAt: today,
    trialEndsAt: addDaysIso(today, TRIAL_DAYS),
    offers: [],
  };
  writeSubscription(accountId, subscription);
  localStorage.setItem(storageKey(USAGE_PREFIX, accountId), JSON.stringify({ day: today, count: 0, guestCount: 0 }));
  return subscription;
}

export function toggleOffer(accountId: string, offer: SubscriptionOffer): StoredSubscription | null {
  const subscription = readSubscription(accountId);
  if (!subscription) return null;
  const tvDayValid = isTvDayValid(subscription);
  let offers = subscription.offers;
  let tvAccessUntil = subscription.tvAccessUntil;

  if (subscription.offers.includes(offer)) {
    if (offer === "tv" && tvDayValid) {
      // Désactivation de l'accès TV en cours de journée.
      offers = offers.filter(item => item !== offer);
      tvAccessUntil = undefined;
    } else if (offer === "tv") {
      // Journée TV expirée : nouveau paiement pour une nouvelle journée.
      tvAccessUntil = nextTvAccessUntil();
    } else {
      offers = offers.filter(item => item !== offer);
    }
  } else {
    offers = [...offers, offer];
    if (offer === "tv") tvAccessUntil = nextTvAccessUntil();
  }

  const next: StoredSubscription = { ...subscription, offers, tvAccessUntil };
  writeSubscription(accountId, next);
  return next;
}

export function subscribeToSubscriptionChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SUBSCRIPTION_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SUBSCRIPTION_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export interface Entitlements {
  /** Essai de 3 jours en cours. */
  trialActive: boolean;
  /** Jours restants d'essai (0 si terminé ou non démarré). */
  trialDaysLeft: number;
  /** Fin de l'essai (AAAA-MM-JJ) ou null si aucun abonnement. */
  trialEndsAt: string | null;
  /** Offres souscrites. */
  offers: SubscriptionOffer[];
  /** Vidéos en direct accessibles sans restriction. */
  hasTvAccess: boolean;
  /** Offre Combinaisons active. */
  hasCombinationAccess: boolean;
  /** Quota de combinaisons par jour (Infinity si admin). */
  dailyLimit: number;
  /** Générations restantes aujourd'hui (Infinity si admin). */
  remainingToday: number;
  /** Nombre de générations déjà effectuées aujourd'hui. */
  usedToday: number;
  /** L'utilisateur a le droit de générer une combinaison maintenant. */
  canGenerate: boolean;
  /** Message à afficher quand la génération est bloquée. */
  reason: "trial-daily-limit" | "offer-daily-limit" | "no-offer" | null;
}

/**
 * Droits renvoyés par le serveur (`/api/subscription`). Ils font foi pour l'affichage
 * et remplacent le calcul local dès qu'ils sont disponibles.
 */
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

/** Convertit des droits serveur en droits client (ajoute les jours d'essai restants). */
export function entitlementsFromServer(
  server: ServerEntitlements,
  today: string = localDay()
): Entitlements {
  return {
    ...server,
    trialDaysLeft: server.trialActive && server.trialEndsAt
      ? Math.max(0, Math.round(
        (new Date(`${server.trialEndsAt}T00:00:00.000Z`).getTime()
          - new Date(`${today}T00:00:00.000Z`).getTime()) / 86_400_000
      ))
      : 0,
  };
}

interface EntitlementInput {
  accountId: string;
  isAuthenticated: boolean;
  role?: "user" | "admin";
  guestRemaining: number;
}

export function getEntitlements({
  accountId,
  isAuthenticated,
  role,
  guestRemaining,
}: EntitlementInput): Entitlements {
  const today = localDay();
  const usage = readUsage(accountId, today);
  const subscription = isAuthenticated ? readSubscription(accountId) : null;
  const trialActive = !!subscription && today < subscription.trialEndsAt;
  const hasTvAccess = !!subscription
    && (trialActive || subscription.offers.includes("pack")
      || (subscription.offers.includes("tv") && isTvDayValid(subscription)));
  const hasCombinationAccess = !!subscription
    && (trialActive || subscription.offers.includes("combinations") || subscription.offers.includes("pack"));

  if (role === "admin") {
    return {
      trialActive,
      trialDaysLeft: trialDaysLeft(subscription, today),
      trialEndsAt: subscription?.trialEndsAt ?? null,
      offers: subscription?.offers ?? [],
      hasTvAccess: true,
      hasCombinationAccess: true,
      dailyLimit: Number.POSITIVE_INFINITY,
      remainingToday: Number.POSITIVE_INFINITY,
      usedToday: usage.count,
      canGenerate: true,
      reason: null,
    };
  }

  if (!isAuthenticated) {
    return {
      trialActive: false,
      trialDaysLeft: 0,
      trialEndsAt: null,
      offers: [],
      hasTvAccess: false,
      hasCombinationAccess: false,
      dailyLimit: GUEST_COMBINATION_LIMIT,
      remainingToday: guestRemaining,
      usedToday: guestRemaining > 0 ? 0 : GUEST_COMBINATION_LIMIT,
      canGenerate: guestRemaining > 0,
      reason: guestRemaining > 0 ? null : "no-offer",
    };
  }

  if (trialActive) {
    // Même règle que côté serveur : une offre payante souscrite pendant l'essai
    // ajoute son quota à celui de l'essai (voir `computeEntitlements`).
    const paidCombinationAccess = subscription.offers.includes("combinations")
      || subscription.offers.includes("pack");
    const dailyLimit = TRIAL_DAILY_LIMIT + (paidCombinationAccess ? COMBINATION_DAILY_LIMIT : 0);
    const remainingToday = Math.max(0, dailyLimit - usage.count);
    return {
      trialActive: true,
      trialDaysLeft: trialDaysLeft(subscription, today),
      trialEndsAt: subscription.trialEndsAt,
      offers: subscription.offers,
      hasTvAccess: true,
      hasCombinationAccess: true,
      dailyLimit,
      remainingToday,
      usedToday: usage.count,
      canGenerate: remainingToday > 0,
      reason: remainingToday > 0 ? null : "trial-daily-limit",
    };
  }

  if (hasCombinationAccess) {
    const remainingToday = Math.max(0, COMBINATION_DAILY_LIMIT - usage.count);
    return {
      trialActive: false,
      trialDaysLeft: 0,
      trialEndsAt: subscription.trialEndsAt,
      offers: subscription.offers,
      hasTvAccess,
      hasCombinationAccess: true,
      dailyLimit: COMBINATION_DAILY_LIMIT,
      remainingToday,
      usedToday: usage.count,
      canGenerate: remainingToday > 0,
      reason: remainingToday > 0 ? null : "offer-daily-limit",
    };
  }

  return {
    trialActive: false,
    trialDaysLeft: 0,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    offers: subscription?.offers ?? [],
    hasTvAccess,
    hasCombinationAccess: false,
    dailyLimit: 0,
    remainingToday: 0,
    usedToday: usage.count,
    canGenerate: false,
    reason: "no-offer",
  };
}

function trialDaysLeft(subscription: StoredSubscription | null, today: string): number {
  if (!subscription || today >= subscription.trialEndsAt) return 0;
  const end = new Date(`${subscription.trialEndsAt}T00:00:00.000Z`).getTime();
  const start = new Date(`${today}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function readUsage(accountId: string, today: string): StoredUsage {
  if (typeof window === "undefined") return { day: today, count: 0, guestCount: 0 };
  try {
    const raw = localStorage.getItem(storageKey(USAGE_PREFIX, accountId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredUsage>;
      if (
        typeof parsed?.day === "string" &&
        typeof parsed.count === "number" &&
        Number.isSafeInteger(parsed.count) &&
        parsed.count >= 0
      ) {
        return { day: parsed.day, count: parsed.count, guestCount: parsed.guestCount ?? 0 };
      }
    }
  } catch (error) {
    console.error("Compteur de combinaisons illisible.", error);
  }
  return { day: today, count: 0, guestCount: 0 };
}

export interface UsageResult {
  /** Générations réellement autorisées. */
  accepted: number;
  /** Générations restantes après l'opération. */
  remaining: number;
}

function writeUsage(accountId: string, usage: StoredUsage): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(USAGE_PREFIX, accountId), JSON.stringify(usage));
  window.dispatchEvent(new Event(SUBSCRIPTION_EVENT));
}

/**
 * Consomme `requested` générations du quota du jour (ou du quota invité si non connecté)
 * et renvoie le nombre réellement accepté. Ne modifie rien si le quota est insuffisant.
 */
export function recordCombinationUsage(
  input: EntitlementInput,
  requested: number
): UsageResult {
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    const current = getEntitlements(input);
    return { accepted: 0, remaining: current.remainingToday };
  }
  const entitled = getEntitlements(input);
  if (!Number.isFinite(entitled.remainingToday)) {
    return { accepted: requested, remaining: Number.POSITIVE_INFINITY };
  }
  if (entitled.remainingToday < requested) {
    return { accepted: 0, remaining: entitled.remainingToday };
  }

  const today = localDay();
  const usage = readUsage(input.accountId, today);
  const count = usage.day === today ? usage.count : 0;
  const guestCount = usage.day === today ? usage.guestCount : 0;
  const nextUsage: StoredUsage = input.isAuthenticated
    ? { day: today, count: count + requested, guestCount }
    : { day: today, count, guestCount: guestCount + requested };
  writeUsage(input.accountId, nextUsage);

  const updated = getEntitlements(input);
  return { accepted: requested, remaining: updated.remainingToday };
}
