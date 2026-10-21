import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export async function GET() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    return new NextResponse("Firebase client configuration is incomplete.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const script = `
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const title = payload.data?.title || "IKProno";
  const options = {
    body: payload.data?.body || "",
    data: { url: payload.data?.url || "/" },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || "/";
  const target = new URL(requestedUrl, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(clients.openWindow(target.href));
});
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
