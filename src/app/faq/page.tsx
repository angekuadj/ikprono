"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const { text } = useLanguage();

  const englishFaqs: [string, [string, string][]][] = [
      ["General", [
        ["What is IkProno?", "IkProno is a sports prediction app powered by artificial intelligence. Our AI analyzes hundreds of matches every day to identify betting opportunities with statistical value."],
        ["How does the AI work?", "Our AI uses historical data, team statistics, player performance, and market odds to generate predictions. It compares its estimates with real odds to identify genuine opportunities."],
        ["Does IkProno guarantee winnings?", "No. No sports betting system can guarantee winnings. IkProno uses statistical analysis and value betting to help inform your decisions, but there is no such thing as zero risk in sports betting."]
      ]],
      ["Account and Subscription", [
        ["How do I create an account?", "Click the Sign up button at the top of the page, fill in your details, and verify your email. You can then access the available features."],
        ["What subscription plans are available?", "We offer free Standard access and a Premium subscription. Prices are displayed on the payment page. Premium provides access to additional AI predictions and exclusive features."],
        ["Can I cancel my subscription?", "Yes. You can cancel your subscription at any time from your dashboard or by contacting support. There is no long-term commitment."],
        ["How can I pay?", "Available payment methods are shown on the payment page. Payments are processed securely when a payment provider is connected."]
      ]],
      ["Fixtures", [
        ["Which sports are available?", "Browse real fixtures for football, basketball, and tennis when the corresponding provider credentials are configured."],
        ["Can I browse fixtures by date?", "Yes. The fixture calendar includes day, week, and month views."],
        ["Does IkProno provide betting odds or predictions?", "No. Betting odds and betting predictions are disabled. The calendar displays real fixtures."]
      ]],
      ["Features", [
        ["How does the fixture calendar work?", "Choose a day, week, or month and filter real fixtures by football, basketball, or tennis."],
        ["Are the fixtures real?", "Yes. Fixture data is requested from the configured sports data providers; availability depends on their API access."],
        ["How do the lotteries work?", "Lotteries are exclusive draws available to Premium subscribers. Check each draw's details for participation rules and prizes."],
        ["Is the app available on mobile?", "Yes. IkProno is a Progressive Web App (PWA) that can be installed on Android and iOS. Add it to your home screen for an app-like experience."]
      ]],
      ["Support", [
        ["How can I contact support?", "Contact us using the Help page form, email support@ikprono.com, or the live chat when available."],
        ["How quickly does support respond?", "We generally reply to emails within 24 hours. Live chat availability may vary."],
        ["I forgot my password. What should I do?", "Click Forgot password on the sign-in page. You will receive an email with instructions to reset your password."]
      ]]
    ];

  const faqs = [
    {
      category: "Général",
      questions: [
        {
          q: "Qu'est-ce qu'IkProno ?",
          a: "IkProno est une application de prédictions sportives alimentée par l'intelligence artificielle. Notre IA analyse des centaines de matchs chaque jour pour identifier les paris à forte valeur statistique."
        },
        {
          q: "Comment fonctionne l'IA ?",
          a: "Notre IA utilise des données historiques, les statistiques des équipes, les performances des joueurs et les cotes du marché pour générer des prédictions. Elle compare ses estimations aux cotes réelles pour ne retenir que les paris où l'opportunité est réelle."
        },
        {
          q: "IkProno garantit-il des gains ?",
          a: "Non. Aucun système de paris sportifs ne peut garantir des gains. IkProno maximise vos probabilités via l'analyse statistique et le value betting, mais le risque zéro n'existe pas dans les paris sportifs."
        }
      ]
    },
    {
      category: "Compte et Abonnement",
      questions: [
        {
          q: "Comment créer un compte ?",
          a: "Cliquez sur le bouton 'S'inscrire' en haut de la page, remplissez le formulaire avec vos informations et validez votre email. Vous pourrez ensuite accéder à toutes les fonctionnalités."
        },
        {
          q: "Quels sont les plans d'abonnement ?",
          a: "Nous proposons des abonnements hebdomadaires et mensuels. Les tarifs sont affichés sur la page de paiement. L'abonnement Premium donne accès à toutes les prédictions IA et aux lotteries exclusives."
        },
        {
          q: "Puis-je annuler mon abonnement ?",
          a: "Oui, vous pouvez annuler votre abonnement à tout moment depuis votre dashboard ou en contactant le support. Aucun engagement n'est requis."
        },
        {
          q: "Comment payer ?",
          a: "Nous acceptons les paiements par carte bancaire, PayPal et autres méthodes sécurisées. Tous les paiements sont traités via notre partenaire de paiement sécurisé."
        }
      ]
    },
    {
      category: "Rencontres",
      questions: [
        {
          q: "Quels sports sont disponibles ?",
          a: "Le calendrier affiche les rencontres réelles disponibles en football, basketball et tennis selon l’accès configuré aux fournisseurs."
        },
        {
          q: "Puis-je parcourir les rencontres par date ?",
          a: "Oui. Le calendrier propose une vue par jour, par semaine et par mois."
        },
        {
          q: "IkProno fournit-il des cotes ou des pronostics de paris ?",
          a: "Non. Les cotes et pronostics de paris sont désactivés. IkProno affiche les calendriers de rencontres réelles."
        },
        {
          q: "Les rencontres affichées sont-elles réelles ?",
          a: "Oui. Les calendriers sont récupérés auprès de fournisseurs de données sportives ; leur disponibilité dépend de la configuration des clés API."
        }
      ]
    },
    {
      category: "Fonctionnalités",
      questions: [
        {
          q: "Comment fonctionne le calendrier ?",
          a: "Choisissez un jour, une semaine ou un mois, puis filtrez les rencontres par football, basketball ou tennis."
        },
        {
          q: "Les endpoints de données sportives sont-ils activés ?",
          a: "Oui. Les appels sont effectués côté serveur avec les clés API configurées."
        },
        {
          q: "Comment fonctionnent les lotteries ?",
          a: "Les lotteries sont des tirages exclusifs réservés aux abonnés Premium. Vous pouvez participer gratuitement et gagner des prix. Les tirages ont lieu régulièrement."
        },
        {
          q: "L'application est-elle disponible sur mobile ?",
          a: "Oui, IkProno est une Progressive Web App (PWA) installable sur Android et iOS. Ajoutez-la à votre écran d'accueil pour une expérience comme une vraie application."
        }
      ]
    },
    {
      category: "Support",
      questions: [
        {
          q: "Comment contacter le support ?",
          a: "Vous pouvez nous contacter via le formulaire de la page Aide, par email à support@ikprono.com, ou via le chat en direct disponible pendant les heures ouvrées."
        },
        {
          q: "Quel est le temps de réponse du support ?",
          a: "Nous répondons généralement aux emails dans les 24 heures. Le chat en direct est disponible du lundi au vendredi de 9h à 18h (heure de Paris)."
        },
        {
          q: "J'ai oublié mon mot de passe, que faire ?",
          a: "Cliquez sur 'Mot de passe oublié' sur la page de connexion. Vous recevrez un email pour réinitialiser votre mot de passe."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Questions Fréquentes", "Frequently Asked Questions")}
          </h1>
          <p className="text-gray-400 text-lg">
            {text("Tout ce que vous devez savoir sur IkProno", "Everything you need to know about IkProno")}
          </p>
        </div>

        {/* FAQ Categories */}
        {faqs.map((category, categoryIndex) => (
          <div key={categoryIndex} className="mb-8 animate-slide-up" style={{ animationDelay: `${categoryIndex * 0.1}s` }}>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              {text(category.category, englishFaqs[categoryIndex]?.[0] ?? category.category)}
            </h2>

            <div className="space-y-4">
              {category.questions.map((faq, faqIndex) => (
                <div
                  key={faqIndex}
                  className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden card-hover"
                >
                  <button
                    onClick={() => setOpenIndex(openIndex === `${categoryIndex}-${faqIndex}` ? null : `${categoryIndex}-${faqIndex}`)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-800 transition"
                  >
                    <span className="text-white font-medium">{text(faq.q, englishFaqs[categoryIndex]?.[1][faqIndex]?.[0] ?? faq.q)}</span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        openIndex === `${categoryIndex}-${faqIndex}` ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openIndex === `${categoryIndex}-${faqIndex}` && (
                    <div className="px-6 py-4 border-t border-gray-800 bg-gray-800/50 animate-slide-down">
                      <p className="text-gray-400 leading-relaxed">{text(faq.a, englishFaqs[categoryIndex]?.[1][faqIndex]?.[1] ?? faq.a)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="mt-12 bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-gray-800 rounded-xl p-8 text-center animate-slide-up">
          <h3 className="text-2xl font-bold text-white mb-4">
            {text("Vous ne trouvez pas votre réponse ?", "Can't find your answer?")}
          </h3>
          <p className="text-gray-400 mb-6">
            {text("Notre équipe est là pour vous aider. N'hésitez pas à nous contacter !", "Our team is here to help. Feel free to get in touch!")}
          </p>
          <a
            href="/help"
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold transition hover-glow"
          >
            {text("Contacter le support", "Contact support")}
          </a>
        </div>
      </div>
    </div>
  );
}
