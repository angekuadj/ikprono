import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, principalKey } from "@/lib/server/identity";
import type { SubscriptionOffer } from "@/lib/subscription";
import { verifyTransaction } from "@/lib/server/flutterwave";
import {
  listAccountPayments,
  markPaymentPaid,
  paymentsDb,
} from "@/lib/server/payments";
import {
  computeEntitlements,
  ensureTrial,
  isAdminUser,
  loadState,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import { getAdminDb } from "@/lib/server/firebaseAdminConfig";
import { loadQuotaSettings } from "@/lib/server/quotaSettings";

/**
 * Récupération des paiements en attente.
 *
 * Si le navigateur est fermé, ou rechargé, entre le paiement et la vérification,
 * l'offre resterait inactive jusqu'au webhook. Cette route permet au client de
 * reprendre la main au chargement de la page : elle revisite les intentions
 * `pending` du compte et confirme celles réellement encaissées.
 *
 * SÉCURITÉ : rien n'est activé sur la seule foi du client. Le montant, la devise
 * et l'offre proviennent de l'intention enregistrée côté serveur, et chaque
 * transaction est de nouveau vérifiée auprès de Flutterwave.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const db = await paymentsDb();
  if (!db) {
    return NextResponse.json({ recovered: [], serverEnforced: false });
  }

  const accountKey = principalKey(principal);
  try {
    const intents = await listAccountPayments(db, accountKey, 10);
    const recovered: SubscriptionOffer[] = [];
    const pending: SubscriptionOffer[] = [];

    for (const intent of intents) {
      if (intent.status === "paid") continue;
      if (intent.status !== "pending" || !intent.transactionId) {
        pending.push(intent.offer);
        continue;
      }
      const verification = await verifyTransaction(intent.transactionId, {
        txRef: intent.txRef,
        amount: intent.amount,
        currency: intent.currency,
      });
      if (verification.outcome === "paid") {
        const paid = await markPaymentPaid(db, intent.txRef, intent.transactionId);
        if (paid) recovered.push(paid.offer);
      } else if (verification.outcome === "pending") {
        pending.push(intent.offer);
      }
    }

    if (recovered.length > 0) {
      const quotas = await loadQuotaSettings(db);
      let state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
      for (const offer of recovered) {
        state = await setStoredOffer(db, accountKey, offer, state);
      }
      return NextResponse.json({
        recovered,
        pending,
        serverEnforced: true,
        entitlements: computeEntitlements(
          state,
          await isAdminUser(db, accountKey),
          quotas
        ),
      });
    }

    return NextResponse.json({ recovered: [], pending, serverEnforced: true });
  } catch (error) {
    console.error("Récupération des paiements impossible.", error);
    return NextResponse.json(
      { error: "Impossible de vérifier les paiements en attente." },
      { status: 502 }
    );
  }
}
