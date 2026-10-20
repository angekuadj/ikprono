"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  COMBINATION_DAILY_LIMIT,
  COMBINATIONS_MONTHLY_PRICE_FCFA,
  PACK_MONTHLY_PRICE_FCFA,
  TV_ACCESS_HOURS,
  TV_DAILY_PRICE_FCFA,
  TRIAL_DAYS,
  TRIAL_DAILY_LIMIT,
  type SubscriptionOffer,
} from "@/lib/subscription";

interface OfferDefinition {
  id: SubscriptionOffer;
  emoji: string;
  titleFr: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEn: string;
  price: number;
  periodFr: string;
  periodEn: string;
  recommended?: boolean;
  featuresFr: string[];
  featuresEn: string[];
}

const OFFERS: OfferDefinition[] = [
  {
    id: "tv",
    emoji: "📺",
    titleFr: "Offre TV",
    titleEn: "TV plan",
    descriptionFr: "Regardez les matchs en direct sur le site, sans restriction.",
    descriptionEn: "Watch live matches on the site without restrictions.",
    price: TV_DAILY_PRICE_FCFA,
    periodFr: " / jour",
    periodEn: " / day",
    featuresFr: [
      "Vidéos des matchs en direct",
      "Accès valable 24 h à partir du paiement",
      "Tous les matchs, même hors de vos combinaisons",
    ],
    featuresEn: [
      "Live match videos",
      "24-hour access from payment",
      "Every match, even outside your combinations",
    ],
  },
  {
    id: "combinations",
    emoji: "🎯",
    titleFr: "Offre Combinaisons",
    titleEn: "Combinations plan",
    descriptionFr: `Générez jusqu’à ${COMBINATION_DAILY_LIMIT} combinaisons par jour.`,
    descriptionEn: `Generate up to ${COMBINATION_DAILY_LIMIT} combinations per day.`,
    price: COMBINATIONS_MONTHLY_PRICE_FCFA,
    periodFr: " / mois",
    periodEn: " / month",
    featuresFr: [
      `${COMBINATION_DAILY_LIMIT} combinaisons par jour`,
      "Sélection par rencontres, par équipes ou IA",
      "Suivi des résultats et export PDF",
    ],
    featuresEn: [
      `${COMBINATION_DAILY_LIMIT} combinations per day`,
      "Selection by fixtures, teams or AI",
      "Result tracking and PDF export",
    ],
  },
  {
    id: "pack",
    emoji: "🎁",
    titleFr: "Pack Combinaisons + TV",
    titleEn: "Combinations + TV bundle",
    descriptionFr: `Les deux offres ensemble : ${COMBINATION_DAILY_LIMIT} combinaisons par jour et toutes les vidéos en direct.`,
    descriptionEn: `Both plans together: ${COMBINATION_DAILY_LIMIT} combinations per day and every live video.`,
    price: PACK_MONTHLY_PRICE_FCFA,
    periodFr: " / mois",
    periodEn: " / month",
    recommended: true,
    featuresFr: [
      `${COMBINATION_DAILY_LIMIT} combinaisons par jour`,
      "Vidéos des matchs en direct, sans restriction",
      "Moins cher que les deux offres séparées",
    ],
    featuresEn: [
      `${COMBINATION_DAILY_LIMIT} combinations per day`,
      "Unrestricted live match videos",
      "Cheaper than both plans separately",
    ],
  },
];

export default function PaymentPage() {
  const { t, text } = useLanguage();
  const { user, isAuthenticated, entitlements, setOffer } = useAuth();
  const [busyOffer, setBusyOffer] = useState<SubscriptionOffer | null>(null);
  const [notice, setNotice] = useState("");
  const [offerError, setOfferError] = useState("");

  const handleToggleOffer = async (offerId: SubscriptionOffer) => {
    if (!isAuthenticated) return;
    setBusyOffer(offerId);
    setNotice("");
    setOfferError("");
    const wasActive = entitlements.offers.includes(offerId);
    try {
      await setOffer(offerId);
      const offer = OFFERS.find(item => item.id === offerId)!;
      setNotice(text(
        wasActive
          ? `${offer.titleFr} a été désactivée.`
          : offerId === "tv"
            ? `${offer.titleFr} est active pour les prochaines ${TV_ACCESS_HOURS} h.`
            : `${offer.titleFr} est maintenant active.`,
        wasActive
          ? `${offer.titleEn} has been turned off.`
          : offerId === "tv"
            ? `${offer.titleEn} is active for the next ${TV_ACCESS_HOURS} hours.`
            : `${offer.titleEn} is now active.`
      ));
    } catch (error) {
      setOfferError(error instanceof Error
        ? error.message
        : text("Impossible de modifier l'offre pour le moment.", "Unable to update the plan right now."));
    } finally {
      setBusyOffer(null);
    }
  };

  const isActive = (offerId: SubscriptionOffer) =>
    offerId === "tv"
      // L'offre TV n'est « active » que pendant la journée payée.
      ? entitlements.offers.includes("tv") && (entitlements.trialActive || entitlements.hasTvAccess)
      : entitlements.offers.includes(offerId);

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-white mb-4">
            {text("Choisissez votre offre", "Choose your plan")}
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {text(
              `Offres à la carte : TV ${TV_DAILY_PRICE_FCFA} FCFA/jour, Combinaisons ${COMBINATIONS_MONTHLY_PRICE_FCFA} FCFA/mois, ou le pack Combi + TV à ${PACK_MONTHLY_PRICE_FCFA} FCFA/mois.`,
              `Pick what fits you: TV ${TV_DAILY_PRICE_FCFA} XOF/day, Combinations ${COMBINATIONS_MONTHLY_PRICE_FCFA} XOF/month, or the Combi + TV bundle at ${PACK_MONTHLY_PRICE_FCFA} XOF/month.`
            )}
          </p>
        </div>

        {!isAuthenticated && (
          <div className="mx-auto mb-8 max-w-4xl rounded-2xl border border-green-800 bg-green-950/20 p-6 text-center">
            <p className="text-sm text-green-100">
              {text(
                `${TRIAL_DAYS} jours d’essai gratuit vous sont offerts à la première connexion (${TRIAL_DAILY_LIMIT} combinaisons par jour + vidéos en direct).`,
                `A ${TRIAL_DAYS}-day free trial is offered on your first sign-in (${TRIAL_DAILY_LIMIT} combinations per day + live videos).`
              )}
            </p>
            <Link
              href="/login?next=%2Fpayment"
              className="mt-4 inline-block rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500"
            >
              {text("Se connecter pour commencer l’essai", "Sign in to start the trial")}
            </Link>
          </div>
        )}

        {isAuthenticated && (
          <div className="mx-auto mb-8 max-w-4xl rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-bold text-white">
              {text("Votre accès actuel", "Your current access")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              <li>
                {entitlements.trialActive
                  ? text(
                    `Essai gratuit : ${entitlements.trialDaysLeft} jour(s) restant(s).`,
                    `Free trial: ${entitlements.trialDaysLeft} day(s) left.`
                  )
                  : text("Essai gratuit terminé.", "Free trial ended.")}
              </li>
              <li>
                {text("Vidéos en direct : ", "Live videos: ")}
                {entitlements.hasTvAccess
                  ? text("accessibles", "available")
                  : text("limitées aux matchs suivis dans le panier", "limited to matches tracked in your basket")}
              </li>
              <li>
                {text("Combinaisons : ", "Combinations: ")}
                {entitlements.hasCombinationAccess
                  ? text(
                    `${entitlements.remainingToday} restante(s) aujourd’hui (sur ${entitlements.dailyLimit}).`,
                    `${entitlements.remainingToday} left today (out of ${entitlements.dailyLimit}).`
                  )
                  : text("aucune offre active", "no active plan")}
              </li>
            </ul>
            {notice && (
              <p role="status" className="mt-4 rounded-lg border border-green-800 bg-green-950/40 px-4 py-3 text-sm text-green-200">
                {notice}
              </p>
            )}
            {offerError && (
              <p role="alert" className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {offerError}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 max-w-6xl mx-auto">
          {OFFERS.map(offer => {
            const active = isActive(offer.id);
            return (
              <div
                key={offer.id}
                className={`relative bg-gray-900 border rounded-2xl overflow-hidden transition-all duration-300 hover:border-green-500 ${
                  active ? "border-green-600 ring-2 ring-green-600/40" : "border-gray-800"
                }`}
              >
                {active && (
                  <div className="absolute top-0 right-0 bg-green-600 text-white px-4 py-1 text-sm font-semibold">
                    {text("Active", "Active")}
                  </div>
                )}
                {!active && offer.recommended && (
                  <div className="absolute top-0 left-0 bg-gradient-to-r from-green-600 to-emerald-700 text-white px-4 py-1 text-xs font-semibold uppercase tracking-wide">
                    {text("Recommandé", "Recommended")}
                  </div>
                )}
                <div className="p-8">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    <span aria-hidden="true" className="mr-2">{offer.emoji}</span>
                    {text(offer.titleFr, offer.titleEn)}
                  </h3>
                  <p className="text-gray-400 mb-6">{text(offer.descriptionFr, offer.descriptionEn)}</p>

                  <div className="mb-6">
                    <span className="text-5xl font-bold text-white gradient-text">
                      {offer.price.toLocaleString("fr-FR")} FCFA
                    </span>
                    <span className="text-gray-400">{text(offer.periodFr, offer.periodEn)}</span>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {(offer.featuresFr).map((feature, index) => (
                      <li key={feature} className="flex items-start">
                        <svg
                          className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-300">{text(feature, offer.featuresEn[index])}</span>
                      </li>
                    ))}
                  </ul>

                  {(() => {
                    // Cliquable uniquement si l'utilisateur est connecté, hors essai
                    // et que l'offre n'est pas déjà active (sinon : bouton grisé).
                    const canSubscribe = isAuthenticated
                      && !entitlements.trialActive
                      && !active
                      && busyOffer === null;
                    return (
                      <button
                        type="button"
                        onClick={() => void handleToggleOffer(offer.id)}
                        disabled={!canSubscribe}
                        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 disabled:cursor-not-allowed ${
                          canSubscribe
                            ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg"
                            : "border-2 border-gray-700 bg-gray-800/60 text-gray-400 opacity-70"
                        }`}
                      >
                        {busyOffer === offer.id
                          ? t("processing")
                          : entitlements.trialActive
                            ? text("Inclus dans votre essai", "Included in your trial")
                            : active
                              ? text("Abonnement actif", "Subscription active")
                              : text("Choisir cette offre", "Choose this plan")}
                      </button>
                    );
                  })()}
                  {!isAuthenticated && (
                    <p className="mt-3 text-center text-xs text-gray-400">
                      {text(
                        "Connectez-vous pour souscrire à une offre.",
                        "Sign in to subscribe to a plan."
                      )}
                    </p>
                  )}
                  {isAuthenticated && entitlements.trialActive && !active && (
                    <p className="mt-3 text-center text-xs text-gray-400">
                      {text(
                        `Votre essai gratuit (${entitlements.trialDaysLeft} jour(s) restant(s)) inclut déjà cette offre : la souscription sera possible à la fin de l’essai.`,
                        `Your free trial (${entitlements.trialDaysLeft} day(s) left) already includes this plan: you can subscribe once the trial ends.`
                      )}
                    </p>
                  )}
                  {offerError && (
                    <p role="alert" className="mt-3 text-center text-xs text-red-300">
                      {offerError}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-10 max-w-4xl mx-auto">
          <h2 className="text-lg font-bold text-white mb-2">
            {text("Et si je n’ai aucune offre ?", "What if I have no plan?")}
          </h2>
          <p className="text-sm text-gray-400">
            {text(
              "Après votre essai gratuit, vous pouvez continuer à consulter le site. Les vidéos en direct restent accessibles uniquement pour les matchs suivis dans votre panier, et la génération de combinaisons est mise en pause jusqu’à la souscription d’une offre.",
              "After your free trial you can keep browsing the site. Live videos remain available only for matches tracked in your basket, and combination generation is paused until you subscribe to a plan."
            )}
          </p>
        </div>

        {/* Lottery Section */}
        <div className="bg-gradient-to-r from-green-900/30 to-gray-900 border border-green-800 rounded-2xl p-8 mb-8 max-w-4xl mx-auto animate-slide-up">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                🎰 {t("lotteryTitle")}
              </h2>
              <p className="text-gray-400">
                {t("lotteryDescription")}
              </p>
            </div>
            <Link
              href="/lottery"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition hover-glow animate-scale-in"
            >
              {t("seeLotteries")}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center card-hover hover-lift">
              <div className="text-3xl mb-2 animate-float">🏆</div>
              <p className="text-white font-semibold">iPhone 15 Pro</p>
              <p className="text-gray-400 text-sm">{text("Tirage mensuel", "Monthly draw")}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center card-hover hover-lift">
              <div className="text-3xl mb-2 animate-float stagger-1">💰</div>
              <p className="text-white font-semibold">10 000€</p>
              <p className="text-gray-400 text-sm">{text("Jackpot hebdo", "Weekly jackpot")}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center card-hover hover-lift">
              <div className="text-3xl mb-2 animate-float stagger-2">🎁</div>
              <p className="text-white font-semibold">{text("Abonnement gratuit", "Free subscription")}</p>
              <p className="text-gray-400 text-sm">{text("Tirage quotidien", "Daily draw")}</p>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {t("paymentMethods")}
          </h2>
          <div className="flex flex-wrap justify-center items-center gap-8">
            <div className="flex items-center text-gray-400">
              <svg className="h-8 w-8 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
              </svg>
              <span className="font-medium">{t("card")}</span>
            </div>
            <div className="flex items-center text-gray-400">
              <span className="font-medium">PayPal</span>
            </div>
            <div className="flex items-center text-gray-400">
              <span className="font-medium">Mobile Money</span>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {text("Questions fréquentes", "Frequently asked questions")}
          </h2>
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-4">
              <h3 className="font-semibold text-white mb-2">
                {text("Puis-je annuler mon abonnement à tout moment ?", "Can I cancel my subscription at any time?")}
              </h3>
              <p className="text-gray-400">
                {text(
                  "Oui. L’offre TV s’arrête automatiquement 24 h après le dernier paiement, sans démarche. Les offres mensuelles restent actives jusqu’à leur désactivation : contactez le support depuis la page Contact.",
                  "Yes. The TV plan stops automatically 24 hours after your last payment, no action needed. Monthly plans stay active until deactivated: contact support from the Contact page."
                )}
              </p>
            </div>
            <div className="border-b border-gray-800 pb-4">
              <h3 className="font-semibold text-white mb-2">
                {text("Y a-t-il une période d'essai ?", "Is there a free trial?")}
              </h3>
              <p className="text-gray-400">
                {text(
                  `Oui : ${TRIAL_DAYS} jours d’essai gratuit à la première connexion, avec ${TRIAL_DAILY_LIMIT} combinaisons par jour et les vidéos en direct.`,
                  `Yes: a ${TRIAL_DAYS}-day free trial on your first sign-in, with ${TRIAL_DAILY_LIMIT} combinations per day and live videos.`
                )}
              </p>
            </div>
            <div className="border-b border-gray-800 pb-4">
              <h3 className="font-semibold text-white mb-2">
                {text("Puis-je prendre les deux offres ?", "Can I take both plans?")}
              </h3>
              <p className="text-gray-400">
                {text(
                  `Oui : prenez le pack Combinaisons + TV à ${PACK_MONTHLY_PRICE_FCFA} FCFA/mois. Il coûte moins cher que l'offre Combinaisons (${COMBINATIONS_MONTHLY_PRICE_FCFA} FCFA/mois) suivie de l'offre TV à ${TV_DAILY_PRICE_FCFA} FCFA/jour.`,
                  `Yes: get the Combinations + TV bundle at ${PACK_MONTHLY_PRICE_FCFA} XOF/month. It costs less than the Combinations plan (${COMBINATIONS_MONTHLY_PRICE_FCFA} XOF/month) plus the TV plan at ${TV_DAILY_PRICE_FCFA} XOF/day.`
                )}
              </p>
            </div>
            <div className="border-b border-gray-800 pb-4">
              <h3 className="font-semibold text-white mb-2">
                {text("Comment est facturée l'offre TV ?", "How is the TV plan billed?")}
              </h3>
              <p className="text-gray-400">
                {text(
                  `L'offre TV se paie à la journée : ${TV_DAILY_PRICE_FCFA} FCFA par paiement, et chaque paiement ouvre l'accès aux vidéos en direct pendant 24 h.`,
                  `The TV plan is billed daily: ${TV_DAILY_PRICE_FCFA} XOF per payment, and each payment unlocks live videos for 24 hours.`
                )}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">
                {text("Que se passe-t-il sans offre TV ?", "What happens without the TV plan?")}
              </h3>
              <p className="text-gray-400">
                {text(
                  "Vous ne pouvez regarder que les matchs en direct qui figurent dans vos combinaisons (matchs suivis dans le panier).",
                  "You can only watch live matches that are part of your combinations (matches tracked in your basket)."
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-8">
          <Link
            href="/"
            className="inline-flex items-center text-gray-400 hover:text-white font-medium"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {text("Retour à l'accueil", "Back to home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
