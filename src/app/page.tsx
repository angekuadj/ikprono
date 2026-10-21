"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const { text } = useLanguage();

  const destinations = [
    {
      href: "/ai-search",
      number: "01",
      title: text("Calendrier", "Calendar"),
      description: text(
        "Parcourez les rencontres par date, période et sport.",
        "Browse fixtures by date, period, and sport."
      ),
      icon: "▦",
    },
    {
      href: "/live",
      number: "02",
      title: text("En direct", "Live"),
      description: text(
        "Suivez les scores et les événements disponibles en direct.",
        "Follow scores and available live match events."
      ),
      icon: "⌁",
    },
    {
      href: "/combinations",
      number: "03",
      title: text("Combinaisons", "Combinations"),
      description: text(
        "Composez et gérez vos sélections de rencontres.",
        "Create and manage your fixture selections."
      ),
      icon: "↗",
    },
    {
      href: "/favorites",
      number: "04",
      title: text("Favoris", "Favorites"),
      description: text(
        "Retrouvez rapidement les rencontres que vous suivez.",
        "Quickly return to the fixtures you follow."
      ),
      icon: "☆",
    },
  ];

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">
            <span className="home-live-indicator" aria-hidden="true" />
            {text("VOTRE ESPACE SPORTIF", "YOUR SPORTS HUB")}
          </p>
          <h1>
            {text("Les rencontres.", "Every fixture.")}
            <span>{text("À votre rythme.", "Your way.")}</span>
          </h1>
          <p className="home-hero-description">
            {text(
              "Explorez les calendriers, consultez les matchs en direct et gardez vos rencontres préférées à portée de main.",
              "Explore fixture calendars, check live matches, and keep the games you follow close at hand."
            )}
          </p>
          <div className="home-hero-actions">
            <Link href="/predictions" className="home-button home-button-primary">
              {text("Explorer les rencontres", "Explore fixtures")}
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/live" className="home-button home-button-secondary">
              {text("Voir le direct", "Open live")}
            </Link>
          </div>
          <div className="home-sports-list" aria-label={text("Sports disponibles", "Available sports")}>
            <span>Football</span>
            <span>Basketball</span>
            <span>Tennis</span>
          </div>
        </div>

        <aside className="home-hero-panel" aria-label={text("Aperçu des fonctionnalités", "Feature overview")}>
          <div className="home-panel-topline">
            <span>{text("CENTRE DE MATCHS", "MATCH CENTRE")}</span>
            <span className="home-panel-status">
              <span className="home-live-indicator" aria-hidden="true" />
              {text("À EXPLORER", "READY TO EXPLORE")}
            </span>
          </div>
          <div className="home-panel-title">
            <span className="home-panel-icon" aria-hidden="true">⚽</span>
            <div>
              <p>{text("Tout le sport, un seul point de départ.", "All your sports, one place to start.")}</p>
              <span>{text("Choisissez votre prochaine étape", "Choose where to go next")}</span>
            </div>
          </div>
          <div className="home-panel-options">
            <Link href="/ai-search" className="home-panel-option">
              <span className="home-panel-option-icon" aria-hidden="true">▦</span>
              <span>
                <strong>{text("Parcourir le calendrier", "Browse the calendar")}</strong>
                <small>{text("Jour · Semaine · Mois", "Day · Week · Month")}</small>
              </span>
              <span className="home-panel-arrow" aria-hidden="true">↗</span>
            </Link>
            <Link href="/live" className="home-panel-option">
              <span className="home-panel-option-icon is-live" aria-hidden="true">⌁</span>
              <span>
                <strong>{text("Suivre les matchs en direct", "Follow live matches")}</strong>
                <small>{text("Scores et états disponibles", "Available scores and status")}</small>
              </span>
              <span className="home-panel-arrow" aria-hidden="true">↗</span>
            </Link>
            <Link href="/favorites" className="home-panel-option">
              <span className="home-panel-option-icon is-favorite" aria-hidden="true">☆</span>
              <span>
                <strong>{text("Retrouver vos favoris", "Return to your favorites")}</strong>
                <small>{text("Vos rencontres enregistrées", "Your saved fixtures")}</small>
              </span>
              <span className="home-panel-arrow" aria-hidden="true">↗</span>
            </Link>
          </div>
          <p className="home-panel-footnote">
            {text(
              "La disponibilité des rencontres dépend des données des fournisseurs sportifs.",
              "Fixture availability depends on sports data providers."
            )}
          </p>
        </aside>
      </section>

      <section className="home-section" aria-labelledby="home-tools-title">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">{text("SIMPLE À PARCOURIR", "EASY TO EXPLORE")}</p>
            <h2 id="home-tools-title">{text("Tout commence ici.", "Start here.")}</h2>
          </div>
          <p>
            {text(
              "Accédez directement aux outils que vous utilisez le plus.",
              "Jump straight to the tools you use most."
            )}
          </p>
        </div>
        <div className="home-destination-grid">
          {destinations.map(item => (
            <Link className="home-destination-card" href={item.href} key={item.href}>
              <div className="home-destination-card-top">
                <span className="home-destination-icon" aria-hidden="true">{item.icon}</span>
                <span className="home-destination-number">{item.number}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <span className="home-destination-link">
                {text("Ouvrir", "Open")} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-account-section">
        <div>
          <p className="home-eyebrow">{text("VOTRE COMPTE", "YOUR ACCOUNT")}</p>
          <h2>{text("Un espace à vous.", "Your own space.")}</h2>
          <p>
            {text(
              "Connectez-vous pour retrouver votre tableau de bord, votre panier et vos préférences.",
              "Sign in to access your dashboard, basket, and preferences."
            )}
          </p>
        </div>
        <div className="home-account-actions">
          <Link href="/dashboard" className="home-button home-button-primary">
            {text("Tableau de bord", "Dashboard")}
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/payment" className="home-account-link">
            {text("Découvrir les offres", "Explore plans")}
          </Link>
        </div>
      </section>
    </div>
  );
}
