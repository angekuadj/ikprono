import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, principalKey } from "@/lib/server/identity";
import {
  computeEntitlements,
  ensureTrial,
  isAdminUser,
  loadState,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import { loadQuotaSettings } from "@/lib/server/quotaSettings";
import { verifyTransaction } from "@/lib/server/flutterwave";
import {
  markPaymentPaid,
  paymentsDb,
  readPaymentIntent,
  recordTransactionId,
} from "@/lib/server/payments";

/**
 * Vérifie un paiement Flutterwave et active l'offre **seulement** si le paiement
 * est confirmé.
 *
 * C'est le seul point d'activation d'une offre par paiement. La confiance accordée
 * au client se limite à la référence `tx_ref` et à l'identifiant de transaction :
 * le montant, la devise et l'offre proviennent de l'intention enregistrée côté
 * serveur, puis sont recoupés avec la réponse de Flutterwave.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json(
      { error: "Connectez-vous pour finaliser votre paiement.", code: "auth-required" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const txRef = (payload as { txRef?: unknown } | null)?.txRef;
  const transactionId = (payload as { transactionId?: unknown } | null)?.transactionId;

  if (typeof txRef !== "string" || typeof transactionId !== "string") {
    return NextResponse.json({ error: "Référence de paiement invalide." }, { status: 400 });
  }

  const db = await paymentsDb();
  if (!db) {
    return NextResponse.json(
      { error: "Le paiement n'est pas configuré sur ce serveur.", code: "payment-not-configured" },
      { status: 503 }
    );
  }

  const accountKey = principalKey(principal);
  try {
    const intent = await readPaymentIntent(db, txRef);
    // Une référence inconnue, ou rattachée à un autre compte, est refusée sans
    // révéler laquelle des deux conditions a échoué.
    if (!intent || intent.accountKey !== accountKey) {
      return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
    }

    // Idempotence : un paiement déjà confirmé réactive simplement l'offre sans
    // repasser par Flutterwave.
    if (intent.status === "paid") {
      const quotas = await loadQuotaSettings(db);
      const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
      const updated = await setStoredOffer(db, accountKey, intent.offer, state);
      return NextResponse.json({
        status: "paid",
        offer: intent.offer,
        alreadyConfirmed: true,
        entitlements: computeEntitlements(updated, await isAdminUser(db, accountKey), quotas),
      });
    }

    const verification = await verifyTransaction(transactionId, {
      txRef: intent.txRef,
      amount: intent.amount,
      currency: intent.currency,
    });

    // L'identifiant est conservé dès qu'il est connu : si la vérification reste en
    // suspens (virement, 3DS), `/api/checkout/recover` pourra la reprendre.
    await recordTransactionId(db, intent.txRef, transactionId);

    if (verification.outcome === "pending") {
      return NextResponse.json(
        { status: "pending", error: "Le paiement est encore en cours de traitement. Réessayez dans un instant." },
        { status: 202 }
      );
    }
    if (verification.outcome === "failed") {
      console.error("Paiement non confirmé.", verification.reason, txRef);
      return NextResponse.json(
        { status: "failed", error: "Le paiement n'a pas pu être confirmé." },
        { status: 402 }
      );
    }

    const paid = await markPaymentPaid(db, txRef, transactionId);
    if (!paid) {
      return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
    }

    // Activation de l'offre : le montant confirmé est celui de l'intention.
    const quotas = await loadQuotaSettings(db);
    const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const updated = await setStoredOffer(db, accountKey, paid.offer, state);

    return NextResponse.json({
      status: "paid",
      offer: paid.offer,
      amount: paid.amount,
      currency: paid.currency,
      entitlements: computeEntitlements(updated, await isAdminUser(db, accountKey), quotas),
    });
  } catch (error) {
    console.error("Vérification du paiement impossible.", error);
    return NextResponse.json(
      { error: "Impossible de vérifier le paiement pour le moment." },
      { status: 502 }
    );
  }
}
