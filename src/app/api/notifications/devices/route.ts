import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { identifyRequest } from "@/lib/server/identity";
import { getAdminDb, isAdminConfigured } from "@/lib/server/firebaseAdminConfig";

export const dynamic = "force-dynamic";

const DEVICES_COLLECTION = "pushDevices";
type PushPlatform = "web" | "android" | "ios";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenDocumentId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function authenticatedUid(request: NextRequest): Promise<string | null> {
  const { principal } = await identifyRequest(request);
  return principal.kind === "user" ? principal.uid : null;
}

async function requestPayload(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await request.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const uid = await authenticatedUid(request);
  if (!uid) {
    return NextResponse.json({ error: "Connectez-vous avec Firebase pour activer les notifications." }, { status: 401 });
  }

  const payload = await requestPayload(request);
  const token = payload?.token;
  const platform = payload?.platform;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096 || token.trim() !== token
    || (platform !== "web" && platform !== "android" && platform !== "ios")) {
    return NextResponse.json({ error: "Jeton de notification ou plateforme invalide." }, { status: 400 });
  }

  if (!await isAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin n’est pas configuré sur le serveur." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Le stockage des notifications est indisponible." }, { status: 503 });
  }

  try {
    await db.collection(DEVICES_COLLECTION).doc(tokenDocumentId(token)).set({
      uid,
      token,
      platform,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ registered: true });
  } catch (error) {
    console.error("Push device registration failed.", error);
    return NextResponse.json({ error: "Impossible d’enregistrer cet appareil pour les notifications." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const uid = await authenticatedUid(request);
  if (!uid) {
    return NextResponse.json({ error: "Connectez-vous avec Firebase pour désactiver les notifications." }, { status: 401 });
  }

  const payload = await requestPayload(request);
  const token = payload?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096 || token.trim() !== token) {
    return NextResponse.json({ error: "Jeton de notification invalide." }, { status: 400 });
  }

  if (!await isAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin n’est pas configuré sur le serveur." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Le stockage des notifications est indisponible." }, { status: 503 });
  }

  try {
    const tokenRef = db.collection(DEVICES_COLLECTION).doc(tokenDocumentId(token));
    const snapshot = await tokenRef.get();
    if (snapshot.exists && snapshot.data()?.uid === uid) {
      await tokenRef.delete();
    }
    return NextResponse.json({ registered: false });
  } catch (error) {
    console.error("Push device removal failed.", error);
    return NextResponse.json({ error: "Impossible de désactiver les notifications sur cet appareil." }, { status: 500 });
  }
}
