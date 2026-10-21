"use client";

import { useState } from "react";
import { useNotifications } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const { addNotification } = useNotifications();
  const { text } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[IkProno] ${formData.subject}`);
    const body = encodeURIComponent(
      `Nom : ${formData.name}\nE-mail : ${formData.email}\n\n${formData.message}`
    );
    window.location.href = `mailto:support@ikprono.com?subject=${subject}&body=${body}`;
    addNotification(
      text(
        "Votre application de messagerie va s’ouvrir avec le message prérempli.",
        "Your email app will open with your message prefilled."
      ),
      "info"
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const contactInfo = [
    {
      icon: "📧",
      title: "Email",
      value: "support@ikprono.com",
      link: "mailto:support@ikprono.com"
    },
    {
      icon: "📱",
      title: text("Téléphone", "Phone"),
      value: "+225 0789880372",
      link: "tel:+2250789880372"
    },
    {
      icon: "🌐",
      title: text("Site web", "Website"),
      value: "www.ikprono.com",
      link: "https://www.ikprono.com"
    },
    {
      icon: "📍",
      title: text("Adresse", "Address"),
      value: "Abidjan, Côte d'Ivoire",
      link: null
    }
  ];

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Contactez-nous", "Contact us")}
          </h1>
          <p className="text-gray-400 text-lg">
            {text("Nous sommes là pour répondre à toutes vos questions", "We're here to answer all your questions")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-white mb-6">{text("Envoyez-nous un message", "Send us a message")}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Nom complet *", "Full name *")}
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                  placeholder={text("Votre nom", "Your name")}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Email *", "Email *")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                  placeholder="votre@email.com"
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Sujet *", "Subject *")}
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition"
                >
                  <option value="">{text("Sélectionnez un sujet", "Select a subject")}</option>
                  <option value="support">{text("Support technique", "Technical support")}</option>
                  <option value="billing">{text("Facturation et abonnement", "Billing and subscription")}</option>
                  <option value="account">{text("Problème de compte", "Account issue")}</option>
                  <option value="feature">{text("Suggestion de fonctionnalité", "Feature suggestion")}</option>
                  <option value="other">{text("Autre", "Other")}</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                  {text("Message *", "Message *")}
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition resize-none"
                  placeholder={text("Décrivez votre demande en détail...", "Describe your request in detail...")}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-6 py-4 rounded-lg font-semibold transition hover-glow"
              >
                {text("Préparer l’e-mail", "Prepare email")}
              </button>
            </form>
          </div>

          {/* Contact Info */}
          <div className="space-y-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-6">{text("Informations de contact", "Contact information")}</h2>
              <div className="space-y-4">
                {contactInfo.map((info, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg card-hover"
                  >
                    <span className="text-3xl">{info.icon}</span>
                    <div className="flex-1">
                      <p className="text-gray-400 text-sm">{info.title}</p>
                      {info.link ? (
                        <a
                          href={info.link}
                          className="text-white font-medium hover:text-green-500 transition"
                        >
                          {info.value}
                        </a>
                      ) : (
                        <p className="text-white font-medium">{info.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Working Hours */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h3 className="text-xl font-bold text-white mb-4">{text("Heures d'ouverture", "Opening hours")}</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-400">
                  <span>{text("Lundi - Vendredi", "Monday - Friday")}</span>
                  <span className="text-white">{text("9h - 18h", "9am - 6pm")}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>{text("Samedi", "Saturday")}</span>
                  <span className="text-white">{text("10h - 16h", "10am - 4pm")}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>{text("Dimanche", "Sunday")}</span>
                  <span className="text-white">{text("Fermé", "Closed")}</span>
                </div>
              </div>
              <p className="text-gray-500 text-sm mt-4">
                {text("* Le support par email est disponible 24h/24 et 7j/7", "* Email support is available 24/7")}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
