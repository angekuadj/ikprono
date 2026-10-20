import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { SubscriptionOffer } from "@/lib/subscription";
import { getAdminDb, isAdminConfigured } from "@/lib/server/subscriptionStore";
import { COMBINATIONS_MONTHLY_PRICE_FCFA, PACK_MONTHLY_PRICE_FCFA, TV_DAILY_PRICE_FCFA } from "@/lib/subscription";

/**
 * Suivi des intentions de paiement.
 *
 * Le montant et l'offre ne sont **jamais** acceptés depuis le client au moment de
 * l'activation : ils sont fixés ici, à la création du paiement, à partir de la
 * grille tarifaire du serveur. La vérification compare ensuite la transaction
 * Flutterwave à cette intention enregistrée.
 */

export const PAYMENTS_COLLECTION = "payments";

export interface PaymentIntent {
  /** Référence unique transmise à Flutterwave (`tx_ref`). */
  txRef: string;
  accountKey: string;
  offer: SubscriptionOffer;
  /** Montant attendu, en FCFA, tel qu'envoyé à Flutterwave. */
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt?: string;
  /** Identifiant Flutterwave de la transaction confirmée. */
  transactionId?: string;
  /** E-mail du payeur, pour le suivi dans l'administration. */
  customerEmail?: string;
}

/** Grille tarifaire serveur : source unique des montants facturés. */
export function priceForOffer(offer: SubscriptionOffer): number {
  switch (offer) {
    case "tv":
      return TV_DAILY_PRICE_FCFA;
    case "combinations":
      return COMBINATIONS_MONTHLY_PRICE_FCFA;
    case "pack":
      return PACK_MONTHLY_PRICE_FCFA;
  }
}

/** Référence unique et lisible : `ikprono-<offre>-<horodatage>-<aléa>`. */
export function createTxRef(offer: SubscriptionOffer): string {
  const suffix = randomBytes(5).toString("hex");
  return `ikprono-${offer}-${Date.now()}-${suffix}`;
}

/** Base Firestore Admin, ou null si le serveur n'a pas d'identifiants. */
export async function paymentsDb(): Promise<Firestore | null> {
  if (!(await isAdminConfigured())) return null;
  return getAdminDb();
}

/** Enregistre une nouvelle intention de paiement (statut `pending`). */
export async function createPaymentIntent(
  db: Firestore,
  intent: Omit<PaymentIntent, "status" | "createdAt">
): Promise<PaymentIntent> {
  const document: PaymentIntent = {
    ...intent,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await db.collection(PAYMENTS_COLLECTION).doc(document.txRef).set(document);
  return document;
}

/** Relit une intention de paiement, ou null si elle est inconnue. */
export async function readPaymentIntent(
  db: Firestore,
  txRef: string
): Promise<PaymentIntent | null> {
  if (!/^ikprono-[a-z]+-\d+-[a-f0-9]{10}$/.test(txRef)) return null;
  const snapshot = await db.collection(PAYMENTS_COLLECTION).doc(txRef).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as PaymentIntent;
}

/**
 * Marque une intention comme payée. Idempotent : un paiement déjà confirmé n'est
 * jamais rejoué, ce qui évite d'activer deux fois la même offre.
 */
export async function markPaymentPaid(
  db: Firestore,
  txRef: string,
  transactionId: string
): Promise<PaymentIntent | null> {
  const reference = db.collection(PAYMENTS_COLLECTION).doc(txRef);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const intent = snapshot.data() as PaymentIntent;
    if (intent.status === "paid") return intent;
    const updated: PaymentIntent = {
      ...intent,
      status: "paid",
      paidAt: new Date().toISOString(),
      transactionId,
    };
    transaction.set(reference, updated);
    return updated;
  });
}

/**
 * Enregistre l'identifiant de transaction renvoyé par la modale, avant même la
 * vérification. Cela permet à `/api/checkout/recover` de reprendre un paiement
 * resté en suspens si le navigateur a été fermé entre-temps.
 */
export async function recordTransactionId(
  db: Firestore,
  txRef: string,
  transactionId: string
): Promise<void> {
  const reference = db.collection(PAYMENTS_COLLECTION).doc(txRef);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const intent = snapshot.data() as PaymentIntent;
    if (intent.transactionId === transactionId) return;
    transaction.set(reference, { ...intent, transactionId });
  });
}

/** Historique des paiements d'un compte, du plus récent au plus ancien. */
export async function listAccountPayments(
  db: Firestore,
  accountKey: string,
  limit = 20
): Promise<PaymentIntent[]> {
  const snapshot = await db
    .collection(PAYMENTS_COLLECTION)
    .where("accountKey", "==", accountKey)
    .limit(limit)
    .get();
  return snapshot.docs
    .map(document => document.data() as PaymentIntent)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}
