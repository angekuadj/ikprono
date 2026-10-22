"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import logo from "../../assets/ikprono-logo.png";

export default function Footer() {
  const { text } = useLanguage();

  const columns = [
    {
      title: text("Explorer", "Explore"),
      links: [
        { href: "/ai-search", label: text("Calendrier", "Calendar") },
        { href: "/predictions", label: text("Rencontres", "Fixtures") },
        { href: "/live", label: text("En direct", "Live") },
      ],
    },
    {
      title: text("Vos outils", "Your tools"),
      links: [
        { href: "/combinations", label: text("Combinaisons", "Combinations") },
        { href: "/favorites", label: text("Favoris", "Favorites") },
        { href: "/basket", label: text("Mon panier", "My basket") },
        { href: "/lottery", label: text("Démo tirage", "Draw demo") },
      ],
    },
    {
      title: text("Compte et aide", "Account and help"),
      links: [
        { href: "/dashboard", label: text("Tableau de bord", "Dashboard") },
        { href: "/payment", label: text("Offres", "Plans") },
        { href: "/faq", label: "FAQ" },
        { href: "/help", label: text("Aide", "Help") },
        { href: "/contact", label: text("Contact", "Contact") },
      ],
    },
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <Link
              href="/"
              aria-label={text("IkProno — Accueil", "IkProno — Home")}
            >
              <Image src={logo} alt="IkProno" width={160} height={46} />
            </Link>
            <p>
              {text(
                "Les rencontres sportives, les informations en direct et vos sélections réunies au même endroit.",
                "Fixtures, live information, and your selections in one place."
              )}
            </p>
            <span className="site-footer-sports">FOOTBALL <i /> BASKETBALL <i /> TENNIS</span>
          </div>

          {columns.map(column => (
            <div className="site-footer-column" key={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map(item => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="site-footer-bottom">
          <p>{text("© 2026 IkProno. Tous droits réservés.", "© 2026 IkProno. All rights reserved.")}</p>
          <div>
            <Link href="/terms">{text("Conditions", "Terms")}</Link>
            <Link href="/privacy">{text("Confidentialité", "Privacy")}</Link>
          </div>
          <p className="site-footer-disclaimer">
            {text(
              "Données de rencontres fournies par des services sportifs tiers.",
              "Fixture data is provided by third-party sports services."
            )}
          </p>
          <p className="site-footer-attribution">
            <a
              href="https://www.espn.com/"
              target="_blank"
              rel="dofollow noopener noreferrer"
              className="site-footer-data-source-link"
            >
              Powered by ESPN
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
