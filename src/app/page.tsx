"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const { t, text } = useLanguage();

  return (
    <div className="bg-black min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 md:py-32">
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-2 h-2 bg-green-500 rounded-full animate-particle" style={{ animationDelay: '0s' }}></div>
          <div className="absolute top-40 right-20 w-3 h-3 bg-green-400 rounded-full animate-particle" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 left-1/4 w-2 h-2 bg-green-600 rounded-full animate-particle" style={{ animationDelay: '4s' }}></div>
          <div className="absolute top-1/3 right-1/3 w-4 h-4 bg-green-300 rounded-full animate-particle" style={{ animationDelay: '6s' }}></div>
          <div className="absolute bottom-1/3 left-1/2 w-2 h-2 bg-green-500 rounded-full animate-particle" style={{ animationDelay: '8s' }}></div>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black"></div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight animate-float-up">
              {t("heroTitle")}<br />
              <span className="text-green-500 animate-gradient bg-gradient-to-r from-green-400 via-green-500 to-green-600 bg-clip-text text-transparent">
                {t("heroSubtitle")}
              </span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto animate-float-up" style={{ animationDelay: '0.2s' }}>
              {t("heroDescription")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-float-up" style={{ animationDelay: '0.4s' }}>
              <Link
                href="/register"
                className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-8 py-4 rounded-lg font-semibold transition text-center animate-pulse hover-glow hover:scale-105 transform"
              >
                {t("accessIkProno")}
              </Link>
              <Link
                href="/predictions"
                className="border-2 border-gray-700 hover:border-green-600 text-white px-8 py-4 rounded-lg font-semibold transition text-center hover-lift hover:bg-gray-800"
              >
                {t("viewPredictions")}
              </Link>
            </div>

            {/* Stats badges */}
            <div className="mt-12 flex flex-wrap justify-center gap-6 animate-float-up" style={{ animationDelay: '0.6s' }}>
              <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-lg px-6 py-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-300 text-sm">{text("3 sports", "3 sports")}</span>
              </div>
              <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-lg px-6 py-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-300 text-sm">{text("Jour · Semaine · Mois", "Day · Week · Month")}</span>
              </div>
              <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-lg px-6 py-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-300 text-sm">{text("Sélection de rencontres", "Select fixtures")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="match-preview-stage mx-auto mt-14" aria-label={text("Aperçu du calendrier des rencontres", "Fixture calendar preview")}>
          <div className="match-orbit orbit-one">PSG</div>
          <div className="match-orbit orbit-two">FCB</div>
          <div className="match-orbit orbit-three">BVB</div>
          <div className="match-phone">
            <div className="match-phone-notch" />
            <div className="match-phone-status"><span>9:41</span><span>●●●　100</span></div>
            <div className="match-phone-brand">IK<span>PRONO</span></div>
            <div className="match-phone-tabs"><b>{text("RENCONTRES", "FIXTURES")}</b><span>FOOTBALL</span><span>TENNIS</span></div>
            <div className="match-preview-card">
              <div className="match-preview-heading"><span>{text("AUJOURD’HUI", "TODAY")}</span><small>FOOTBALL</small></div>
              <div className="match-preview-game"><span className="match-team-mark">F</span><div><strong>{text("Rencontres réelles", "Real fixtures")}</strong><small>{text("Calendrier de football", "Football schedule")}</small></div></div>
              <div className="match-preview-selection"><span>{text("Rencontre", "Fixture")}</span><strong>{text("À venir", "Upcoming")}</strong></div>
            </div>
            <div className="match-preview-card compact">
              <div className="match-preview-heading"><span>{text("DEMAIN", "TOMORROW")}</span><small>BASKETBALL</small></div>
              <div className="match-preview-game"><span className="match-team-mark blue">B</span><div><strong>{text("Rencontres réelles", "Real fixtures")}</strong><small>{text("Calendrier de basketball", "Basketball schedule")}</small></div></div>
              <div className="match-preview-selection"><span>{text("Rencontre", "Fixture")}</span><strong>{text("À venir", "Upcoming")}</strong></div>
            </div>
            <div className="match-phone-bottom"><span>▦</span><span>◎</span><span>⚽</span><span>◇</span></div>
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section className="py-16 border-t border-gray-800 animate-slide-up">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">
              {text("Pourquoi IkProno", "Why IkProno")}
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              {text("IkProno vous aide à parcourir les rencontres de football, basketball et tennis par jour, semaine ou mois.", "IkProno helps you browse football, basketball, and tennis fixtures by day, week, or month.")}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover hover-lift animate-slide-up stagger-1">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{text("Analyse IA avancée", "Advanced AI analysis")}</h3>
                <p className="text-gray-400">
                  {text("Consultez les rencontres dans un calendrier simple, sans cotes ni pronostics de pari.", "Browse fixtures in a simple calendar, without betting odds or picks.")}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover hover-lift animate-slide-up stagger-2">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{text("Mise à jour quotidienne", "Daily updates")}</h3>
                <p className="text-gray-400">
                  {text("Passez facilement de la vue du jour à la semaine ou au mois.", "Switch easily between day, week, and month views.")}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover hover-lift animate-slide-up stagger-3">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{text("30+ compétitions", "30+ competitions")}</h3>
                <p className="text-gray-400">
                  {text("Ligue des Champions, Premier League, Liga, Bundesliga, NBA et bien d'autres ligues analysées.", "Champions League, Premier League, La Liga, Bundesliga, NBA, and many more leagues analyzed.")}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover hover-lift animate-slide-up stagger-4">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{text("Lotteries exclusives", "Exclusive lotteries")}</h3>
                <p className="text-gray-400">
                  {text("Participez aux tirages et gagnez des prix incroyables (réservé Premium).", "Enter the draws and win amazing prizes (Premium members only).")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fixture schedule */}
      <section className="py-16 border-t border-gray-800 animate-slide-up">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">
              {text("Un calendrier de rencontres", "A fixture calendar")}
            </h2>
            <p className="mb-8 text-lg text-gray-400">
              {text("Choisissez une journée, une semaine ou un mois et parcourez les rencontres réelles de football, basketball et tennis.", "Choose a day, week, or month and browse real football, basketball, and tennis fixtures.")}
            </p>
            <Link href="/live" className="inline-flex rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500">
              {text("Voir les rencontres", "Browse fixtures")}
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-16 border-t border-gray-800">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-6">
              {text("Tarif", "Pricing")}
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              {t("freeAccount")}
            </p>
            <Link 
              href="/payment" 
              className="inline-block bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-semibold transition"
            >
              {text("Voir les tarifs", "View pricing")}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Preview */}
      <section className="py-16 border-t border-gray-800">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">
              {text("Questions fréquentes", "Frequently asked questions")}
            </h2>
            <div className="space-y-6">
              <div className="border-b border-gray-800 pb-4">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {text("L'IA garantit-elle des gains ?", "Does AI guarantee winnings?")}
                </h3>
                <p className="text-gray-400">
                  {text("IkProno affiche les rencontres réelles fournies par les services sportifs configurés. La disponibilité dépend de ces fournisseurs.", "IkProno displays real fixtures from the configured sports data services. Availability depends on those providers.")}
                </p>
              </div>
              <div className="border-b border-gray-800 pb-4">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {text("Quels sports et périodes sont disponibles ?", "Which sports and periods are available?")}
                </h3>
                <p className="text-gray-400">
                  {text("Vous pouvez parcourir les rencontres réelles de football, basketball et tennis par jour, semaine ou mois.", "Browse real football, basketball, and tennis fixtures by day, week, or month.")}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {text("Compatible mobile ?", "Is it mobile-friendly?")}
                </h3>
                <p className="text-gray-400">
                  {text("Oui. IkProno est une Progressive Web App (PWA) installable sur Android et iOS. Ajoutez-la à votre écran d'accueil pour une expérience comme une vraie app.", "Yes. IkProno is a Progressive Web App (PWA) that you can install on Android and iOS. Add it to your home screen for an app-like experience.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 border-t border-gray-800 animate-slide-up relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/10 via-transparent to-green-900/10 animate-gradient"></div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl font-bold text-white mb-6">
            {text("Prêt à parcourir les rencontres ?", "Ready to browse fixtures?")}
          </h2>
          <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
            {text("Explorez les rencontres dans une interface simple et adaptée au téléphone.", "Explore fixtures in a simple, mobile-friendly interface.")}
          </p>
          <Link
            href="/register"
            className="inline-block bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-8 py-4 rounded-lg font-semibold transition animate-pulse hover-glow hover:scale-105 transform"
          >
            {text("Commencer maintenant", "Get started")}
          </Link>
        </div>
      </section>
    </div>
  );
}
