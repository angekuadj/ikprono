import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, principalKey } from "@/lib/server/identity";
import {
  computeEntitlements,
  ensureTrial,
  getAdminDb,
  isAdminConfigured,
  isAdminUser,
  loadState,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import type { SubscriptionOffer } from "@/lib/subscription";

/**
 * Active ou désactive une offre pour l'utilisateur connecté.
 *
 * SÉCURITÉ : il s'agit d'une simulation de paiement — aucun prestataire n'est
 * appelé et l'offre est appliquée gratuitement. En production, cette route doit
 * vérifier le paiement (webhook opérateur) avant d'activer l'offre.
 */

export const dynamic = "force-dynamic";

function isOffer(value: unknown): value is SubscriptionOffer {
  return value === "tv" || value === "combinations";
}

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json(
      { error: "Connectez-vous pour gérer vos offres.", code: "auth-required" },
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

  const db = (await isAdminConfigured()) ? getAdminDb() : null;
  if (!db) {
    return NextResponse.json(
      { error: "Gestion des offres indisponible : identifiants serveur absents." },
      { status: 503 }
    );
  }

  const accountKey = principalKey(principal);
  try {
    const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const updated = await setStoredOffer(db, accountKey, offer, state);
    return NextResponse.json({
      entitlements: computeEntitlements(updated, await isAdminUser(db, accountKey)),
    });
  } catch (error) {
    console.error("Mise à jour de l'offre impossible.", error);
    return NextResponse.json(
      { error: "Impossible de mettre à jour l'offre pour le moment." },
      { status: 502 }
    );
  }
}
