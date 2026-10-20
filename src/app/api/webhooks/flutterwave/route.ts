import { NextRequest, NextResponse } from "next/server";
import { isValidWebhookSignature } from "@/lib/server/flutterwave";
import {
  ensureTrial,
  loadState,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import { markPaymentPaid, paymentsDb, readPaymentIntent } from "@/lib/server/payments";

/**
 * Webhook Flutterwave : confirmation du paiement côté serveur.
 *
 * Utile quand le client ferme son navigateur avant la vérification : l'offre est
 * activée dès que Flutterwave confirme le paiement.
 *
 * SÉCURITÉ : la signature `verif-hash` est obligatoire. Sans elle, la requête est
 * rejetée (401) — un webhook non authentifié ne doit jamais activer une offre.
 */

export const dynamic = "force-dynamic";

interface FlutterwaveWebhookPayload {
  event?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
}

export async function POST(request: NextRequest) {
  // Flutterwave envoie le hash dans l'en-tête `verif-hash` (parfois `verif_hash`).
  const signature = request.headers.get("verif-hash")
    || request.headers.get("verif_hash")
    || request.headers.get("x-verif-hash");

  if (!isValidWebhookSignature(signature)) {
    console.warn("Webhook Flutterwave rejeté : signature absente ou invalide.");
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let payload: FlutterwaveWebhookPayload;
  try {
    payload = (await request.json()) as FlutterwaveWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const data = payload.data;
  // On n'agit que sur une transaction explicitement réussie.
  if (data?.status !== "successful" || !data.tx_ref || data.id === undefined) {
    // Réponse 200 pour éviter que Flutterwave ne réessaie indéfiniment un
    // événement que l'on ne traitera jamais (échec, remboursement, etc.).
    return NextResponse.json({ received: true, ignored: true });
  }

  const db = await paymentsDb();
  if (!db) {
    // 503 : le serveur n'est pas en mesure de traiter, Flutterwave réessaiera.
    return NextResponse.json({ error: "Serveur non configuré." }, { status: 503 });
  }

  try {
    const intent = await readPaymentIntent(db, String(data.tx_ref));
    if (!intent) {
      console.warn("Webhook Flutterwave pour une référence inconnue.", data.tx_ref);
      return NextResponse.json({ received: true, ignored: true });
    }

    // Contrôles de cohérence avec l'intention enregistrée.
    if (
      (data.currency || "").toUpperCase() !== intent.currency.toUpperCase()
      || Number(data.amount) < intent.amount
    ) {
      console.error("Webhook Flutterwave incohérent avec l'intention.", data.tx_ref);
      return NextResponse.json({ received: true, ignored: true });
    }

    const paid = await markPaymentPaid(db, intent.txRef, String(data.id));
    if (paid) {
      const state = await ensureTrial(db, paid.accountKey, await loadState(db, paid.accountKey));
      await setStoredOffer(db, paid.accountKey, paid.offer, state);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Traitement du webhook Flutterwave impossible.", error);
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
