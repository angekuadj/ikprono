import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, principalKey } from "@/lib/server/identity";
import {
  computeEntitlements,
  ensureTrial,
  getAdminDb,
  isAdminConfigured,
  isAdminUser,
  linkGuestToUser,
  loadState,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import type { SubscriptionOffer } from "@/lib/subscription";
import { loadQuotaSettings } from "@/lib/server/quotaSettings";

/**
 * Active ou désactive une offre pour l'utilisateur connecté.
 *
 * SÉCURITÉ : il s'agit d'une simulation de paiement — aucun prestataire n'est
 * appelé et l'offre est appliquée gratuitement. En production, cette route doit
 * vérifier le paiement (webhook opérateur) avant d'activer l'offre.
 */

export const dynamic = "force-dynamic";

function isOffer(value: unknown): value is SubscriptionOffer {
  return value === "tv" || value === "combinations" || value === "pack";
}

export async function POST(request: NextRequest) {
  const { principal, issuedGuestId } = await identifyRequest(request);
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
    // Sans identifiants serveur, la route GET /api/subscription bascule déjà en
    // mode local : on applique la même dégradation ici au lieu de bloquer la
    // souscription. Le serveur reprend la main dès que les identifiants sont présents.
    console.warn("Firebase Admin absent : offre appliquée en mode local (stockage navigateur).");
    // Le client vient de basculer localement : on enregistre le rattachement invité.
    if (issuedGuestId) await linkGuestToUser(null, issuedGuestId, principalKey(principal));
    return NextResponse.json({ entitlements: null, serverEnforced: false });
  }

  const accountKey = principalKey(principal);
  try {
    const quotas = await loadQuotaSettings(db);
    const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const updated = await setStoredOffer(db, accountKey, offer, state);
    const isAdmin = await isAdminUser(db, accountKey);
    // Un visiteur qui vient de se connecter garde la trace de son compteur invité.
    if (issuedGuestId) await linkGuestToUser(db, issuedGuestId, accountKey);
    return NextResponse.json({
      entitlements: computeEntitlements(updated, isAdmin, quotas),
      serverEnforced: true,
    });
  } catch (error) {
    console.error("Mise à jour de l'offre impossible.", error);
    return NextResponse.json(
      { error: "Impossible de mettre à jour l'offre pour le moment." },
      { status: 502 }
    );
  }
}
