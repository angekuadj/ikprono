"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseAuthConfigured } from "@/lib/firebaseAuth";
import { useLanguage } from "@/context/LanguageContext";

type Provider = "google" | "apple";

export default function SocialAuthButtons({ callbackUrl }: { callbackUrl: string }) {
  const { text } = useLanguage();
  const { loginWithGoogle } = useAuth();
  const [configuredProviders, setConfiguredProviders] = useState<string[] | null>(null);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const firebaseEnabled = isFirebaseAuthConfigured();

  // Firebase actif : inutile de demander les providers NextAuth.
  useEffect(() => {
    if (firebaseEnabled) return;

    const controller = new AbortController();
    fetch("/api/auth/providers", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load sign-in providers.");
        const providers = await response.json() as Record<string, unknown> | null;
        setConfiguredProviders(Object.keys(providers ?? {}));
      })
      .catch(() => {
        if (!controller.signal.aborted) setConfiguredProviders([]);
      });
    return () => controller.abort();
  }, [firebaseEnabled]);

  const handleGoogleSignIn = async () => {
    setError("");

    // Connexion Google via popup Firebase.
    if (firebaseEnabled) {
      setPendingProvider("google");
      try {
        await loginWithGoogle();
        window.location.assign(callbackUrl);
      } catch (signInError) {
        setError(
          signInError instanceof Error && signInError.message
            ? signInError.message
            : text("La connexion a échoué. Réessayez.", "Sign-in failed. Please try again.")
        );
        setPendingProvider(null);
      }
      return;
    }

    // Repli : NextAuth (si le provider est configuré côté serveur).
    await handleNextAuthSignIn("google");
  };

  const handleNextAuthSignIn = async (provider: Provider) => {
    setError("");
    if (!configuredProviders?.includes(provider)) {
      setError(text(
        `La connexion ${provider === "google" ? "Google" : "Apple"} n'est pas encore configurée.`,
        `${provider === "google" ? "Google" : "Apple"} sign-in is not configured yet.`
      ));
      return;
    }

    setPendingProvider(provider);
    try {
      const result = await signIn(provider, { callbackUrl, redirect: false });
      if (!result?.url || result.error) {
        throw new Error(text("La connexion a échoué. Réessayez.", "Sign-in failed. Please try again."));
      }
      window.location.assign(result.url);
    } catch (signInError) {
      setError(signInError instanceof Error
        ? signInError.message
        : text("La connexion a échoué. Réessayez.", "Sign-in failed. Please try again."));
      setPendingProvider(null);
    }
  };

  // En mode Firebase : bouton Google seul (Apple nécessite une config OAuth Apple
  // dans Firebase, voir Authentication > Sign-in method > Apple).
  const showAppleButton = !firebaseEnabled;

  return (
    <div>
      <div className={`grid gap-3 ${showAppleButton ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={pendingProvider !== null}
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
        {showAppleButton && (
          <button
            type="button"
            onClick={() => void handleNextAuthSignIn("apple")}
            disabled={pendingProvider !== null}
            className="inline-flex w-full items-center justify-center rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 shadow-sm hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16.37 12.54c.02 2.3 2.02 3.06 2.04 3.07-.02.05-.32 1.1-1.05 2.18-.63.93-1.28 1.86-2.31 1.88-1.01.02-1.34-.6-2.5-.6-1.15 0-1.51.58-2.47.62-1 .04-1.76-1-2.4-1.92-1.3-1.88-2.29-5.3-.96-7.62a3.72 3.72 0 0 1 3.14-1.9c.98-.02 1.9.66 2.5.66.6 0 1.72-.82 2.9-.7.5.02 1.91.2 2.81 1.52-.07.04-1.68.98-1.7 2.81ZM14.46 5.97a3.43 3.43 0 0 0 .78-2.46 3.5 3.5 0 0 0-2.25 1.15 3.22 3.22 0 0 0-.8 2.38 2.9 2.9 0 0 0 2.27-1.07Z" />
            </svg>
            <span className="ml-2">Apple</span>
          </button>
        )}
      </div>
      {pendingProvider && (
        <p role="status" className="mt-3 text-center text-xs text-gray-400">
          {firebaseEnabled
            ? text("Ouverture de la fenêtre Google…", "Opening Google window…")
            : text("Redirection vers le fournisseur…", "Redirecting to provider…")}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-center text-sm text-amber-300">{error}</p>}
    </div>
  );
}
