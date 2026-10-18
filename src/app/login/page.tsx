"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSafeReturnPath } from "@/lib/returnPath";
import SocialAuthButtons from "@/components/SocialAuthButtons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnToBasket, setReturnToBasket] = useState(false);
  const [socialCallbackUrl, setSocialCallbackUrl] = useState("/dashboard");
  const router = useRouter();
  const { login } = useAuth();
  const { text } = useLanguage();

  useEffect(() => {
    const returnPath = getSafeReturnPath(window.location.search);
    setReturnToBasket(returnPath === "/basket");
    setSocialCallbackUrl(returnPath ?? "/dashboard");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await login(email, password, rememberMe);
      const returnPath = getSafeReturnPath(window.location.search);

      if (user.role === "admin") {
        router.replace("/admin");
      } else if (returnPath) {
        router.replace(returnPath);
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : text("Erreur de connexion", "Login failed"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <div className="text-white font-bold text-3xl tracking-tight mb-4">
              IK<span className="text-green-500">PRONO</span>
            </div>
          </Link>
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            {text("Connectez-vous", "Log in")}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {text("Ou", "Or")}{" "}
            <Link href={returnToBasket ? "/register?next=%2Fbasket" : "/register"} className="font-medium text-green-500 hover:text-green-400">
              {text("créez un nouveau compte", "create a new account")}
            </Link>
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 py-8 px-4 shadow-xl rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {text("Adresse email", "Email address")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-700 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm"
                placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {text("Mot de passe", "Password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-700 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-600 rounded bg-gray-800"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-300">
                  {text("Se souvenir de moi", "Remember me")}
                </label>
              </div>

              <div className="text-sm">
                <Link href="/forgot-password" className="font-medium text-green-500 hover:text-green-400">
                  {text("Mot de passe oublié ?", "Forgot password?")}
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition hover-glow"
              >
                {isSubmitting ? text("Connexion...", "Logging in...") : text("Se connecter", "Log in")}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-500">{text("Ou continuer avec", "Or continue with")}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
            </div>
              <SocialAuthButtons callbackUrl={socialCallbackUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
