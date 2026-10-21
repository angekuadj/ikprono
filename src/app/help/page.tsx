"use client";

import Link from "next/link";
import { useState } from "react";
import { useNotifications } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";

export default function HelpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { addNotification } = useNotifications();
  const { text } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailSubject = encodeURIComponent(`[IkProno] ${subject}`);
    const emailBody = encodeURIComponent(
      `Nom : ${name}\nE-mail : ${email}\n\n${message}`
    );
    window.location.href = `mailto:support@ikprono.com?subject=${emailSubject}&body=${emailBody}`;
    addNotification(
      text(
        "Votre application de messagerie va s’ouvrir avec le message prérempli.",
        "Your email app will open with your message prefilled."
      ),
      "info"
    );
  };

  const faqs = [
    {
      question: "Comment consulter les rencontres ?",
      answer: "Ouvrez le calendrier pour parcourir les rencontres par jour, semaine ou mois, puis filtrez par sport."
    },
    {
      question: "Quelles informations sont affichées ?",
      answer: "Les informations disponibles dépendent des données transmises par les fournisseurs sportifs configurés."
    },
    {
      question: "IkProno propose-t-il des pronostics ou des cotes de paris ?",
      answer: "Non. Les cotes et pronostics de paris ne sont pas proposés actuellement."
    },
    {
      question: "Comment contacter le support ?",
      answer: "Utilisez le formulaire ci-dessus : votre application de messagerie s’ouvrira avec un e-mail prérempli à envoyer à support@ikprono.com."
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
              className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition hover-glow"
            >
              {text("Préparer l’e-mail", "Prepare email")}
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
                  "How can I browse fixtures?",
                  "What information is displayed?",
                  "Does IkProno provide betting predictions or odds?",
                  "How can I contact support?"
                ][index])}</h3>
                <p className="text-gray-400">{text(faq.answer, [
                  "Open the calendar to browse fixtures by day, week, or month, then filter by sport.",
                  "Available information depends on the data returned by the configured sports providers.",
                  "No. Betting odds and betting predictions are not currently provided.",
                  "Use the form above. Your email app will open a prefilled message addressed to support@ikprono.com."
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
            <Link href="/ai-search" className="text-green-500 hover:text-green-400 font-medium text-sm">
              {text("Ouvrir le calendrier →", "Open the calendar →")}
            </Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center card-hover">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">{text("FAQ complète", "Full FAQ")}</h3>
            <p className="text-gray-400 text-sm mb-4">{text("Toutes les réponses à vos questions", "Answers to all your questions")}</p>
            <Link href="/faq" className="text-green-500 hover:text-green-400 font-medium text-sm">
              {text("Voir la FAQ →", "View FAQ →")}
            </Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center card-hover">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">{text("Contacter le support", "Contact support")}</h3>
            <p className="text-gray-400 text-sm mb-4">{text("Préparez un e-mail à notre équipe", "Prepare an email to our team")}</p>
            <Link href="/contact" className="text-green-500 hover:text-green-400 font-medium text-sm">
              {text("Ouvrir la page Contact →", "Open Contact →")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
