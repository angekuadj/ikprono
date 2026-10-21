"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const { text } = useLanguage();

  const englishFaqs: [string, [string, string][]][] = [
      ["General", [
        ["What is IkProno?", "IkProno helps you browse real football, basketball, and tennis fixtures by date and competition, and save the matches you follow."],
        ["Does IkProno provide betting predictions or odds?", "No. Betting odds and betting predictions are not currently provided. IkProno focuses on real fixture calendars and match information."],
        ["Are fixture schedules guaranteed to be complete?", "Fixture availability depends on the sports data providers and competitions available for the selected date."]
      ]],
      ["Account and Subscription", [
        ["How do I create an account?", "Click the Sign up button at the top of the page, fill in your details, and verify your email. You can then access the available features."],
        ["What subscription plans are available?", "The payment page lists the plans and prices currently available, including TV, Combinations, and the combined plan."],
        ["Can I cancel my subscription?", "For questions about an active subscription, contact support using the contact details on the Contact page."],
        ["How can I pay?", "The payment page shows the plans and payment methods currently available to your account."]
      ]],
      ["Fixtures", [
        ["Which sports are available?", "Browse real fixtures for football, basketball, and tennis when the corresponding provider credentials are configured."],
        ["Can I browse fixtures by date?", "Yes. The fixture calendar includes day, week, and month views."],
        ["Does IkProno provide betting odds or predictions?", "No. Betting odds and betting predictions are disabled. The calendar displays real fixtures."],
        ["Are the fixtures real?", "Yes. Fixture data is requested from the configured sports data providers; availability depends on their API access."]
      ]],
      ["Features", [
        ["How does the fixture calendar work?", "Choose a day, week, or month and filter real fixtures by football, basketball, or tennis."],
        ["Are the lottery draws real?", "No. The lottery page is a local demonstration: prizes, participant counts, tickets, and results are simulated. No real entry or prize is offered."],
        ["Can I use IkProno on mobile?", "Yes. The website is responsive and can be used in a mobile browser. A dedicated mobile app is planned."]
      ]],
      ["Support", [
        ["How can I contact support?", "Use the Contact page to prepare an email to support@ikprono.com."],
        ["How quickly does support respond?", "Response times may vary. Contact support by email for assistance."],
        ["I forgot my password. What should I do?", "Click Forgot password on the sign-in page. You will receive an email with instructions to reset your password."]
      ]]
    ];

  const faqs = [
    {
      category: "Général",
      questions: [
        {
          q: "Qu'est-ce qu'IkProno ?",
          a: "IkProno vous permet de parcourir les rencontres réelles de football, basketball et tennis par date et compétition, puis d’enregistrer les matchs que vous suivez."
        },
        {
          q: "IkProno propose-t-il des pronostics ou des cotes de paris ?",
          a: "Non. Les cotes et pronostics de paris ne sont pas proposés actuellement. IkProno se concentre sur les calendriers de rencontres réelles et les informations des matchs."
        },
        {
          q: "Les calendriers sont-ils toujours complets ?",
          a: "La disponibilité des rencontres dépend des fournisseurs de données sportives et des compétitions accessibles pour la date choisie."
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
          a: "La page de paiement présente les offres et tarifs actuellement disponibles, notamment TV, Combinaisons et le Pack Combinaisons + TV."
        },
        {
          q: "Puis-je annuler mon abonnement ?",
          a: "Pour toute question concernant un abonnement actif, contactez le support avec les coordonnées indiquées sur la page Contact."
        },
        {
          q: "Comment payer ?",
          a: "La page de paiement affiche les offres et les moyens de paiement actuellement disponibles pour votre compte."
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
          q: "Comment fonctionnent les lotteries ?",
          a: "Non. La page des lotteries est une démonstration locale : les lots, nombres de participants, tickets et résultats sont simulés. Aucune participation ni récompense réelle n’est proposée."
        },
        {
          q: "L'application est-elle disponible sur mobile ?",
          a: "Oui. Le site s’adapte aux navigateurs mobiles. Une application mobile dédiée est prévue."
        }
      ]
    },
    {
      category: "Support",
      questions: [
        {
          q: "Comment contacter le support ?",
          a: "Utilisez la page Contact pour préparer un e-mail à l’adresse support@ikprono.com."
        },
        {
          q: "Quel est le temps de réponse du support ?",
          a: "Le délai de réponse peut varier. Contactez le support par e-mail pour obtenir de l’aide."
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
