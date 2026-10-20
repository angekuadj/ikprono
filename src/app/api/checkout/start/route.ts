import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, principalKey } from "@/lib/server/identity";
import type { SubscriptionOffer } from "@/lib/subscription";
import { publicKeyForClient, readFlutterwaveConfig, FLW_CURRENCY } from "@/lib/server/flutterwave";
import {
  createPaymentIntent,
  createTxRef,
  paymentsDb,
  priceForOffer,
} from "@/lib/server/payments";

/**
 * Prépare un paiement Flutterwave.
 *
 * Le serveur fixe le montant et l'offre à partir de sa propre grille tarifaire :
 * le client ne peut donc pas payer moins cher que le prix réel. Il renvoie ensuite
 * les paramètres de la modale Inline, sans jamais exposer la clé secrète.
 */

export const dynamic = "force-dynamic";

function isOffer(value: unknown): value is SubscriptionOffer {
  return value === "tv" || value === "combinations" || value === "pack";
}

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json(
      { error: "Connectez-vous pour souscrire à une offre.", code: "auth-required" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const offer = (payload as { offer?: unknown } | null)?.offer;
  if (!isOffer(offer)) {
    return NextResponse.json({ error: "Offre inconnue." }, { status: 400 });
  }

  const config = readFlutterwaveConfig();
  const publicKey = publicKeyForClient();
  if (!config.enabled || !publicKey) {
    return NextResponse.json(
      {
        error: "Le paiement n'est pas configuré sur ce serveur.",
        code: "payment-not-configured",
      },
      { status: 503 }
    );
  }

  const db = await paymentsDb();
  if (!db) {
    return NextResponse.json(
      {
        error: "Le paiement nécessite la configuration serveur (Firebase Admin).",
        code: "payment-not-configured",
      },
      { status: 503 }
    );
  }

  const accountKey = principalKey(principal);
  const amount = priceForOffer(offer);
  const txRef = createTxRef(offer);

  // L'e-mail n'est utilisé que pour l'affichage et le suivi : la transaction est
  // de toute façon rattachée à `accountKey`, jamais à l'e-mail.
  const emailHint = (payload as { email?: unknown } | null)?.email;
  const customerEmail = typeof emailHint === "string" && emailHint.includes("@")
    ? emailHint
    : "client@ikprono.com";

  try {
    const intent = await createPaymentIntent(db, {
      txRef,
      accountKey,
      offer,
      amount,
      currency: FLW_CURRENCY,
      customerEmail,
    });

    return NextResponse.json({
      txRef: intent.txRef,
      amount: intent.amount,
      currency: intent.currency,
      publicKey,
      offer,
      customer: { email: customerEmail },
    });
  } catch (error) {
    console.error("Préparation du paiement impossible.", error);
    return NextResponse.json(
      { error: "Impossible de préparer le paiement pour le moment." },
      { status: 502 }
    );
  }
}
