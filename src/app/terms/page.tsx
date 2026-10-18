"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function TermsPage() {
  const { text } = useLanguage();
  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Conditions d'utilisation", "Terms of Service")}
          </h1>
          <p className="text-gray-400 text-lg">
            {text("Dernière mise à jour : 14 Octobre 2026", "Last updated: October 14, 2026")}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-8 animate-slide-up">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("1. Introduction", "1. Introduction")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Bienvenue sur IkProno. En utilisant notre application, vous acceptez les présentes conditions d'utilisation. Veuillez les lire attentivement avant d'utiliser nos services.", "Welcome to IkProno. By using our application, you agree to these Terms of Service. Please read them carefully before using our services.")}
            </p>
          </section>

          {/* Acceptation */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("2. Acceptation des conditions", "2. Acceptance of Terms")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("En accédant à IkProno et en l'utilisant, vous acceptez d'être lié par ces conditions d'utilisation et toutes les lois et réglementations applicables. Si vous n'êtes pas d'accord avec l'une de ces conditions, vous n'êtes pas autorisé à utiliser notre service.", "By accessing and using IkProno, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you disagree with any of these terms, you may not use our service.")}
            </p>
          </section>

          {/* Description du service */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("3. Description du service", "3. Service Description")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("IkProno est une application de prédictions sportives alimentée par l'intelligence artificielle. Nos services incluent :", "IkProno is an AI-powered sports prediction application. Our services include:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Génération de prédictions sportives basées sur l'IA", "AI-powered sports predictions")}</li>
              <li>{text("Analyses statistiques de matchs", "Statistical match analysis")}</li>
              <li>{text("Création de combinaisons personnalisées", "Custom accumulator creation")}</li>
              <li>{text("Recherche IA de matchs selon vos critères", "AI match search based on your criteria")}</li>
              <li>{text("Accès aux scores en direct", "Live scores")}</li>
              <li>{text("Participation aux lotteries (abonnés Premium)", "Lottery participation (Premium subscribers)")}</li>
            </ul>
          </section>

          {/* Compte utilisateur */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("4. Compte utilisateur", "4. User Account")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Pour utiliser certaines fonctionnalités, vous devez créer un compte. Vous êtes responsable de :", "You must create an account to use certain features. You are responsible for:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Maintenir la confidentialité de vos identifiants", "Keeping your login credentials confidential")}</li>
              <li>{text("Toutes les activités qui se produisent sous votre compte", "All activity that occurs under your account")}</li>
              <li>{text("Notifier immédiatement toute utilisation non autorisée de votre compte", "Immediately reporting any unauthorized use of your account")}</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-4">
              {text("IkProno se réserve le droit de suspendre ou de résilier votre compte en cas de violation de ces conditions.", "IkProno reserves the right to suspend or terminate your account if you violate these terms.")}
            </p>
          </section>

          {/* Abonnements et paiements */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("5. Abonnements et paiements", "5. Subscriptions and Payments")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("IkProno propose des abonnements payants donnant accès à des fonctionnalités Premium.", "IkProno offers paid subscriptions that provide access to Premium features.")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Les abonnements sont renouvelés automatiquement sauf annulation", "Subscriptions renew automatically unless cancelled")}</li>
              <li>{text("Les paiements sont sécurisés via notre partenaire de paiement", "Payments are securely processed by our payment partner")}</li>
              <li>{text("Les remboursements sont soumis à notre politique de remboursement", "Refunds are subject to our refund policy")}</li>
              <li>{text("Les tarifs peuvent être modifiés avec un préavis de 30 jours", "Prices may change with 30 days' notice")}</li>
            </ul>
          </section>

          {/* Prédictions et paris */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("6. Prédictions et paris", "6. Predictions and Betting")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Important concernant nos prédictions :", "Important information about our predictions:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Les prédictions sont fournies à titre informatif uniquement", "Predictions are provided for informational purposes only")}</li>
              <li>{text("IkProno ne garantit aucun gain ou résultat", "IkProno does not guarantee winnings or outcomes")}</li>
              <li>{text("Les paris sportifs comportent des risques financiers", "Sports betting involves financial risk")}</li>
              <li>{text("Vous êtes seul responsable de vos décisions de paris", "You are solely responsible for your betting decisions")}</li>
              <li>{text("Ne pariez jamais plus que ce que vous pouvez vous permettre de perdre", "Never bet more than you can afford to lose")}</li>
            </ul>
          </section>

          {/* Propriété intellectuelle */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("7. Propriété intellectuelle", "7. Intellectual Property")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Tout le contenu d'IkProno, y compris mais sans s'y limiter :", "All IkProno content, including but not limited to:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Textes, graphiques, logos et images", "Text, graphics, logos, and images")}</li>
              <li>{text("Algorithmes et modèles d'IA", "AI algorithms and models")}</li>
              <li>{text("Données et statistiques", "Data and statistics")}</li>
              <li>{text("Code source et design de l'application", "Source code and application design")}</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-4">
              {text("sont la propriété exclusive d'IkProno et sont protégés par les lois sur le droit d'auteur.", "are the exclusive property of IkProno and are protected by copyright laws.")}
            </p>
          </section>

          {/* Limitation de responsabilité */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("8. Limitation de responsabilité", "8. Limitation of Liability")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Dans la mesure maximale permise par la loi, IkProno ne sera pas responsable des dommages directs, indirects, accessoires, spéciaux ou consécutifs résultant de l'utilisation ou de l'impossibilité d'utiliser nos services, y compris les pertes financières liées aux paris sportifs.", "To the maximum extent permitted by law, IkProno is not liable for direct, indirect, incidental, special, or consequential damages resulting from the use or inability to use our services, including financial losses related to sports betting.")}
            </p>
          </section>

          {/* Résiliation */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("9. Résiliation", "9. Termination")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Nous nous réservons le droit de résilier ou de suspendre votre accès à IkProno à tout moment, avec ou sans préavis, pour toute raison, y compris mais sans s'y limiter la violation de ces conditions.", "We reserve the right to terminate or suspend your access to IkProno at any time, with or without notice, for any reason, including but not limited to a breach of these terms.")}
            </p>
          </section>

          {/* Modifications */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("10. Modifications des conditions", "10. Changes to These Terms")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("IkProno se réserve le droit de modifier ces conditions d'utilisation à tout moment. Les modifications prendront effet dès leur publication sur l'application. Votre utilisation continue des services après la publication des modifications constitue votre acceptation des nouvelles conditions.", "IkProno reserves the right to change these Terms of Service at any time. Changes take effect when published in the application. Your continued use of the services after changes are published constitutes acceptance of the updated terms.")}
            </p>
          </section>

          {/* Loi applicable */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("11. Loi applicable", "11. Governing Law")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Ces conditions sont régies par les lois de la France. Tout litige sera soumis à la juridiction exclusive des tribunaux français.", "These terms are governed by the laws of France. Any dispute will be subject to the exclusive jurisdiction of the French courts.")}
            </p>
          </section>

          {/* Contact */}
          <section className="pt-6 border-t border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-4">{text("12. Contact", "12. Contact")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Pour toute question concernant ces conditions d'utilisation, veuillez nous contacter à :", "For any questions about these Terms of Service, please contact us at:")}
              <a href="mailto:support@ikprono.com" className="text-green-500 hover:text-green-400 ml-2">
                support@ikprono.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
