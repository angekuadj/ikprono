"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

const plans = [
  {
    id: "standard",
    popular: false,
  },
  {
    id: "premium",
    popular: true,
  },
];

export default function PaymentPage() {
  const [loading, setLoading] = useState(false);
  const { language, t, text } = useLanguage();

  const handleSubscribe = async (planId: string) => {
    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      alert(t("paymentSimulated"));
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-white mb-4">
            {t("choosePlan")}
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {t("pricingDescription")}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 hover:border-green-500 card-hover animate-slide-up stagger-${index + 1} ${
                plan.popular ? "ring-2 ring-green-500 shadow-lg shadow-green-500/20" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-1 text-sm font-semibold animate-pulse">
                  {t("recommended")}
                </div>
              )}
              
              <div className="p-8">
                <h3 className="text-2xl font-bold text-white mb-2">
                  {plan.id === "premium" ? t("premiumPlan") : t("standardPlan")}
                </h3>
                <p className="text-gray-400 mb-6">
                  {plan.id === "premium" ? t("premiumDescription") : t("standardDescription")}
                </p>
                
                <div className="mb-6">
                  <span className="text-5xl font-bold text-white gradient-text">
                    {plan.id === "premium" ? (language === "fr" ? "3 000 FCFA" : "3,000 XOF") : t("free")}
                  </span>
                  <span className="text-gray-400">
                    {plan.id === "premium" ? t("perMonth") : ""}
                  </span>
                </div>

                <ul className="space-y-4 mb-8">
                  {(plan.id === "premium"
                    ? [t("unlimitedProposals"), t("liveScores"), t("detailedAnalysis"), t("prioritySupport"), t("exclusiveLotteries")]
                    : [t("threeProposals"), t("liveScores"), t("basicAnalysis")]
                  ).map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <svg
                        className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading || plan.id === "standard"}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                    plan.popular
                      ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg hover-glow"
                      : "border-2 border-gray-700 text-gray-300 hover:border-green-500 hover:text-green-500"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? t("processing") : plan.id === "premium" ? t("subscribe") : t("free")}
                </button>
              </div>
            </div>
          ))}
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
              <svg className="h-8 w-8 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              <span className="font-medium">PayPal</span>
            </div>
            <div className="flex items-center text-gray-400">
              <svg className="h-8 w-8 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
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
                {text("Oui, vous pouvez annuler votre abonnement à tout moment depuis votre compte. Aucun frais caché.", "Yes, you can cancel your subscription at any time from your account. No hidden fees.")}
              </p>
            </div>
            <div className="border-b border-gray-800 pb-4">
              <h3 className="font-semibold text-white mb-2">
                {text("Y a-t-il une période d'essai ?", "Is there a free trial?")}
              </h3>
              <p className="text-gray-400">
                {text("Oui, tous les plans incluent 7 jours d'essai gratuit sans engagement.", "Yes, all plans include a 7-day free trial with no commitment.")}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">
                {text("Comment fonctionnent les lotteries ?", "How do the lotteries work?")}
              </h3>
              <p className="text-gray-400">
                {text("Les membres Premium participent automatiquement aux tirages. Plus vous êtes actif, plus vous avez de chances de gagner !", "Premium members are automatically entered into the draws. The more active you are, the better your chances of winning!")}
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
