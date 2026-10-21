import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { identifyRequest } from "@/lib/server/identity";
import { getAdminDb, isAdminConfigured } from "@/lib/server/firebaseAdminConfig";

export const dynamic = "force-dynamic";

const COLLECTION = "pushMatchSubscriptions";
const ALERT_KEYS = ["kickoff", "goal", "yellowCard", "redCard", "finished"] as const;
type AlertKey = (typeof ALERT_KEYS)[number];

interface SubscriptionInput {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  alerts: Record<AlertKey, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubscriptions(value: unknown): SubscriptionInput[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const subscriptions: SubscriptionInput[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.fixture) || !isRecord(entry.alerts)) return null;
    const alerts = entry.alerts;
    const fixtureId = entry.fixture.id;
    const homeTeam = entry.fixture.homeTeam;
    const awayTeam = entry.fixture.awayTeam;
    if (typeof fixtureId !== "string" || !/^\d{1,20}$/.test(fixtureId)
      || typeof homeTeam !== "string" || homeTeam.length < 1 || homeTeam.length > 120
      || typeof awayTeam !== "string" || awayTeam.length < 1 || awayTeam.length > 120
      || seen.has(fixtureId)
      || !ALERT_KEYS.every(key => typeof alerts[key] === "boolean")) {
      return null;
    }
    seen.add(fixtureId);
    const normalizedAlerts = Object.fromEntries(ALERT_KEYS.map(key => [key, alerts[key]])) as Record<AlertKey, boolean>;
    if (Object.values(normalizedAlerts).some(Boolean)) {
      subscriptions.push({ fixtureId, homeTeam, awayTeam, alerts: normalizedAlerts });
    }
  }
  return subscriptions;
}

function subscriptionDocumentId(uid: string, fixtureId: string): string {
  return `${uid}_${fixtureId}`;
}

export async function PUT(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Connectez-vous avec Firebase pour synchroniser les alertes." }, { status: 401 });
  }
  if (!await isAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin n’est pas configuré sur le serveur." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Le stockage des notifications est indisponible." }, { status: 503 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Le corps de la requête est invalide." }, { status: 400 });
  }
  const subscriptions = isRecord(payload) ? parseSubscriptions(payload.subscriptions) : null;
  if (!subscriptions) {
    return NextResponse.json({ error: "La liste des alertes de matchs est invalide." }, { status: 400 });
  }

  try {
    const collection = db.collection(COLLECTION);
    const existing = await collection.where("uid", "==", principal.uid).get();
    const nextIds = new Set(subscriptions.map(item => subscriptionDocumentId(principal.uid, item.fixtureId)));
    const batch = db.batch();
    for (const document of existing.docs) {
      if (!nextIds.has(document.id)) batch.delete(document.ref);
    }
    for (const item of subscriptions) {
      batch.set(collection.doc(subscriptionDocumentId(principal.uid, item.fixtureId)), {
        uid: principal.uid,
        fixtureId: item.fixtureId,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        alerts: item.alerts,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    return NextResponse.json({ subscriptions: subscriptions.length });
  } catch (error) {
    console.error("Match push subscription sync failed.", error);
    return NextResponse.json({ error: "Impossible de synchroniser les alertes de matchs." }, { status: 500 });
  }
}
