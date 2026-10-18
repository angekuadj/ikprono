"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseAuthConfigured } from "@/lib/firebaseAuth";
import { useLanguage } from "@/context/LanguageContext";

export default function SocialAuthButtons({ callbackUrl }: { callbackUrl: string }) {
  const { text } = useLanguage();
  const { loginWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const firebaseEnabled = isFirebaseAuthConfigured();

  const handleGoogleSignIn = async () => {
    setError("");
    if (!firebaseEnabled) {
      setError(text(
        "La connexion Google n'est pas disponible car Firebase n'est pas configuré.",
        "Google sign-in is unavailable because Firebase is not configured."
      ));
      return;
    }

    setPending(true);
    try {
      await loginWithGoogle();
      window.location.assign(callbackUrl);
    } catch (signInError) {
      setError(signInError instanceof Error
        ? signInError.message
        : text("La connexion a échoué. Réessayez.", "Sign-in failed. Please try again."));
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 shadow-sm hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.16v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.16a11 11 0 0 0 0 9.9l3.69-2.84Z" />
          <path fill="#EA4335" d="M12 5.36c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.84 6.05l3.69 2.84C6.72 7.29 9.14 5.36 12 5.36Z" />
        </svg>
        <span className="ml-2">Google</span>
      </button>
      {pending && (
        <p role="status" className="mt-3 text-center text-xs text-gray-400">
          {text("Ouverture de la fenêtre Google…", "Opening Google window…")}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-center text-sm text-amber-300">{error}</p>}
    </div>
  );
}
