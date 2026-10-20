import type { SubscriptionOffer } from "@/lib/subscription";

/**
 * Journal local des actions d'administration sur les offres.
 *
 * Les offres actives d'un compte vivent côté serveur (Firestore), dans la
 * collection `subscriptions` réservée au SDK Admin : un client ne peut pas les
 * modifier directement. Cette page confie donc la modification à la route
 * `/api/admin/offers`, qui vérifie le rôle admin côté serveur.
 *
 * Le journal ci-dessous n'est qu'un historique d'affichage, propre au navigateur
 * de l'administrateur : il ne sert jamais de source de vérité.
 */

const ADMIN_OFFER_LOGS_KEY = "ikprono_admin_offer_logs";

export type AdminOfferAction = "grant" | "revoke";

export interface AdminOfferLog {
  id: string;
  accountKey: string;
  userEmail: string;
  offer: SubscriptionOffer | "trial";
  action: AdminOfferAction;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAdminOfferLog(value: unknown): value is AdminOfferLog {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.accountKey === "string" &&
    typeof value.userEmail === "string" &&
    (value.offer === "tv" || value.offer === "combinations" || value.offer === "pack" || value.offer === "trial") &&
    (value.action === "grant" || value.action === "revoke") &&
    typeof value.createdAt === "string";
}

export function readAdminOfferLogs(): AdminOfferLog[] {
  const stored = localStorage.getItem(ADMIN_OFFER_LOGS_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isAdminOfferLog)) {
    throw new Error("Le journal des offres est invalide.");
  }
  return parsed;
}

export function writeAdminOfferLogs(logs: AdminOfferLog[]): void {
  localStorage.setItem(ADMIN_OFFER_LOGS_KEY, JSON.stringify(logs));
}
