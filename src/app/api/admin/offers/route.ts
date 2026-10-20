import { NextRequest, NextResponse } from "next/server";
import { identifyRequest } from "@/lib/server/identity";
import {
  computeEntitlements,
  ensureTrial,
  getAdminDb,
  isAdminConfigured,
  isAdminUser,
  listAdminAccounts,
  loadState,
  setAccountPlan,
  setOffer as setStoredOffer,
} from "@/lib/server/subscriptionStore";
import type { SubscriptionOffer } from "@/lib/subscription";
import {
  loadQuotaSettings,
  saveQuotaSettings,
  type QuotaSettings,
} from "@/lib/server/quotaSettings";

/**
 * Activation ou retrait d'une offre par un administrateur.
 *
 * SÉCURITÉ : rôle admin vérifié côté serveur avant toute écriture. Aucun
 * identifiant de compte n'est accepté depuis le client : uniquement un
 * `accountKey` de la forme `firebase:<uid>`, validé ici.
 */

export const dynamic = "force-dynamic";

/** Liste des comptes et de leurs droits, réservée au rôle admin. */
export async function GET(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
  }

  if (!(await isAdminConfigured())) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les comptes ne peuvent pas être listés." },
      { status: 503 }
    );
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les comptes ne peuvent pas être listés." },
      { status: 503 }
    );
  }

  try {
    if (!(await isAdminUser(db, `firebase:${principal.uid}`))) {
      return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
    }
    const quotas = await loadQuotaSettings(db);
    const accounts = await listAdminAccounts(db, quotas);
    return NextResponse.json({ accounts, quotas, serverEnforced: true });
  } catch (error) {
    console.error("Liste des comptes impossible.", error);
    return NextResponse.json({ error: "Impossible de lire les comptes pour le moment." }, { status: 502 });
  }
}

function hasStatus(value: unknown): value is { status?: string } {
  return typeof value === "object" && value !== null;
}

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!hasStatus(payload)) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const accountKey = (payload as { accountKey?: unknown }).accountKey;
  const offer = (payload as { offer?: unknown }).offer;
  const enabled = (payload as { enabled?: unknown }).enabled;
  const plan = (payload as { plan?: unknown }).plan;

  if (typeof accountKey !== "string" || !/^firebase:[A-Za-z0-9_-]{4,128}$/.test(accountKey)) {
    return NextResponse.json({ error: "Compte invalide." }, { status: 400 });
  }

  // Deux actions possibles sur un compte : changer son plan, ou (dé)activer une offre.
  const isPlanAction = plan !== undefined;
  if (isPlanAction) {
    if (plan !== "standard" && plan !== "premium") {
      return NextResponse.json({ error: "Plan inconnu." }, { status: 400 });
    }
  } else {
    if (offer !== "tv" && offer !== "combinations" && offer !== "pack") {
      return NextResponse.json({ error: "Offre inconnue." }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }
  }

  if (!(await isAdminConfigured())) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les offres ne peuvent pas être modifiées." },
      { status: 503 }
    );
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les offres ne peuvent pas être modifiées." },
      { status: 503 }
    );
  }

  try {
    if (!(await isAdminUser(db, `firebase:${principal.uid}`))) {
      return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
    }

    const targetUid = accountKey.slice("firebase:".length);
    const targetProfile = await db.collection("users").doc(targetUid).get();
    if (!targetProfile.exists) {
      return NextResponse.json({ error: "Ce compte est introuvable." }, { status: 404 });
    }

    if (isPlanAction) {
      // Le rôle administrateur reste toujours en premium : on l'accepte ici pour
      // ne pas afficher d'erreur, mais Firestore conserve la cohérence rôle/plan.
      const savedPlan = await setAccountPlan(db, targetUid, plan as "standard" | "premium");
      const state = await loadState(db, accountKey);
      return NextResponse.json({
        plan: savedPlan,
        entitlements: computeEntitlements(state, await isAdminUser(db, accountKey)),
      });
    }

    const quotas = await loadQuotaSettings(db);
    const isEnabled = (await isAdminUser(db, accountKey)) || await isOfferEnabled(db, accountKey, offer as SubscriptionOffer);
    if (isEnabled === enabled) {
      const state = await loadState(db, accountKey);
      return NextResponse.json({
        entitlements: computeEntitlements(state, await isAdminUser(db, accountKey), quotas),
        unchanged: true,
      });
    }

    const state = await ensureTrial(db, accountKey, await loadState(db, accountKey));
    const updated = await setStoredOffer(db, accountKey, offer as SubscriptionOffer, state);
    return NextResponse.json({
      entitlements: computeEntitlements(updated, await isAdminUser(db, accountKey), quotas),
    });
  } catch (error) {
    console.error("Modification de l'offre impossible.", error);
    return NextResponse.json(
      { error: "Impossible de modifier l'offre pour le moment." },
      { status: 502 }
    );
  }
}

/** Enregistre le paramétrage des quotas (réservé au rôle admin). */
export async function PUT(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!hasStatus(payload)) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const input = payload as Partial<Record<keyof QuotaSettings, unknown>>;
  // On n'accepte que des entiers positifs : `normalizeQuotaSettings` applique la
  // même validation, mais un rejet explicite évite d'enregistrer silencieusement
  // une valeur de repli quand l'administrateur s'est trompé de champ.
  for (const field of ["guestLimit", "trialDailyLimit", "premiumDailyLimit"] as const) {
    const value = input[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return NextResponse.json(
        { error: "Les quotas doivent être des nombres entiers positifs." },
        { status: 400 }
      );
    }
  }

  if (!(await isAdminConfigured())) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les quotas ne peuvent pas être modifiés." },
      { status: 503 }
    );
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin n'est pas configuré sur ce serveur : les quotas ne peuvent pas être modifiés." },
      { status: 503 }
    );
  }

  try {
    if (!(await isAdminUser(db, `firebase:${principal.uid}`))) {
      return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
    }

    const quotas = await saveQuotaSettings(
      db,
      {
        guestLimit: input.guestLimit as number,
        trialDailyLimit: input.trialDailyLimit as number,
        premiumDailyLimit: input.premiumDailyLimit as number,
      },
      `firebase:${principal.uid}`
    );
    return NextResponse.json({ quotas });
  } catch (error) {
    console.error("Enregistrement des quotas impossible.", error);
    return NextResponse.json(
      { error: "Impossible d'enregistrer les quotas pour le moment." },
      { status: 502 }
    );
  }
}

/** Indique si l'offre est déjà active pour ce compte (sans la modifier). */
async function isOfferEnabled(
  db: ReturnType<typeof getAdminDb>,
  accountKey: string,
  offer: SubscriptionOffer
): Promise<boolean> {
  if (!db) return false;
  const snapshot = await db.collection("subscriptions").doc(accountKey).get();
  const offers = snapshot.data()?.offers;
  return Array.isArray(offers) && offers.includes(offer);
}
