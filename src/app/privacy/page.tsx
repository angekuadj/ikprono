"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function PrivacyPage() {
  const { text } = useLanguage();
  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Politique de confidentialité", "Privacy Policy")}
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
              {text("IkProno s'engage à protéger votre vie privée. Cette politique de confidentialité explique comment nous collectons, utilisons et protégeons vos informations personnelles lorsque vous utilisez notre application.", "IkProno is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your personal information when you use our application.")}
            </p>
          </section>

          {/* Collecte des données */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("2. Collecte des données", "2. Data Collection")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Nous collectons les types de données suivants :", "We collect the following types of data:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li><strong className="text-white">{text("Informations de compte :", "Account information:")}</strong> {text("nom, email, mot de passe haché", "name, email, hashed password")}</li>
              <li><strong className="text-white">{text("Informations de paiement :", "Payment information:")}</strong> {text("données de carte (traitées par notre partenaire de paiement)", "card details (processed by our payment partner)")}</li>
              <li><strong className="text-white">{text("Données d'utilisation :", "Usage data:")}</strong> {text("préférences, historique des prédictions consultées", "preferences and prediction viewing history")}</li>
              <li><strong className="text-white">{text("Données techniques :", "Technical data:")}</strong> {text("adresse IP, type d'appareil, navigateur", "IP address, device type, and browser")}</li>
            </ul>
          </section>

          {/* Utilisation des données */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("3. Utilisation des données", "3. How We Use Data")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Nous utilisons vos données pour :", "We use your data to:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Fournir et améliorer nos services", "Provide and improve our services")}</li>
              <li>{text("Traiter vos paiements et abonnements", "Process payments and subscriptions")}</li>
              <li>{text("Personnaliser votre expérience", "Personalize your experience")}</li>
              <li>{text("Vous envoyer des notifications importantes", "Send you important notifications")}</li>
              <li>{text("Assurer la sécurité de votre compte", "Keep your account secure")}</li>
              <li>{text("Analyser l'utilisation de l'application (données anonymisées)", "Analyze app usage (anonymized data)")}</li>
            </ul>
          </section>

          {/* Partage des données */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("4. Partage des données", "4. Data Sharing")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Nous ne vendons pas vos données personnelles. Nous pouvons les partager avec :", "We do not sell your personal data. We may share it with:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li><strong className="text-white">{text("Partenaires de paiement :", "Payment partners:")}</strong> {text("pour traiter les transactions", "to process transactions")}</li>
              <li><strong className="text-white">{text("Prestataires de services :", "Service providers:")}</strong> {text("hébergement, email, analyse", "hosting, email, and analytics")}</li>
              <li><strong className="text-white">{text("Autorités légales :", "Legal authorities:")}</strong> {text("si requis par la loi", "when required by law")}</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-4">
              {text("Tous nos partenaires sont tenus de respecter la confidentialité de vos données.", "All our partners are required to protect the confidentiality of your data.")}
            </p>
          </section>

          {/* Sécurité des données */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("5. Sécurité des données", "5. Data Security")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Nous mettons en œuvre des mesures de sécurité robustes :", "We implement robust security measures:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Chiffrement des données en transit et au repos", "Encryption of data in transit and at rest")}</li>
              <li>{text("Hachage des mots de passe", "Password hashing")}</li>
              <li>{text("Authentification à deux facteurs disponible", "Two-factor authentication available")}</li>
              <li>{text("Accès restreint aux données sensibles", "Restricted access to sensitive data")}</li>
              <li>{text("Audits de sécurité réguliers", "Regular security audits")}</li>
            </ul>
          </section>

          {/* Vos droits */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("6. Vos droits", "6. Your Rights")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Conformément au RGPD, vous avez le droit de :", "Under GDPR, you have the right to:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Accéder à vos données personnelles", "Access your personal data")}</li>
              <li>{text("Rectifier vos données inexactes", "Correct inaccurate data")}</li>
              <li>{text("Supprimer vos données (droit à l'oubli)", "Delete your data (right to erasure)")}</li>
              <li>{text("Limiter le traitement de vos données", "Restrict processing of your data")}</li>
              <li>{text("Opposer-vous au traitement", "Object to processing")}</li>
              <li>{text("Porter vos données vers un autre service", "Transfer your data to another service")}</li>
              <li>{text("Retirer votre consentement", "Withdraw your consent")}</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-4">
              {text("Pour exercer ces droits, contactez-nous à", "To exercise these rights, contact us at")} support@ikprono.com
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("7. Cookies", "7. Cookies")}</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              {text("Nous utilisons des cookies pour :", "We use cookies to:")}
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>{text("Maintenir votre session de connexion", "Maintain your sign-in session")}</li>
              <li>{text("Mémoriser vos préférences", "Remember your preferences")}</li>
              <li>{text("Analyser l'utilisation de l'application", "Analyze app usage")}</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-4">
              {text("Vous pouvez gérer vos préférences de cookies dans les paramètres de votre navigateur.", "You can manage cookie preferences in your browser settings.")}
            </p>
          </section>

          {/* Conservation des données */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("8. Conservation des données", "8. Data Retention")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Nous conservons vos données uniquement aussi longtemps que nécessaire pour : fournir nos services, respecter nos obligations légales, et résoudre les litiges. Après suppression de votre compte, vos données sont supprimées dans un délai de 30 jours, sauf obligation légale contraire.", "We retain your data only as long as necessary to provide our services, meet legal obligations, and resolve disputes. After your account is deleted, your data is erased within 30 days unless otherwise required by law.")}
            </p>
          </section>

          {/* Enfants */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("9. Protection des mineurs", "9. Children's Privacy")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("IkProno n'est pas destiné aux personnes de moins de 18 ans. Nous ne collectons pas sciemment de données personnelles d'enfants. Si nous découvrons que nous avons collecté des données d'un mineur, nous les supprimerons immédiatement.", "IkProno is not intended for anyone under 18. We do not knowingly collect personal data from children. If we discover that we have collected a minor's data, we will delete it immediately.")}
            </p>
          </section>

          {/* Modifications */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">{text("10. Modifications de la politique", "10. Changes to This Policy")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Nous pouvons mettre à jour cette politique de confidentialité. Les modifications seront publiées sur cette page avec la date de mise à jour. Nous vous informerons des modifications importantes par email.", "We may update this Privacy Policy. Changes will be posted on this page with an updated date. We will notify you by email about significant changes.")}
            </p>
          </section>

          {/* Contact */}
          <section className="pt-6 border-t border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-4">{text("11. Contact", "11. Contact")}</h2>
            <p className="text-gray-400 leading-relaxed">
              {text("Pour toute question concernant cette politique de confidentialité ou vos données personnelles,", "For questions about this Privacy Policy or your personal data,")}
              {" "}{text("veuillez nous contacter à :", "please contact us at:")}
              <a href="mailto:privacy@ikprono.com" className="text-green-500 hover:text-green-400 ml-2">
                privacy@ikprono.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
