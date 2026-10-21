import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { NextRequest, NextResponse } from "next/server";
import { identifyRequest } from "@/lib/server/identity";
import { getAdminDb, isAdminConfigured } from "@/lib/server/firebaseAdminConfig";

export const dynamic = "force-dynamic";

const DEVICES_COLLECTION = "pushDevices";
const TEST_COOLDOWN_MS = 30_000;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export async function POST(request: NextRequest) {
  const { principal } = await identifyRequest(request);
  if (principal.kind !== "user") {
    return NextResponse.json({ error: "Connectez-vous avec Firebase pour tester les notifications." }, { status: 401 });
  }

  if (!await isAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin n’est pas configuré sur le serveur." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Le stockage des notifications est indisponible." }, { status: 503 });
  }

  try {
    const cooldownRef = db.collection("pushTestCooldowns").doc(principal.uid);
    const now = Date.now();
    const allowed = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(cooldownRef);
      const sentAt = snapshot.data()?.sentAtMs;
      if (typeof sentAt === "number" && now - sentAt < TEST_COOLDOWN_MS) return false;
      transaction.set(cooldownRef, { sentAtMs: now, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!allowed) {
      return NextResponse.json({ error: "Attendez quelques secondes avant de renvoyer un test." }, { status: 429 });
    }

    const devices = await db.collection(DEVICES_COLLECTION).where("uid", "==", principal.uid).get();
    if (devices.empty) {
      return NextResponse.json({ error: "Aucun appareil n’est enregistré pour les notifications." }, { status: 409 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ikprono.onrender.com";
    const link = new URL("/", siteUrl).toString();
    const validDevices = devices.docs.filter(document => typeof document.data().token === "string");
    const messages = validDevices.map(document => {
      const data = document.data();
      return {
        token: data.token,
        notification: {
          title: "Test de notification IKProno",
          body: "Les notifications push sont bien configurées sur cet appareil.",
        },
        data: { url: "/" },
        webpush: {
          fcmOptions: { link },
        },
        android: { priority: "high" as const },
        apns: { headers: { "apns-priority": "10" } },
      };
    });
    if (messages.length === 0) {
      return NextResponse.json({ error: "Aucun jeton de notification valide n’est enregistré." }, { status: 409 });
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidDeviceRefs: FirebaseFirestore.DocumentReference[] = [];
    const messaging = getMessaging();
    for (let offset = 0; offset < messages.length; offset += 500) {
      const batch = messages.slice(offset, offset + 500);
      const result = await messaging.sendEach(batch);
      result.responses.forEach((response, index) => {
        if (response.success) {
          successCount += 1;
          return;
        }
        failureCount += 1;
        if (response.error && INVALID_TOKEN_CODES.has(response.error.code)) {
          invalidDeviceRefs.push(validDevices[offset + index].ref);
        }
      });
    }
    await Promise.all(invalidDeviceRefs.map(reference => reference.delete()));

    if (successCount === 0) {
      return NextResponse.json({ error: "Firebase n’a envoyé aucun test. Vérifiez les identifiants FCM et APNs." }, { status: 502 });
    }
    return NextResponse.json({ sent: successCount, failed: failureCount });
  } catch (error) {
    console.error("Push notification test failed.", error);
    return NextResponse.json({ error: "L’envoi de la notification de test a échoué." }, { status: 500 });
  }
}
