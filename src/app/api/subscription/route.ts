import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, applyGuestCookie, principalKey } from "@/lib/server/identity";
import {
  computeEntitlements,
  computeGuestEntitlements,
  ensureTrial,
  isAdminUser,
  loadState,
} from "@/lib/server/subscriptionStore";
import { getAdminDb, isAdminConfigured } from "@/lib/server/firebaseAdminConfig";
import { loadQuotaSettings } from "@/lib/server/quotaSettings";

/**
 * Renvoie les droits d'accès calculés côté serveur (source de vérité) :
 * essai, offres actives, quota du jour. Le client s'en sert pour l'affichage.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { principal, issuedGuestId } = await identifyRequest(request);
  const accountKey = principalKey(principal);
  const db = (await isAdminConfigured()) ? getAdminDb() : null;
  const quotas = await loadQuotaSettings(db);

  // Sans identifiants serveur, le client calcule l'affichage localement.
  if (!db) {
    return applyGuestCookie(
      NextResponse.json({ entitlements: computeGuestEntitlements(0, quotas), serverEnforced: false, isAdmin: false }),
      issuedGuestId
    );
  }

  try {
    if (principal.kind === "guest") {
      const state = await loadState(db, accountKey);
      return applyGuestCookie(
        NextResponse.json({
          entitlements: computeGuestEntitlements(state.usage.count, quotas),
          serverEnforced: true,
          isAdmin: false,
        }),
        issuedGuestId
      );
    }

    const isAdmin = await isAdminUser(db, accountKey);
    const ensured = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const entitlements = computeEntitlements(ensured, isAdmin, quotas);
    return NextResponse.json({ entitlements, serverEnforced: true, isAdmin });
  } catch (error) {
    console.error("Lecture des droits impossible.", error);
    return applyGuestCookie(
      NextResponse.json({ entitlements: computeGuestEntitlements(0, quotas), serverEnforced: false, isAdmin: false }),
      issuedGuestId
    );
  }
}
