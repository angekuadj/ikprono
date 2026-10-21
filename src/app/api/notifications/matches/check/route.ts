import { timingSafeEqual } from "node:crypto";
import { FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { NextRequest, NextResponse } from "next/server";
import { loadFixturesFromFotMobByIds } from "@/lib/fotmob";
import type { Fixture } from "@/lib/fixtures";
import { getAdminDb, isAdminConfigured } from "@/lib/server/firebaseAdminConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUBSCRIPTIONS_COLLECTION = "pushMatchSubscriptions";
const DEVICES_COLLECTION = "pushDevices";
const LOCK_ID = "match-push-poller";
const LOCK_DURATION_MS = 55_000;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

type AlertKey = "kickoff" | "goal" | "yellowCard" | "redCard" | "finished";
interface MatchSnapshot {
  homeGoals: number;
  awayGoals: number;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  started: boolean;
  finished: boolean;
}

interface MatchAlert {
  key: AlertKey;
  title: string;
  body: string;
}

function cronSecretMatches(request: NextRequest): boolean {
  const secret = process.env.MATCH_PUSH_CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !authorization.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function numericScore(value: string | undefined): number {
  const score = Number.parseInt(value ?? "", 10);
  return Number.isFinite(score) && score >= 0 ? score : 0;
}

function snapshotOf(fixture: Fixture): MatchSnapshot {
  const status = fixture.status?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
  const started = ["en direct", "mi-temps", "live", "in progress"].includes(status) || status === "termine";
  const finished = ["termine", "finished", "full time", "ft", "aet", "pen"].includes(status);
  const cards = fixture.matchCards;
  return {
    homeGoals: numericScore(fixture.homeScore),
    awayGoals: numericScore(fixture.awayScore),
    homeYellow: cards?.home.yellow ?? 0,
    awayYellow: cards?.away.yellow ?? 0,
    homeRed: cards?.home.red ?? 0,
    awayRed: cards?.away.red ?? 0,
    started,
    finished,
  };
}

function buildAlerts(
  subscription: Record<string, unknown>,
  fixture: Fixture,
  previous: MatchSnapshot,
  current: MatchSnapshot,
): MatchAlert[] {
  const alerts = subscription.alerts;
  if (typeof alerts !== "object" || alerts === null) return [];
  const enabled = alerts as Record<string, unknown>;
  const result: MatchAlert[] = [];
  const score = `${current.homeGoals}–${current.awayGoals}`;
  const teams = `${fixture.homeTeam} – ${fixture.awayTeam}`;

  if (!previous.started && current.started && enabled.kickoff === true) {
    result.push({ key: "kickoff", title: "Coup d’envoi", body: `${teams} a commencé.` });
  }
  const goals = Math.max(0, current.homeGoals - previous.homeGoals)
    + Math.max(0, current.awayGoals - previous.awayGoals);
  if (goals > 0 && enabled.goal === true) {
    result.push({ key: "goal", title: goals > 1 ? "Buts !" : "But !", body: `${teams} · ${score}` });
  }
  const yellows = Math.max(0, current.homeYellow - previous.homeYellow)
    + Math.max(0, current.awayYellow - previous.awayYellow);
  if (yellows > 0 && enabled.yellowCard === true) {
    result.push({ key: "yellowCard", title: "Carton jaune", body: `${teams} · ${score}` });
  }
  const reds = Math.max(0, current.homeRed - previous.homeRed)
    + Math.max(0, current.awayRed - previous.awayRed);
  if (reds > 0 && enabled.redCard === true) {
    result.push({ key: "redCard", title: "Carton rouge", body: `${teams} · ${score}` });
  }
  if (!previous.finished && current.finished && enabled.finished === true) {
    result.push({ key: "finished", title: "Fin du match", body: `${teams} · ${score}` });
  }
  return result;
}

function readSnapshot(value: unknown): MatchSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const snapshot = value as Partial<MatchSnapshot>;
  const numericKeys: Array<keyof MatchSnapshot> = [
    "homeGoals", "awayGoals", "homeYellow", "awayYellow", "homeRed", "awayRed",
  ];
  if (!numericKeys.every(key => typeof snapshot[key] === "number")
    || typeof snapshot.started !== "boolean" || typeof snapshot.finished !== "boolean") return null;
  return snapshot as MatchSnapshot;
}

async function acquirePollLock(db: FirebaseFirestore.Firestore): Promise<boolean> {
  const reference = db.collection("pushNotificationLocks").doc(LOCK_ID);
  const now = Date.now();
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const expiresAt = snapshot.data()?.expiresAtMs;
    if (typeof expiresAt === "number" && expiresAt > now) return false;
    transaction.set(reference, {
      expiresAtMs: now + LOCK_DURATION_MS,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function loadAllSubscriptions(
  db: FirebaseFirestore.Firestore,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const documents: QueryDocumentSnapshot<DocumentData>[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  while (true) {
    let query = db.collection(SUBSCRIPTIONS_COLLECTION).orderBy("__name__").limit(500);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    documents.push(...page.docs);
    if (page.size < 500) return documents;
    last = page.docs[page.docs.length - 1];
  }
}

async function deliverAlerts(
  db: FirebaseFirestore.Firestore,
  uid: string,
  fixtureId: string,
  alerts: MatchAlert[],
): Promise<{ sent: number; failed: number }> {
  const devices = await db.collection(DEVICES_COLLECTION).where("uid", "==", uid).get();
  const tokens = Array.from(new Set(devices.docs
    .map(document => document.data().token)
    .filter((token): token is string => typeof token === "string")));
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const deviceByToken = new Map(devices.docs.map(document => [document.data().token, document.ref]));
  const invalidRefs: FirebaseFirestore.DocumentReference[] = [];
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batchTokens = tokens.slice(offset, offset + 500);
    const message: MulticastMessage = {
      tokens: batchTokens,
      notification: {
        title: alerts.map(alert => alert.title).join(" · "),
        body: alerts.map(alert => alert.body).join("\n"),
      },
      data: { matchId: fixtureId },
      android: { priority: "high" },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } },
      },
    };
    const response = await getMessaging().sendEachForMulticast(message);
    sent += response.successCount;
    failed += response.failureCount;
    response.responses.forEach((item, index) => {
      if (item.error && INVALID_TOKEN_CODES.has(item.error.code)) {
        const reference = deviceByToken.get(batchTokens[index]);
        if (reference) invalidRefs.push(reference);
      }
    });
  }
  await Promise.all(invalidRefs.map(reference => reference.delete()));
  return { sent, failed };
}

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }
  if (!await isAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin n’est pas configuré sur le serveur." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Le stockage des notifications est indisponible." }, { status: 503 });

  try {
    if (!await acquirePollLock(db)) {
      return NextResponse.json({ skipped: true, reason: "poll-already-running" });
    }
    const subscriptions = await loadAllSubscriptions(db);
    const active = subscriptions.filter(document => {
      const data = document.data();
      const snapshot = readSnapshot(data.lastSnapshot);
      return typeof data.uid === "string" && typeof data.fixtureId === "string" && !snapshot?.finished;
    });
    const fixtureIds = Array.from(new Set(active.map(document => String(document.data().fixtureId))));
    let checked = 0;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let offset = 0; offset < fixtureIds.length; offset += 5) {
      const batchIds = fixtureIds.slice(offset, offset + 5);
      const result = await Promise.allSettled([loadFixturesFromFotMobByIds(batchIds)]);
      if (result[0].status === "rejected") {
        console.error("Match push polling could not load fixtures.", result[0].reason);
        errors.push("Une partie des matchs n’a pas pu être actualisée.");
        continue;
      }
      const fixturesById = new Map(result[0].value.map(fixture => [fixture.id, fixture]));
      for (const subscription of active) {
        const data = subscription.data();
        const fixtureId = String(data.fixtureId);
        if (!batchIds.includes(fixtureId)) continue;
        const fixture = fixturesById.get(fixtureId);
        if (!fixture) continue;
        checked += 1;
        const current = snapshotOf(fixture);
        const previous = readSnapshot(data.lastSnapshot);
        if (!previous) {
          await subscription.ref.update({
            lastSnapshot: current,
            snapshotUpdatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }
        const matchAlerts = buildAlerts(data, fixture, previous, current);
        let shouldSaveSnapshot = true;
        if (matchAlerts.length > 0) {
          const delivery = await deliverAlerts(db, String(data.uid), fixtureId, matchAlerts);
          sent += delivery.sent;
          failed += delivery.failed;
          shouldSaveSnapshot = delivery.failed === 0 || delivery.sent > 0;
        }
        if (shouldSaveSnapshot) {
          await subscription.ref.update({
            lastSnapshot: current,
            snapshotUpdatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    return NextResponse.json({ checked, sent, failed, ...(errors.length ? { warnings: errors } : {}) });
  } catch (error) {
    console.error("Match push polling failed.", error);
    return NextResponse.json({ error: "La vérification des matchs et l’envoi push ont échoué." }, { status: 500 });
  }
}
