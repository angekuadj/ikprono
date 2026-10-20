"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  getFirebaseAuth,
  isFirebaseAuthConfigured,
  signInWithGooglePopup,
  translateFirebaseError,
} from "@/lib/firebaseAuth";
import { ensureUserProfile, updateUserProfile, getUserProfile } from "@/lib/firestore";
import { startBasketSync } from "@/lib/basketSync";
import { generateUUID } from "@/lib/uuid";
import { getJson, postJson } from "@/lib/apiClient";
import {
  GUEST_COMBINATION_COUNT_KEY,
  GUEST_COMBINATION_LIMIT,
  clearSubscription,
  ensureTrialStarted,
  entitlementsFromServer,
  getEntitlements,
  readSubscription,
  subscribeToSubscriptionChanges,
  toggleOffer,
  writeSubscription,
  type Entitlements,
  type ServerEntitlements,
  type SubscriptionOffer,
} from "@/lib/subscription";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan?: "standard" | "premium";
  createdAt: string;
  phoneNumber?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  register: (email: string, password: string, name: string) => Promise<User>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (name: string, email: string) => User;
  logout: () => void;
  proposalCount: number;
  remainingProposals: number;
  recordProposals: (count: number) => number;
  /** Droits d'accès courants : essai, offres TV/Combinaisons, quota journalier. */
  entitlements: Entitlements;
  /** Active ou désactive une offre (simulation de paiement). */
  setOffer: (offer: SubscriptionOffer) => Promise<void>;
  /** Recharge les droits depuis le serveur (source de vérité). */
  refreshEntitlements: () => Promise<void>;
  /** Recharge le profil utilisateur depuis Firestore (pour mettre à jour le rôle admin). */
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface StoredAccount {
  user: User;
  salt: string;
  passwordHash: string;
}

const DEMO_USERS: User[] = [
  {
    id: "1",
    email: "user@ikprono.com",
    name: "Utilisateur Test",
    role: "user",
    createdAt: "2026-10-01T00:00:00Z"
  },
  {
    id: "gpD540FgRnM7rfR0EbC0zOO0xpf1",
    email: "admin@ikprono.com",
    name: "Administrateur",
    role: "admin",
    plan: "premium",
    createdAt: "2026-09-01T00:00:00Z"
  }
];

const DEMO_PASSWORDS: Record<string, string> = {
  "user@ikprono.com": "user123",
  "admin@ikprono.com": "Sfm3h%e-69*L?Pup-6r#"
};

/**
 * Les comptes de démonstration ne servent qu'au développement local, quand
 * Firebase n'est pas configuré. En production, leurs identifiants sont codés en
 * dur dans le bundle : ils sont donc désactivés pour éviter tout accès non
 * prévu (le compte de démo est administrateur).
 *
 * `NODE_ENV` vaut "production" pour tout build servi aux visiteurs.
 */
const DEMO_ACCOUNTS_ENABLED = process.env.NODE_ENV !== "production";

const USERS_STORAGE_KEY = "ikprono_users";
const SESSION_STORAGE_KEY = "ikprono_user";
const PROPOSAL_COUNT_PREFIX = "ikprono_proposals_";
const DEMO_PROFILE_OVERRIDES_KEY = "ikprono_demo_profiles";
const FREE_PROPOSAL_LIMIT = 3;

function readGuestCombinationCount(): number {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return 0;
  const value = Number(localStorage.getItem(GUEST_COMBINATION_COUNT_KEY) ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readSubscriptionOnce(accountId: string): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined" && localStorage.getItem(`ikprono_subscription_${accountId}`) !== null;
}
function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<User>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.name === "string" &&
    (candidate.role === "user" || candidate.role === "admin") &&
    (candidate.plan === undefined ||
      candidate.plan === "standard" ||
      candidate.plan === "premium") &&
    typeof candidate.createdAt === "string"
  );
}

function readProposalCount(userId: string): number {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return 0;
  const value = Number(localStorage.getItem(`${PROPOSAL_COUNT_PREFIX}${userId}`) ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readAccounts(): StoredAccount[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  const storedAccounts = localStorage.getItem(USERS_STORAGE_KEY);
  if (!storedAccounts) return [];

  try {
    const parsed: unknown = JSON.parse(storedAccounts);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (account): account is StoredAccount =>
          typeof account === "object" &&
          account !== null &&
          isUser((account as StoredAccount).user) &&
          typeof (account as StoredAccount).salt === "string" &&
          typeof (account as StoredAccount).passwordHash === "string"
      )
    ) {
      return parsed;
    }
  } catch (error) {
    console.error("Impossible de lire les comptes enregistrés.", error);
  }

  localStorage.removeItem(USERS_STORAGE_KEY);
  return [];
}

function readDemoProfileOverrides(): User[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  const stored = localStorage.getItem(DEMO_PROFILE_OVERRIDES_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isUser)) return parsed;
    throw new Error("Format de profil invalide.");
  } catch (error) {
    console.error("Impossible de lire les profils de démonstration.", error);
    localStorage.removeItem(DEMO_PROFILE_OVERRIDES_KEY);
    return [];
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = `${salt}:${password}`;

  // Try to use crypto.subtle if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
      return Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    } catch (e) {
      console.warn("crypto.subtle failed, falling back to simple hash", e);
    }
  }

  // Fallback: simple hash function for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function createSalt(): string {
  // Try to use crypto.getRandomValues if available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn("crypto.getRandomValues failed, falling back to Math.random", e);
    }
  }

  // Fallback: use Math.random to generate salt
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [proposalCount, setProposalCount] = useState(0);
  const [guestCombinationCount, setGuestCombinationCount] = useState(0);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [serverEntitlements, setServerEntitlements] = useState<ServerEntitlements | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

  // Abonnement à Firebase Auth (si configuré).
  useEffect(() => {
    if (!isFirebaseAuthConfigured()) {
      setFirebaseReady(true);
      return;
    }

    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setFirebaseUser(null);
        setFirebaseReady(true);
        return;
      }
      try {
        const profile = await ensureUserProfile(fbUser);
        setFirebaseUser(profile);
      } catch (error) {
        console.error("Impossible de charger le profil Firestore.", error);
        setFirebaseUser({
          id: `firebase:${fbUser.uid}`,
          email: fbUser.email?.trim().toLowerCase() ?? "",
          name: fbUser.displayName?.trim() || fbUser.email?.split("@")[0] || "Utilisateur",
          role: "user",
          plan: "standard",
          createdAt: new Date().toISOString(),
        });
      }
      setFirebaseReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Firebase Auth est la source de vérité quand il est configuré.
    if (isFirebaseAuthConfigured()) {
      if (!firebaseReady) {
        setIsLoading(true);
        return;
      }
      if (firebaseUser) {
        setUser(firebaseUser);
        setProposalCount(readProposalCount(firebaseUser.id));
      } else {
        setUser(null);
        setProposalCount(readProposalCount("guest"));
      }
      setIsLoading(false);
      return;
    }

    try {
      if (typeof window === "undefined" || typeof localStorage === "undefined") {
        setProposalCount(readProposalCount("guest"));
        setIsLoading(false);
        return;
      }
      const storedUser =
        localStorage.getItem(SESSION_STORAGE_KEY) ??
        sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (storedUser) {
        const parsed: unknown = JSON.parse(storedUser);
        if (isUser(parsed)) {
          const restoredUser = {
            ...parsed,
            // Premium à vie : le rôle admin porte toujours le plan premium.
            plan: parsed.role === "admin" ? "premium" : parsed.plan ?? "standard",
          };
          setUser(restoredUser);
          setProposalCount(readProposalCount(restoredUser.id));
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } else {
        setProposalCount(readProposalCount("guest"));
      }
    } catch (error) {
      console.error("Impossible de restaurer la session.", error);
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setIsLoading(false);
  }, [firebaseUser, firebaseReady]);

  // Suit les changements d'abonnement (même onglet et autres onglets).
  useEffect(() => {
    const refresh = () => {
      setGuestCombinationCount(readGuestCombinationCount());
      setSubscriptionVersion(version => version + 1);
    };
    refresh();
    return subscribeToSubscriptionChanges(refresh);
  }, []);

  // Démarre l'essai de 3 jours à la première connexion, et remet à zéro
  // le compteur invité (qui ne concerne que les visiteurs non connectés).
  useEffect(() => {
    if (!user) return;
    const created = !readSubscriptionOnce(user.id);
    if (created) {
      ensureTrialStarted(user.id);
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.removeItem(GUEST_COMBINATION_COUNT_KEY);
      }
      setGuestCombinationCount(0);
      setSubscriptionVersion(version => version + 1);
    }
  }, [user]);

  // Synchronise le panier (localStorage ↔ Firestore) pour les comptes connectés :
  // le panier est ainsi retrouvé sur tous les appareils de l'utilisateur.
  const syncedAccountId = user?.id.startsWith("firebase:") ? user.id : null;
  useEffect(() => {
    if (!syncedAccountId) return;
    return startBasketSync(syncedAccountId);
  }, [syncedAccountId]);

  // Récupère les droits calculés par le serveur (source de vérité) : essai,
  // offres actives et quota du jour. Rechargé à chaque changement de compte.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getJson("/api/subscription");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          entitlements?: ServerEntitlements;
          serverEnforced?: boolean;
        };
        if (cancelled) return;
        setServerEntitlements(payload.serverEnforced && payload.entitlements ? payload.entitlements : null);
      } catch (error) {
        if (!cancelled) console.error("Impossible de charger les droits depuis le serveur.", error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, subscriptionVersion]);

  const saveSession = (account: User, rememberMe: boolean) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      setUser(account);
      setProposalCount(readProposalCount(account.id));
      return;
    }
    const storage = rememberMe ? localStorage : sessionStorage;
    const otherStorage = rememberMe ? sessionStorage : localStorage;
    otherStorage.removeItem(SESSION_STORAGE_KEY);
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(account));
    setUser(account);
    setProposalCount(readProposalCount(account.id));
  };

  const login = async (
    email: string,
    password: string,
    rememberMe = false
  ): Promise<User> => {
    const normalizedEmail = email.trim().toLowerCase();

    // Firebase Auth (si configuré) remplace la logique locale.
    if (isFirebaseAuthConfigured()) {
      try {
        const credential = await signInWithEmailAndPassword(
          getFirebaseAuth(),
          normalizedEmail,
          password
        );
        const profile = await ensureUserProfile(credential.user);
        saveSession(profile, rememberMe);
        return profile;
      } catch (error) {
        throw new Error(translateFirebaseError(error));
      }
    }

    const demoProfiles = DEMO_ACCOUNTS_ENABLED ? readDemoProfileOverrides() : [];
    const demoUser = demoProfiles.find(
      candidate => candidate.email === normalizedEmail
    ) ?? DEMO_USERS.find(candidate =>
      DEMO_ACCOUNTS_ENABLED &&
      candidate.email === normalizedEmail &&
      !demoProfiles.some(profile => profile.id === candidate.id)
    );
    let foundUser: User | undefined;

    const demoOriginalUser = demoUser && DEMO_USERS.find(candidate => candidate.id === demoUser.id);
    const storedDemoProfile = demoProfiles.find(candidate => candidate.id === demoUser?.id);

    if (
      DEMO_ACCOUNTS_ENABLED &&
      demoUser &&
      !readAccounts().some(account => account.user.email === normalizedEmail) &&
      (storedDemoProfile ? storedDemoProfile.email === normalizedEmail : demoUser.email === normalizedEmail) &&
      DEMO_PASSWORDS[demoOriginalUser?.email ?? normalizedEmail] === password
    ) {
      foundUser = demoUser;
    } else {
      const account = readAccounts().find(
        candidate => candidate.user.email === normalizedEmail
      );
      if (account) {
        const passwordHash = await hashPassword(password, account.salt);
        if (passwordHash === account.passwordHash) foundUser = account.user;
      }
    }

    if (!foundUser) {
      throw new Error("Email ou mot de passe incorrect");
    }

    const accountUser = {
      ...foundUser,
      plan: foundUser.role === "admin" ? "premium" : foundUser.plan ?? "standard",
    };
    saveSession(accountUser, rememberMe);
    return accountUser;
  };

  /** Connexion Google via popup Firebase (remplace le bouton NextAuth). */
  const loginWithGoogle = async (): Promise<User> => {
    if (!isFirebaseAuthConfigured()) {
      throw new Error(
        "Firebase n'est pas configuré : renseignez les variables NEXT_PUBLIC_FIREBASE_* dans .env"
      );
    }
    try {
      const credential = await signInWithGooglePopup();
      const profile = await ensureUserProfile(credential.user);
      saveSession(profile, true);
      return profile;
    } catch (error) {
      throw new Error(translateFirebaseError(error));
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    if (!isFirebaseAuthConfigured()) {
      throw new Error(
        "La réinitialisation du mot de passe n'est pas disponible car Firebase n'est pas configuré."
      );
    }
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim().toLowerCase());
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "auth/user-not-found") return;
      throw new Error(translateFirebaseError(error));
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string
  ): Promise<User> => {
    const normalizedEmail = email.trim().toLowerCase();

    // Firebase Auth (si configuré) : création du compte + profil Firestore.
    if (isFirebaseAuthConfigured()) {
      try {
        const credential = await createUserWithEmailAndPassword(
          getFirebaseAuth(),
          normalizedEmail,
          password
        );
        if (name.trim()) {
          await updateFirebaseProfile(credential.user, { displayName: name.trim() });
        }
        const profile = await ensureUserProfile(credential.user);
        const namedProfile = name.trim() ? { ...profile, name: name.trim() } : profile;
        if (name.trim()) {
          await updateUserProfile(credential.user.uid, { name: name.trim() }).catch(
            error => console.error("Impossible d'enregistrer le nom dans Firestore.", error)
          );
        }
        saveSession(namedProfile, true);
        return namedProfile;
      } catch (error) {
        throw new Error(translateFirebaseError(error));
      }
    }

    const registeredAccounts = readAccounts();
    if (
      (DEMO_ACCOUNTS_ENABLED && DEMO_USERS.some(account => account.email === normalizedEmail)) ||
      registeredAccounts.some(account => account.user.email === normalizedEmail)
    ) {
      throw new Error("Un compte utilise déjà cette adresse email");
    }

    const salt = createSalt();
    const newUser: User = {
      id: generateUUID(),
      email: normalizedEmail,
      name: name.trim(),
      role: "user",
      plan: "standard",
      createdAt: new Date().toISOString()
    };
    const newAccount: StoredAccount = {
      user: newUser,
      salt,
      passwordHash: await hashPassword(password, salt)
    };

    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.setItem(
        USERS_STORAGE_KEY,
        JSON.stringify([...registeredAccounts, newAccount])
      );
      const guestProposalCount = readProposalCount("guest");
      if (guestProposalCount > 0) {
        localStorage.setItem(`${PROPOSAL_COUNT_PREFIX}${newUser.id}`, String(guestProposalCount));
        localStorage.removeItem(`${PROPOSAL_COUNT_PREFIX}guest`);
      }
    }
    saveSession(newUser, true);
    return newUser;
  };

  const updateProfile = (name: string, email: string): User => {
    if (!user) throw new Error("Connectez-vous pour modifier votre profil.");
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedName) throw new Error("Le nom est obligatoire.");
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("Adresse e-mail invalide.");

    // Compte Firebase : mise à jour distante (fire-and-forget) + état local.
    if (isFirebaseAuthConfigured() && user.id.startsWith("firebase:")) {
      const uid = user.id.slice("firebase:".length);
      const auth = getFirebaseAuth();
      if (auth.currentUser?.displayName !== normalizedName) {
        void updateFirebaseProfile(auth.currentUser!, { displayName: normalizedName }).catch(
          error => console.error("Impossible de mettre à jour le nom Firebase.", error)
        );
      }
      const updatedUser = { ...user, name: normalizedName, email: normalizedEmail };
      void updateUserProfile(uid, { name: normalizedName, email: normalizedEmail }).catch(
        error => console.error("Impossible de mettre à jour le profil Firestore.", error)
      );
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        const sessionStore = localStorage.getItem(SESSION_STORAGE_KEY) ? localStorage : sessionStorage;
        sessionStore.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedUser));
      }
      setUser(updatedUser);
      setFirebaseUser(updatedUser);
      return updatedUser;
    }

    const accounts = readAccounts();
    const duplicateAccount = accounts.some(
      account => account.user.id !== user.id && account.user.email === normalizedEmail
    );
    const demoProfiles = DEMO_ACCOUNTS_ENABLED ? readDemoProfileOverrides() : [];
    const duplicateDemo = DEMO_ACCOUNTS_ENABLED && DEMO_USERS.some(candidate => {
      const currentDemoProfile = demoProfiles.find(profile => profile.id === candidate.id) ?? candidate;
      return currentDemoProfile.id !== user.id && currentDemoProfile.email === normalizedEmail;
    });
    if (duplicateAccount || duplicateDemo) {
      throw new Error("Un compte utilise déjà cette adresse e-mail.");
    }

    const updatedUser = { ...user, name: normalizedName, email: normalizedEmail };
    const accountIndex = accounts.findIndex(account => account.user.id === user.id);
    if (accountIndex >= 0) {
      accounts[accountIndex] = { ...accounts[accountIndex], user: updatedUser };
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(accounts));
      }
    } else if (DEMO_ACCOUNTS_ENABLED && DEMO_USERS.some(candidate => candidate.id === user.id)) {
      const updatedOverrides = [
        ...demoProfiles.filter(profile => profile.id !== user.id),
        updatedUser,
      ];
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.setItem(DEMO_PROFILE_OVERRIDES_KEY, JSON.stringify(updatedOverrides));
      }
    } else {
      throw new Error("Ce compte ne peut pas être modifié.");
    }

    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const sessionStorageType = localStorage.getItem(SESSION_STORAGE_KEY) ? localStorage : sessionStorage;
      sessionStorageType.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedUser));
    }
    setUser(updatedUser);
    return updatedUser;
  };

  const logout = () => {
    setUser(null);
    setFirebaseUser(null);
    setProposalCount(readProposalCount("guest"));
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    if (isFirebaseAuthConfigured()) {
      void firebaseSignOut(getFirebaseAuth()).catch(error =>
        console.error("Déconnexion Firebase impossible.", error)
      );
    }
  };

  const remainingProposals =
    user?.plan === "premium" || user?.role === "admin"
      ? Number.POSITIVE_INFINITY
      : Math.max(0, FREE_PROPOSAL_LIMIT - proposalCount);

  const entitlementInput = {
    accountId: user?.id ?? "guest",
    isAuthenticated: !!user,
    role: user?.role,
    guestRemaining: Math.max(0, GUEST_COMBINATION_LIMIT - guestCombinationCount),
  };

  // `subscriptionVersion` force le recalcul quand l'abonnement change.
  void subscriptionVersion;
  // Les droits serveur font foi dès qu'ils sont disponibles ; sinon, repli local.
  const entitlements = serverEntitlements
    ? entitlementsFromServer(serverEntitlements)
    : getEntitlements(entitlementInput);

  const refreshEntitlements = async () => {
    try {
      const response = await getJson("/api/subscription");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        entitlements?: ServerEntitlements;
        serverEnforced?: boolean;
        isAdmin?: boolean;
      };
      setServerEntitlements(payload.serverEnforced && payload.entitlements ? payload.entitlements : null);
      setSubscriptionVersion(version => version + 1);

      // Si l'utilisateur est admin selon le serveur, mettre à jour le rôle localement
      if (payload.isAdmin && user && user.role !== "admin") {
        const adminProfile: User = {
          ...user,
          role: "admin",
          plan: "premium",
        };
        setUser(adminProfile);
        setFirebaseUser(adminProfile);
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          const sessionStore = localStorage.getItem(SESSION_STORAGE_KEY) ? localStorage : sessionStorage;
          sessionStore.setItem(SESSION_STORAGE_KEY, JSON.stringify(adminProfile));
        }
        console.log("Rôle admin appliqué depuis le serveur");
      }
    } catch (error) {
      console.error("Impossible d'actualiser les droits depuis le serveur.", error);
    }
  };

  const refreshProfile = async () => {
    // Utilise refreshEntitlements qui vérifie le rôle admin depuis le serveur
    await refreshEntitlements();
  };

  const setOffer = async (offer: SubscriptionOffer) => {
    const accountId = user?.id ?? "guest";
    if (!user) {
      throw new Error("Connectez-vous pour gérer vos offres.");
    }
    // Met à jour le stockage local (affichage immédiat) puis le serveur (source de vérité).
    const previous = readSubscription(accountId);
    ensureTrialStarted(accountId);
    toggleOffer(accountId, offer);
    setSubscriptionVersion(version => version + 1);
    try {
      const response = await postJson("/api/subscription/offer", { offer });
      if (response.ok) {
        const payload = (await response.json()) as { entitlements?: ServerEntitlements | null };
        if (payload.entitlements) setServerEntitlements(payload.entitlements);
        return;
      }
      const failure = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(failure.error || "Impossible d'enregistrer l'offre pour le moment.");
    } catch (error) {
      // Le serveur a refusé : on annule le changement local pour ne pas afficher
      // une offre qui ne sera jamais active.
      if (previous) {
        writeSubscription(accountId, previous);
      } else {
        clearSubscription(accountId);
      }
      setSubscriptionVersion(version => version + 1);
      console.error("Impossible d'enregistrer l'offre côté serveur.", error);
      throw error instanceof Error ? error : new Error("Impossible d'enregistrer l'offre pour le moment.");
    }
  };

  const recordProposals = (count: number) => {
    if (!Number.isSafeInteger(count) || count <= 0) return 0;
    const accountId = user?.id ?? "guest";
    const remaining =
      user?.plan === "premium" || user?.role === "admin"
        ? count
        : Math.max(0, FREE_PROPOSAL_LIMIT - readProposalCount(accountId));
    const acceptedCount = Math.min(count, remaining);

    if (acceptedCount > 0 && user?.plan !== "premium" && user?.role !== "admin") {
      const updatedCount = readProposalCount(accountId) + acceptedCount;
      localStorage.setItem(`${PROPOSAL_COUNT_PREFIX}${accountId}`, String(updatedCount));
      setProposalCount(updatedCount);
    }
    return acceptedCount;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        register,
        resetPassword,
        updateProfile,
        logout,
        proposalCount,
        remainingProposals,
        recordProposals,
        entitlements,
        setOffer,
        refreshEntitlements,
        refreshProfile,
        isAuthenticated: !!user,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
