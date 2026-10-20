import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { identifyRequest, applyGuestCookie, principalKey, type Principal } from "@/lib/server/identity";
import {
  computeEntitlements,
  computeGuestEntitlements,
  consumeCombinations,
  consumeGuestCombinations,
  ensureTrial,
  getAdminDb,
  isAdminConfigured,
  isAdminUser,
  loadState,
  type ServerEntitlements,
} from "@/lib/server/subscriptionStore";

/**
 * Garde serveur pour la génération de combinaisons.
 *
 * Toute route qui produit une combinaison doit appeler `enforceCombinationQuota`
 * AVANT de générer, puis `commitCombinationUsage` uniquement si la génération a
 * réussi. Le quota est ainsi appliqué côté serveur, indépendamment du client.
 *
 * En l'absence d'identifiants Firebase Admin (développement local), le quota
 * retombe sur le calcul client : `serverEnforced` vaut alors false.
 */

export interface QuotaContext {
  principal: Principal;
  accountKey: string;
  isAdmin: boolean;
  /** Base Firestore Admin, ou null si les identifiants serveur sont absents. */
  db: ReturnType<typeof getAdminDb>;
  issuedGuestId: string | null;
}

export interface QuotaFailure {
  response: NextResponse;
}

/** Identifie l'appelant et refuse la requête si son quota est épuisé. */
export async function enforceCombinationQuota(
  request: NextRequest
): Promise<{ context: QuotaContext; entitlements: ServerEntitlements } | QuotaFailure> {
  const { principal, issuedGuestId } = await identifyRequest(request);
  const adminDb = getAdminDb();
  const accountKey = principalKey(principal);
  // Le rôle admin est vérifié côté serveur dans Firestore, jamais depuis le client.
  const isAdmin = adminDb && principal.kind === "user" ? await isAdminUser(adminDb, accountKey) : false;
  const context: QuotaContext = {
    principal,
    accountKey,
    isAdmin,
    db: adminDb,
    issuedGuestId,
  };

  // Sans identifiants serveur, le quota reste géré côté client (mode local).
  if (!adminDb || !isAdminConfigured()) {
    return { context, entitlements: computeGuestEntitlements(0) };
  }

  const db = adminDb;
  if (principal.kind === "guest") {
    const state = await loadState(db, context.accountKey);
    const entitlements = computeGuestEntitlements(state.usage.count);
    if (!entitlements.canGenerate) {
      return {
        response: applyGuestCookie(
          NextResponse.json(
            {
              error:
                `Vous avez utilisé vos ${entitlements.dailyLimit} combinaisons gratuites. ` +
                "Connectez-vous pour continuer.",
              code: "guest-limit-reached",
              entitlements,
            },
            { status: 402 }
          ),
          context.issuedGuestId
        ),
      };
    }
    return { context, entitlements };
  }

  const state = await ensureTrial(db, context.accountKey, await loadState(db, context.accountKey));
  const entitlements = computeEntitlements(state, context.isAdmin);
  if (!entitlements.canGenerate) {
    return {
      response: NextResponse.json(
        {
          error: "Votre quota de combinaisons du jour est épuisé. Choisissez une offre pour continuer.",
          code: entitlements.reason ?? "quota-exhausted",
          entitlements,
        },
        { status: 402 }
      ),
    };
  }
  return { context, entitlements };
}

/** Enregistre les générations réellement produites après un succès de génération. */
export async function commitCombinationUsage(
  context: QuotaContext,
  count: number
): Promise<ServerEntitlements | null> {
  if (!context.db || count <= 0) return null;
  const result = context.principal.kind === "guest"
    ? await consumeGuestCombinations(context.db, context.principal.guestId, count)
    : await consumeCombinations(context.db, context.accountKey, count, context.isAdmin);
  return result.entitlements;
}

/** Réponse d'erreur de quota, en posant le cookie invité si nécessaire. */
export function applyQuotaCookie(response: NextResponse, context: QuotaContext): NextResponse {
  return applyGuestCookie(response, context.issuedGuestId);
}
