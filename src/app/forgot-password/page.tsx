"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const { text } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setSent(false);
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : text("Impossible d'envoyer le lien de réinitialisation.", "Unable to send the reset link.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12">
      <section className="w-full max-w-md space-y-6 rounded-lg border border-gray-800 bg-gray-900 p-8 shadow-xl">
        <header>
          <h1 className="text-2xl font-bold text-white">
            {text("Réinitialiser le mot de passe", "Reset your password")}
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            {text("Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.", "Enter your email address to receive a password reset link.")}
          </p>
        </header>
        {error && <p role="alert" className="rounded-md border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">{error}</p>}
        {sent && (
          <p role="status" className="rounded-md border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
            {text("Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé.", "If an account matches this address, a reset link has been sent.")}
          </p>
        )}
        <form className="space-y-4" noValidate onSubmit={handleSubmit}>
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium text-gray-300">
              {text("Adresse e-mail", "Email address")}
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email.trim()}
            aria-busy={loading}
            className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
          >
            {loading
              ? text("Envoi en cours…", "Sending…")
              : text("Envoyer le lien", "Send reset link")}
          </button>
        </form>
        <Link href="/login" className="block text-center text-sm font-medium text-green-500 hover:text-green-400">
          {text("Retour à la connexion", "Back to sign in")}
        </Link>
      </section>
    </div>
  );
}
