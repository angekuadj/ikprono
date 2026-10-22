"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { hasAdminAccess } from "@/lib/adminAccess";
import logo from "../../assets/ikprono-logo.png";

interface NavigationLink {
  href: string;
  label: string;
}

function isCurrentPath(pathname: string, href: string) {
  if (href === "/predictions" && pathname.startsWith("/match/")) return true;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");
  const { user, isAuthenticated, logout } = useAuth();
  const adminAccess = hasAdminAccess(user);
  const { language, setLanguage, text, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const toggleLanguage = () => setLanguage(language === "fr" ? "en" : "fr");
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const primaryLinks: NavigationLink[] = [
    { href: "/ai-search", label: text("Calendrier", "Calendar") },
    { href: "/predictions", label: text("Football", "Football") },
    { href: "/live", label: text("En direct", "Live") },
    { href: "/combinations", label: text("Combinaisons", "Combinations") },
  ];

  const secondaryLinks: NavigationLink[] = [
    ...(isAuthenticated
      ? [{ href: "/dashboard", label: t("dashboard") }]
      : []),
    { href: "/favorites", label: text("Favoris", "Favorites") },
    { href: "/basket", label: text("Mon panier", "My basket") },
    { href: "/payment", label: text("Offres", "Plans") },
    { href: "/lottery", label: text("Démo tirage", "Draw demo") },
    { href: "/faq", label: t("faq") },
    { href: "/help", label: text("Aide", "Help") },
    { href: "/contact", label: t("contact") },
    ...(adminAccess
      ? [{ href: "/admin", label: t("adminSpace") }]
      : []),
  ];

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const renderLink = (item: NavigationLink, compact = false) => {
    const active = isCurrentPath(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => compact && setIsOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`${compact ? "site-menu-link" : "site-nav-link"} ${active ? "is-active" : ""}`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <header className={`site-header ${isAdminPage ? "is-admin" : ""}`}>
        <nav className="site-nav" aria-label={text("Navigation principale", "Main navigation")}>
          <Link
            href="/"
            className="site-brand"
            aria-label={text("IkProno — Accueil", "IkProno — Home")}
          >
            <Image src={logo} alt="IkProno" priority className="site-brand-logo" />
          </Link>

          {!isAdminPage && (
            <div className="site-nav-primary">
              {primaryLinks.map(item => renderLink(item))}
            </div>
          )}

          <div className="site-nav-actions">
            {isAuthenticated ? (
              <Link
                href="/profile"
                aria-label={t("profile")}
                title={t("profile")}
                aria-current={isCurrentPath(pathname, "/profile") ? "page" : undefined}
                className="site-profile-link"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                  <path d="M4 21a8 8 0 0 1 16 0" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>{t("profile")}</span>
              </Link>
            ) : (
              <Link href="/login" className="site-login-link">
                {t("login")}
              </Link>
            )}

            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language === "fr" ? "Switch language to English" : "Passer la langue en français"}
              className="site-language-button"
            >
              {language === "fr" ? "EN" : "FR"}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === "light"}
              aria-label={theme === "dark"
                ? text("Activer le thème clair", "Switch to light theme")
                : text("Activer le thème sombre", "Switch to dark theme")}
              title={theme === "dark"
                ? text("Thème clair", "Light theme")
                : text("Thème sombre", "Dark theme")}
              className="site-theme-button"
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(open => !open)}
              aria-label={isOpen
                ? text("Fermer le menu", "Close menu")
                : text("Ouvrir le menu", "Open menu")}
              aria-expanded={isOpen}
              aria-controls={isOpen ? "site-menu-panel" : undefined}
              className="site-menu-toggle"
            >
              <span aria-hidden="true">{isOpen ? "×" : "☰"}</span>
              <span className="site-menu-toggle-label">{text("Menu", "Menu")}</span>
            </button>
          </div>
        </nav>

        {isOpen && (
          <div id="site-menu-panel" className="site-menu-panel">
            <div className="site-menu-content">
              <div className="site-menu-section">
                <p className="site-menu-eyebrow">{text("Explorer", "Explore")}</p>
                {primaryLinks.map(item => renderLink(item, true))}
              </div>
              <div className="site-menu-section">
                <p className="site-menu-eyebrow">{text("Votre espace", "Your space")}</p>
                {secondaryLinks.map(item => renderLink(item, true))}
                {!isAuthenticated && (
                  <Link href="/register" className="site-menu-signup" onClick={() => setIsOpen(false)}>
                    {t("signup")}
                  </Link>
                )}
                {isAuthenticated && (
                  <button type="button" className="site-menu-link site-menu-logout" onClick={logout}>
                    {t("logout")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {!isAdminPage && (
        <nav
          className="mobile-bottom-nav"
          aria-label={text("Navigation rapide", "Quick navigation")}
        >
          {[
            { href: "/ai-search", label: text("Calendrier", "Calendar"), ariaLabel: text("Calendrier", "Calendar"), icon: "▦" },
            { href: "/live", label: text("Direct", "Live"), ariaLabel: text("Direct", "Live"), icon: "⌁" },
            { href: "/favorites", label: text("Favoris", "Favorites"), ariaLabel: text("Favoris", "Favorites"), icon: "☆" },
            { href: "/combinations", label: text("Comb.", "Combos"), ariaLabel: text("Combinaisons", "Combinations"), icon: "⧉" },
            { href: "/basket", label: text("Panier", "Basket"), ariaLabel: text("Panier", "Basket"), icon: "▤" },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.ariaLabel}
              aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}
              className={`mobile-bottom-nav-link ${isCurrentPath(pathname, item.href) ? "is-active" : ""}`}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
