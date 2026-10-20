/**
 * Paramétrage des quotas de combinaisons.
 *
 * Les valeurs par défaut viennent de l'environnement (fichier .env) afin de
 * rester modifiables sans redéploiement de code. Un administrateur peut ensuite
 * les ajuster depuis `/admin/offers` : les valeurs sont alors stockées dans le
 * document Firestore `settings/quotas`, qui prime sur l'environnement.
 *
 * Trois niveaux s'appliquent, dans cet ordre de priorité :
 *   1. le mode « invité » (visiteur non connecté) — total cumulé, pas quotidien ;
 *   2. le mode « essai »  (3 premiers jours après la première connexion) ;
 *   3. le mode « premium » (offre Combinaisons ou Pack active).
 *
 * Le rôle administrateur n'est pas concerné : il reste illimité.
 */

import type { Firestore } from "firebase-admin/firestore";

export const QUOTA_SETTINGS_COLLECTION = "settings";
export const QUOTA_SETTINGS_DOCUMENT = "quotas";

export interface QuotaSettings {
  /** Nombre de combinaisons gratuites cumulées pour un visiteur non connecté. */
  guestLimit: number;
  /** Nombre de combinaisons par jour pendant l'essai gratuit. */
  trialDailyLimit: number;
  /** Nombre de combinaisons par jour avec une offre payante. */
  premiumDailyLimit: number;
  updatedAt?: string;
  updatedBy?: string;
}

/** Convertit une variable d'environnement en entier positif, sinon la valeur par défaut. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

/** Valeurs par défaut : environnement d'abord, constantes du code en repli. */
export function defaultQuotaSettings(): QuotaSettings {
  return {
    guestLimit: envInt("QUOTA_GUEST_LIMIT", 2),
    trialDailyLimit: envInt("QUOTA_TRIAL_DAILY_LIMIT", 4),
    premiumDailyLimit: envInt("QUOTA_PREMIUM_DAILY_LIMIT", 5),
  };
}

const MAX_QUOTA = 10_000;

function sanitize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fallback;
  return Math.min(value, MAX_QUOTA);
}

/** Valide et normalise un jeu de quotas reçu d'une source non fiable. */
export function normalizeQuotaSettings(
  partial: Partial<Record<keyof QuotaSettings, unknown>>,
  fallback: QuotaSettings = defaultQuotaSettings()
): QuotaSettings {
  return {
    guestLimit: sanitize(partial.guestLimit, fallback.guestLimit),
    trialDailyLimit: sanitize(partial.trialDailyLimit, fallback.trialDailyLimit),
    premiumDailyLimit: sanitize(partial.premiumDailyLimit, fallback.premiumDailyLimit),
    updatedAt: typeof partial.updatedAt === "string" ? partial.updatedAt : undefined,
    updatedBy: typeof partial.updatedBy === "string" ? partial.updatedBy : undefined,
  };
}

/**
 * Quotas effectifs : valeurs du document Firestore si présent, sinon valeurs
 * d'environnement. Ne lève jamais : en cas d'erreur de lecture, les valeurs par
 * défaut sont utilisées pour ne pas bloquer la génération de combinaisons.
 */
export async function loadQuotaSettings(db: Firestore | null): Promise<QuotaSettings> {
  const fallback = defaultQuotaSettings();
  if (!db) return fallback;
  try {
    const snapshot = await db
      .collection(QUOTA_SETTINGS_COLLECTION)
      .doc(QUOTA_SETTINGS_DOCUMENT)
      .get();
    if (!snapshot.exists) return fallback;
    return normalizeQuotaSettings(snapshot.data() ?? {}, fallback);
  } catch (error) {
    console.error("Lecture des quotas impossible, valeurs par défaut utilisées.", error);
    return fallback;
  }
}

/** Enregistre les quotas (réservé aux administrateurs, vérifié par l'appelant). */
export async function saveQuotaSettings(
  db: Firestore,
  settings: Omit<QuotaSettings, "updatedAt" | "updatedBy">,
  updatedBy: string
): Promise<QuotaSettings> {
  const normalized = normalizeQuotaSettings(settings);
  const document: QuotaSettings = {
    ...normalized,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await db
    .collection(QUOTA_SETTINGS_COLLECTION)
    .doc(QUOTA_SETTINGS_DOCUMENT)
    .set(document, { merge: true });
  return document;
}
