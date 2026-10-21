"use client";

import { useEffect, useState } from "react";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { getFirebaseApp, isFirebaseConfigured } from "@/lib/firebase";
import { getIdToken } from "@/lib/apiClient";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  || "BOCMGVfhXkZUoBIgd7WPs269ezdwZKcri1oncFhFSrofzXNkcnZbsubim6SgnatUgwP6JKyu3c8Hn9_S-v_eufE";
const ENABLED_KEY = "ikprono_web_push_enabled";
const TOKEN_KEY = "ikprono_web_push_token";

interface ApiResponse {
  error?: string;
  registered?: boolean;
  sent?: number;
  failed?: number;
}

async function readResponse(response: Response): Promise<ApiResponse> {
  const value: unknown = await response.json().catch(() => null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Le serveur a renvoyé une réponse invalide.");
  }
  const payload = value as ApiResponse;
  if (!response.ok) throw new Error(payload.error || `Erreur serveur (${response.status}).`);
  return payload;
}

export default function WebPushSettings() {
  const { text } = useLanguage();
  const { addNotification } = useNotifications();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setEnabled(window.localStorage.getItem(ENABLED_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void isSupported().then(supported => {
      if (!active || !supported || !isFirebaseConfigured) return;
      unsubscribe = onMessage(getMessaging(getFirebaseApp()), payload => {
        const title = payload.notification?.title || payload.data?.title || "IKProno";
        const body = payload.notification?.body || payload.data?.body || "";
        addNotification(body ? `${title} · ${body}` : title, "info");
        if ("Notification" in window && Notification.permission === "granted") {
          const notification = new Notification(title, { body, tag: "ikprono-push" });
          notification.onclick = () => {
            window.focus();
            window.location.href = typeof payload.data?.url === "string" ? payload.data.url : "/";
          };
        }
      });
    }).catch(error => {
      console.error("Unable to listen for foreground push messages:", error);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [addNotification, enabled]);

  const getWebToken = async (requestPermission: boolean): Promise<string> => {
    if (!isFirebaseConfigured) throw new Error("Firebase n’est pas configuré pour le site.");
    if (!VAPID_PUBLIC_KEY) throw new Error("La clé VAPID publique n’est pas configurée dans l’environnement du site.");
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Ce navigateur ne prend pas en charge les notifications Web Push.");
    }
    if (!await isSupported()) {
      throw new Error("Les notifications Firebase ne sont pas prises en charge par ce navigateur.");
    }

    const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") throw new Error("Autorisez les notifications dans les réglages du navigateur.");

    const serviceWorker = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(getMessaging(getFirebaseApp()), {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: serviceWorker,
    });
    if (!token) throw new Error("Firebase n’a pas créé de jeton pour cet appareil.");
    return token;
  };

  const enable = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Connectez-vous avec votre compte Firebase pour activer les notifications.");
      const token = await getWebToken(true);
      const response = await fetch("/api/notifications/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token, platform: "web" }),
        cache: "no-store",
      });
      await readResponse(response);
      window.localStorage.setItem(ENABLED_KEY, "true");
      window.localStorage.setItem(TOKEN_KEY, token);
      setEnabled(true);
      setFeedback(text("Notifications Web Push activées sur ce navigateur.", "Web Push notifications are enabled in this browser."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d’activer les notifications.";
      setFeedback(message);
      addNotification(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Connectez-vous avec votre compte Firebase pour désactiver les notifications.");
      const token = window.localStorage.getItem(TOKEN_KEY) || await getWebToken(false);
      const response = await fetch("/api/notifications/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      await readResponse(response);
      if (await isSupported()) await deleteToken(getMessaging(getFirebaseApp()));
      window.localStorage.removeItem(ENABLED_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
      setEnabled(false);
      setFeedback(text("Notifications Web Push désactivées sur ce navigateur.", "Web Push notifications are disabled in this browser."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de désactiver les notifications.";
      setFeedback(message);
      addNotification(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Connectez-vous avec votre compte Firebase pour tester les notifications.");
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      const payload = await readResponse(response);
      setFeedback(text(
        `Test envoyé (${payload.sent ?? 0} appareil(s)).`,
        `Test sent (${payload.sent ?? 0} device(s)).`
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d’envoyer le test.";
      setFeedback(message);
      addNotification(message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
      <h2 className="text-xl font-semibold text-white">{text("Notifications Web Push", "Web Push notifications")}</h2>
      <p className="mt-2 text-sm text-gray-400">
        {text(
          "Recevez un test push même lorsque ce site est en arrière-plan. L’autorisation est propre à ce navigateur.",
          "Receive a push test even when this site is in the background. Permission applies to this browser."
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {enabled ? (
          <>
            <button type="button" onClick={() => void sendTest()} disabled={busy} className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-50">
              {busy ? text("En cours…", "Working…") : text("Envoyer un test", "Send a test")}
            </button>
            <button type="button" onClick={() => void disable()} disabled={busy} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 disabled:opacity-50">
              {text("Désactiver", "Disable")}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void enable()} disabled={busy} className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-50">
            {busy ? text("Activation…", "Enabling…") : text("Activer sur ce navigateur", "Enable in this browser")}
          </button>
        )}
      </div>
      {feedback ? <p role="status" className="mt-3 text-sm text-gray-300">{feedback}</p> : null}
    </section>
  );
}
