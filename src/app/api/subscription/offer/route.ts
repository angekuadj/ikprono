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
 * Désactivation d'une offre, ou relecture des droits.
 *
 * SÉCURITÉ : l'**activation** d'une offre payante n'est plus possible ici. Elle
 * passe obligatoirement par `/api/checkout/verify` (ou le webhook Flutterwave),
 * après vérification d'un paiement réellement encaissé. Seule la désactivation
 * reste ouverte, car annuler un abonnement ne nécessite aucun paiement.
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
    // Sans identifiants serveur, la route GET /api/subscription bascule en mode
    // local : la dégradation est conservée pour la déconnexion uniquement.
    console.warn("Firebase Admin absent : offre gérée en mode local (stockage navigateur).");
    // Le client vient de basculer localement : on enregistre le rattachement invité.
    if (issuedGuestId) await linkGuestToUser(null, issuedGuestId, principalKey(principal));
    return NextResponse.json({ entitlements: null, serverEnforced: false });
  }

  const accountKey = principalKey(principal);
  try {
    const quotas = await loadQuotaSettings(db);
    const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));

    // Une activation demandée directement est refusée : elle exige un paiement vérifié.
    if (!state.subscription?.offers.includes(offer)) {
      return NextResponse.json(
        {
          error: "Cette offre s'active après un paiement confirmé.",
          code: "payment-required",
        },
        { status: 402 }
      );
    }

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
