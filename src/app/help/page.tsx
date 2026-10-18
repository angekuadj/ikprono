"use client";

import { useState } from "react";
import { useNotifications } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";

export default function HelpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotifications();
  const { text } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      addNotification(text("Votre message a été envoyé avec succès !", "Your message was sent successfully!"), "success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setLoading(false);
    }, 1000);
  };

  const faqs = [
    {
      question: "Comment fonctionnent les prédictions IA ?",
      answer: "Notre IA analyse des centaines de matchs chaque jour en utilisant des données historiques, les statistiques des équipes, les performances des joueurs et les cotes du marché pour identifier les paris à forte valeur."
    },
    {
      question: "Quels types de prédictions sont disponibles ?",
      answer: "Nous proposons plusieurs types : ULTRA SAFE (1 pari sûr), SAFE (2 paris combinés), EQUILIBRE (cotes moyennes), AGRESSIF (fortes cotes), DAILY COMBO (très forte cote), MyCombi 1-5 (personnalisés) et les prédictions IA Premium."
    },
    {
      question: "Comment consulter les pronostics ?",
      answer: "Connectez-vous à votre compte, accédez à l'onglet Prédictions ou Dashboard pour voir tous les pronostics du jour avec les analyses détaillées et les niveaux de confiance."
    },
    {
      question: "Puis-je annuler mon abonnement ?",
      answer: "Oui, vous pouvez annuler votre abonnement à tout moment depuis la page de paiement ou en contactant notre support. Aucun engagement n'est requis."
    },
    {
      question: "Les prédictions sont-elles garanties ?",
      answer: "Non, aucun système de paris ne peut garantir des gains. Nos prédictions maximisent vos probabilités mais le risque zéro n'existe pas dans les paris sportifs."
    }
  ];

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Besoin d'aide ?", "Need help?")}
          </h1>
          <p className="text-gray-400 text-lg">
            {text("Notre équipe est là pour vous accompagner", "Our team is here to support you")}
          </p>
        </div>

        {/* Contact Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 mb-12 animate-slide-up">
          <h2 className="text-2xl font-bold text-white mb-6">{text("Contactez-nous", "Contact us")}</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Nom", "Name")}
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                  placeholder={text("Votre nom", "Your name")}
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Email", "Email")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                  placeholder="votre@email.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                {text("Sujet", "Subject")}
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                placeholder={text("Sujet de votre message", "Subject of your message")}
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                {text("Message", "Message")}
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition resize-none"
                placeholder={text("Décrivez votre problème ou votre question...", "Describe your issue or question...")}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition hover-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? text("Envoi en cours...", "Sending...") : text("Envoyer le message", "Send message")}
            </button>
          </form>
        </div>

        {/* FAQ Section */}
        <div className="animate-slide-up">
          <h2 className="text-2xl font-bold text-white mb-6">{text("Questions fréquentes", "Frequently asked questions")}</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover hover-lift"
              >
                <h3 className="text-lg font-semibold text-white mb-2">{text(faq.question, [
                  "How do AI predictions work?",
                  "What types of predictions are available?",
                  "How can I view predictions?",
                  "Can I cancel my subscription?",
                  "Are predictions guaranteed?"
                ][index])}</h3>
                <p className="text-gray-400">{text(faq.answer, [
                  "Our AI analyzes hundreds of matches daily using historical data, team statistics, player performance, and market odds to identify valuable betting opportunities.",
                  "We offer several types: ULTRA SAFE, SAFE, BALANCED, AGGRESSIVE, DAILY COMBO, MyCombi 1-5, and Premium AI predictions.",
                  "Sign in and visit the Predictions or Dashboard page to see today's picks, detailed analysis, and confidence levels.",
                  "Yes. You can cancel your subscription at any time from the payment page or by contacting support. There is no commitment.",
                  "No betting system can guarantee winnings. Our predictions help inform your choices, but sports betting always involves risk."
                ][index])}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center card-hover">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">{text("Guide utilisateur", "User guide")}</h3>
            <p className="text-gray-400 text-sm mb-4">{text("Apprenez à utiliser toutes les fonctionnalités", "Learn how to use all the features")}</p>
            <button className="text-green-500 hover:text-green-400 font-medium text-sm">{text("Lire le guide →", "Read the guide →")}</button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center card-hover">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">{text("FAQ complète", "Full FAQ")}</h3>
            <p className="text-gray-400 text-sm mb-4">{text("Toutes les réponses à vos questions", "Answers to all your questions")}</p>
            <button className="text-green-500 hover:text-green-400 font-medium text-sm">{text("Voir la FAQ →", "View FAQ →")}</button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center card-hover">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">{text("Chat en direct", "Live chat")}</h3>
            <p className="text-gray-400 text-sm mb-4">{text("Discutez avec notre support", "Chat with our support team")}</p>
            <button className="text-green-500 hover:text-green-400 font-medium text-sm">{text("Démarrer le chat →", "Start chat →")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
