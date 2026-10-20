import { NextRequest, NextResponse } from "next/server";
import { identifyRequest, applyGuestCookie, principalKey } from "@/lib/server/identity";
import {
  computeEntitlements,
  computeGuestEntitlements,
  ensureTrial,
  getAdminDb,
  isAdminConfigured,
  isAdminUser,
  loadState,
} from "@/lib/server/subscriptionStore";
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
      NextResponse.json({ entitlements: computeGuestEntitlements(0, quotas), serverEnforced: false }),
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
        }),
        issuedGuestId
      );
    }

    const ensured = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const entitlements = computeEntitlements(ensured, await isAdminUser(db, accountKey), quotas);
    return NextResponse.json({ entitlements, serverEnforced: true });
  } catch (error) {
    console.error("Lecture des droits impossible.", error);
    return applyGuestCookie(
      NextResponse.json({ entitlements: computeGuestEntitlements(0, quotas), serverEnforced: false }),
      issuedGuestId
    );
  }
}
