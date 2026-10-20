import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Intégration Flutterwave (API v3).
 *
 * Deux clés sont utilisées, avec des rôles strictement séparés :
 *  - la clé **publique** (`NEXT_PUBLIC_FLW_PUBLIC_KEY`) sert à ouvrir la modale de
 *    paiement dans le navigateur : elle est visible par conception ;
 *  - la clé **secrète** (`FLW_SECRET_KEY`) reste sur le serveur et n'est JAMAIS
 *    exposée. Elle sert à vérifier les transactions avant d'activer une offre.
 *
 * La clé de chiffrement (`FLW_ENCRYPTION_KEY`) et le `verif-hash` (`FLW_WEBHOOK_HASH`)
 * ne sont utiles qu'aux appels directs par carte et à la validation des webhooks ;
 * ils ne transitent jamais par le client.
 *
 * Principe de sécurité appliqué partout : une offre n'est activée qu'après
 * vérification serveur d'une transaction réellement encaissée, dont la référence,
 * le montant et la devise correspondent à ce qui a été demandé.
 */

export const FLW_API_BASE = "https://api.flutterwave.com/v3";

/** Devise des offres : le franc CFA, accepté par Flutterwave sur ce compte. */
export const FLW_CURRENCY = "XOF";

export interface FlutterwaveConfig {
  publicKey: string | null;
  secretKey: string | null;
  webhookHash: string | null;
  /** Vrai si le paiement réel est possible (clé secrète présente). */
  enabled: boolean;
  /** Vrai si la clé publique est présente pour ouvrir la modale côté client. */
  inlineReady: boolean;
  /** Vrai si l'on peut valider un webhook (`verif-hash`). */
  webhookReady: boolean;
}

/** Lit la configuration Flutterwave depuis l'environnement. */
export function readFlutterwaveConfig(): FlutterwaveConfig {
  const publicKey = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY?.trim() || null;
  const secretKey = process.env.FLW_SECRET_KEY?.trim() || null;
  const webhookHash = process.env.FLW_WEBHOOK_HASH?.trim() || null;
  return {
    publicKey,
    secretKey,
    webhookHash,
    enabled: !!secretKey,
    inlineReady: !!publicKey,
    webhookReady: !!webhookHash,
  };
}

/**
 * Clé publique exposée au navigateur.
 *
 * Elle est lue depuis `NEXT_PUBLIC_FLW_PUBLIC_KEY`. Le repli ci-dessous n'est
 * utilisé que si la variable n'est pas définie, afin que la modale fonctionne
 * dès le premier lancement : une clé publique n'est pas un secret.
 */
export function publicKeyForClient(): string | null {
  return readFlutterwaveConfig().publicKey || DEFAULT_PUBLIC_KEY;
}

const DEFAULT_PUBLIC_KEY = "FLWPUBK_TEST-41a051c094870f5b3ecc48a799a2b4b9-X";

/** Transparence : les montants Flutterwave sont en unité entière (pas de centimes pour XOF). */
export function toFlutterwaveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant de paiement invalide.");
  }
  return Math.round(amount);
}

export interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  payment_type?: string;
  customer?: { email?: string };
}

interface VerifyApiResponse {
  status?: string;
  message?: string;
  data?: FlutterwaveTransaction;
}

export type VerifyOutcome =
  | { outcome: "paid"; transaction: FlutterwaveTransaction }
  | { outcome: "pending" }
  | { outcome: "failed"; reason: string };

/**
 * Vérifie une transaction auprès de Flutterwave, par identifiant.
 *
 * Contrôles effectués (tous obligatoires) :
 *  1. le statut renvoyé par Flutterwave est `successful` ;
 *  2. la référence `tx_ref` correspond exactement à celle attendue ;
 *  3. la devise correspond à celle demandée ;
 *  4. le montant encaissé est **au moins égal** au montant attendu.
 */
export async function verifyTransaction(
  transactionId: string,
  expected: { txRef: string; amount: number; currency?: string }
): Promise<VerifyOutcome> {
  const config = readFlutterwaveConfig();
  if (!config.secretKey) {
    return { outcome: "failed", reason: "payment-not-configured" };
  }
  if (!/^\d{1,32}$/.test(transactionId)) {
    return { outcome: "failed", reason: "invalid-transaction-id" };
  }

  let response: Response;
  try {
    response = await fetch(`${FLW_API_BASE}/transactions/${transactionId}/verify`, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error("Vérification Flutterwave injoignable.", error);
    return { outcome: "failed", reason: "gateway-unreachable" };
  }

  const payload = (await response.json().catch(() => ({}))) as VerifyApiResponse;
  if (!response.ok || payload.status !== "success" || !payload.data) {
    console.error("Vérification Flutterwave refusée.", response.status, payload.message);
    return { outcome: "failed", reason: "verification-rejected" };
  }

  const transaction = payload.data;
  // Une transaction non encore finalisée (paiement par virement, etc.) n'est ni
  // un succès ni un échec : on invite le client à réessayer la vérification.
  if (transaction.status === "pending" || transaction.status === "processing") {
    return { outcome: "pending" };
  }
  if (transaction.status !== "successful") {
    return { outcome: "failed", reason: "not-successful" };
  }
  if (transaction.tx_ref !== expected.txRef) {
    return { outcome: "failed", reason: "reference-mismatch" };
  }
  const currency = expected.currency ?? FLW_CURRENCY;
  if ((transaction.currency || "").toUpperCase() !== currency.toUpperCase()) {
    return { outcome: "failed", reason: "currency-mismatch" };
  }
  if (Number(transaction.amount) < expected.amount) {
    return { outcome: "failed", reason: "amount-mismatch" };
  }
  return { outcome: "paid", transaction };
}

/**
 * Valide la signature d'un webhook Flutterwave.
 *
 * Flutterwave envoie le `verif-hash` configuré dans votre tableau de bord dans
 * l'en-tête `verif-hash`. On le compare en temps constant pour éviter une attaque
 * par mesure de temps. Sans `verif-hash` configuré, **tout webhook est rejeté** :
 * aucune donnée n'est acceptée d'une source non authentifiée.
 */
export function isValidWebhookSignature(provided: string | null): boolean {
  const expected = readFlutterwaveConfig().webhookHash;
  if (!expected || !provided) return false;
  // Comparaison à longueur constante, insensible au contenu.
  const expectedDigest = createHash("sha256").update(expected).digest();
  const providedDigest = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}
