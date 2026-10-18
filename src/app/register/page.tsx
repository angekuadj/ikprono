"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSafeReturnPath } from "@/lib/returnPath";
import SocialAuthButtons from "@/components/SocialAuthButtons";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [returnToBasket, setReturnToBasket] = useState(false);
  const [socialCallbackUrl, setSocialCallbackUrl] = useState("/onboarding");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const router = useRouter();
  const { register } = useAuth();
  const { t, text } = useLanguage();

  useEffect(() => {
    const returnPath = getSafeReturnPath(window.location.search);
    setReturnToBasket(returnPath === "/basket");
    setSocialCallbackUrl(returnPath ?? "/onboarding");
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    if (errors[name]) {
      setErrors({ ...errors, [name]: "" });
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = text("Le prénom est requis", "First name is required");
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = text("Le nom est requis", "Last name is required");
    }
    if (!formData.email.trim()) {
      newErrors.email = text("L'email est requis", "Email is required");
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = text("Email invalide", "Invalid email");
    }
    if (!formData.password) {
      newErrors.password = text("Le mot de passe est requis", "Password is required");
    } else if (formData.password.length < 8) {
      newErrors.password = text("Le mot de passe doit contenir au moins 8 caractères", "Password must be at least 8 characters");
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = text("Les mots de passe ne correspondent pas", "Passwords do not match");
    }
    if (!formData.agreeTerms) {
      newErrors.agreeTerms = text("Vous devez accepter les conditions", "You must accept the terms");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await register(
        formData.email,
        formData.password,
        `${formData.firstName.trim()} ${formData.lastName.trim()}`
      );
      const returnPath = getSafeReturnPath(window.location.search);
      router.replace(returnPath ?? "/onboarding");
    } catch (error) {
      setErrors({
        email:
          error instanceof Error
            ? error.message
            : text("Impossible de créer le compte", "Unable to create account")
      });
    } finally {
      setLoading(false);
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
            {text("Créez votre compte", "Create your account")}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {text("Déjà inscrit ?", "Already registered?")}{" "}
            <Link href={returnToBasket ? "/login?next=%2Fbasket" : "/login"} className="font-medium text-green-500 hover:text-green-400">
              {text("Connectez-vous", "Log in")}
            </Link>
          </p>
          <p className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20 px-4 py-3 text-sm text-fuchsia-100">
            {t("newAccountPlan")}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 py-8 px-4 shadow-xl rounded-lg sm:px-10">
          <form className="space-y-6" noValidate onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-300">
                  {text("Prénom", "First name")}
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={handleChange}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm ${
                    errors.firstName ? "border-red-500" : "border-gray-700"
                  }`}
                  placeholder="Jean"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-300">
                  {text("Nom", "Last name")}
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={handleChange}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm ${
                    errors.lastName ? "border-red-500" : "border-gray-700"
                  }`}
                  placeholder="Dupont"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>

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
                value={formData.email}
                onChange={handleChange}
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm ${
                  errors.email ? "border-red-500" : "border-gray-700"
                }`}
                placeholder="vous@exemple.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {text("Mot de passe", "Password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm ${
                  errors.password ? "border-red-500" : "border-gray-700"
                }`}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-500">{errors.password}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">{text("Minimum 8 caractères", "At least 8 characters")}</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                {text("Confirmer le mot de passe", "Confirm password")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-green-500 focus:border-green-500 bg-gray-800 text-white sm:text-sm ${
                  errors.confirmPassword ? "border-red-500" : "border-gray-700"
                }`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex items-center">
              <input
                id="agree-terms"
                name="agreeTerms"
                type="checkbox"
                checked={formData.agreeTerms}
                onChange={handleChange}
                className={`h-4 w-4 text-green-600 focus:ring-green-500 border-gray-600 rounded bg-gray-800 ${
                  errors.agreeTerms ? "border-red-500" : ""
                }`}
              />
              <label htmlFor="agree-terms" className="ml-2 block text-sm text-gray-300">
                {text("J'accepte les", "I accept the")}{" "}
                <Link href="/terms" className="text-green-500 hover:text-green-400">
                  {text("conditions d'utilisation", "terms of service")}
                </Link>{" "}
                {text("et la", "and the")}{" "}
                <Link href="/privacy" className="text-green-500 hover:text-green-400">
                  {text("politique de confidentialité", "privacy policy")}
                </Link>
              </label>
            </div>
            {errors.agreeTerms && (
              <p className="mt-1 text-sm text-red-500">{errors.agreeTerms}</p>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {text("Création du compte...", "Creating account...")}
                  </span>
                ) : (
                  text("Créer mon compte", "Create account")
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-500">{text("Ou s'inscrire avec", "Or sign up with")}</span>
              </div>
            </div>

            <SocialAuthButtons callbackUrl={socialCallbackUrl} />
            <div className="hidden">
              <button className="w-full inline-flex justify-center py-2 px-4 border border-gray-700 rounded-md shadow-sm bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                </svg>
                <span className="ml-2">Google</span>
              </button>

              <button className="w-full inline-flex justify-center py-2 px-4 border border-gray-700 rounded-md shadow-sm bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="ml-2">GitHub</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
