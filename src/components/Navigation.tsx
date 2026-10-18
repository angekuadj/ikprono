"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import logo from "../../assets/ikprono-logo.png";

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");
  const { user, isAuthenticated, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const toggleLanguage = () => setLanguage(language === "fr" ? "en" : "fr");

  return (
    <>
    <nav className={`site-public-nav ${isAdminPage ? "admin-public-nav" : ""} sticky top-0 z-50 animate-slide-down`}>
      <div className={`container mx-auto px-4 site-public-nav-inner ${isAdminPage ? "admin-public-nav-inner" : ""}`}>
        <div className="site-nav-bar flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Image src={logo} alt="IkProno" priority className="h-11 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <div className="site-nav-links hidden md:flex items-center space-x-4">
            {isAdminPage ? (
              <>
                <Link href="/" className="text-gray-400 transition hover:text-white">
                  {t("home")}
                </Link>
                <Link href="/admin" className="admin-public-nav-current">
                  {t("adminSpace")}
                </Link>
              </>
            ) : (
              <>
                <Link href="/" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                  {t("home")}
                </Link>
                {isAuthenticated && (
                  <>
                    <Link href="/dashboard" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                      {t("dashboard")}
                    </Link>
                    {user?.role === "admin" && (
                      <Link href="/admin" className="text-purple-400 hover:text-purple-300 transition font-medium hover-lift text-xs">
                        {t("admin")}
                      </Link>
                    )}
                  </>
                )}
                <Link href="/predictions" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                  {t("predictions")}
                </Link>
                <Link href="/combinations" className="text-green-400 hover:text-green-300 transition font-medium hover-lift text-xs">
                  {t("combinations")}
                </Link>
                <Link href="/ai-search" className="text-blue-400 hover:text-blue-300 transition font-medium hover-lift text-xs">
                  🤖 {t("aiSearch")}
                </Link>
                <Link href="/live" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                  {t("live")}
                </Link>
                <Link href="/favorites" className={`transition font-medium hover-lift text-xs ${pathname.startsWith("/favorites") ? "text-amber-300" : "text-gray-300 hover:text-white"}`}>
                  {language === "fr" ? "Favoris" : "Favorites"}
                </Link>
                <Link href="/lottery" className="text-green-500 hover:text-green-400 transition font-medium hover-lift animate-heartbeat text-xs">
                  🎰 {t("lotteries")}
                </Link>
                <Link href="/faq" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                  {t("faq")}
                </Link>
                <Link href="/contact" className="text-gray-300 hover:text-white transition font-medium hover-lift text-xs">
                  {t("contact")}
                </Link>
              </>
            )}
          </div>

          {/* Auth Buttons - Desktop */}
          <div className="site-nav-actions hidden md:flex items-center space-x-4">
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language === "fr" ? "Switch language to English" : "Passer la langue en français"}
              className="rounded-full border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-fuchsia-400 hover:text-white"
            >
              {language === "fr" ? "EN" : "FR"}
            </button>
            {isAuthenticated ? (
              <>
                <Link
                  href="/profile"
                  aria-label={t("profile")}
                  title={t("profile")}
                  className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                    <path d="M4 21a8 8 0 0 1 16 0" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </Link>
                <button
                  onClick={logout}
                  className="text-gray-300 hover:text-white transition font-medium hover-lift"
                >
                  {t("logout")}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-gray-300 hover:text-white transition font-medium hover-lift"
                >
                  {t("login")}
                </Link>
                <Link
                  href="/register"
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition font-medium hover-glow animate-scale-in"
                >
                  {t("signup")}
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen
              ? language === "fr" ? "Fermer le menu" : "Close menu"
              : language === "fr" ? "Ouvrir le menu" : "Open menu"}
            aria-expanded={isOpen}
            aria-controls={isOpen ? "mobile-navigation" : undefined}
            className="md:hidden text-gray-300 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div id="mobile-navigation" className="site-mobile-menu md:hidden pb-4 animate-slide-down">
            <div className="flex flex-col space-y-3">
              <Link href="/" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                {t("home")}
              </Link>
              {isAdminPage ? (
                <Link href="/admin" onClick={() => setIsOpen(false)} className="text-fuchsia-200 transition font-medium py-2">
                  {t("adminSpace")}
                </Link>
              ) : isAuthenticated && (
                <>
                  <Link href="/dashboard" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                    {t("dashboard")}
                  </Link>
                  {user?.role === "admin" && (
                    <Link href="/admin" onClick={() => setIsOpen(false)} className="text-purple-400 hover:text-purple-300 transition font-medium py-2">
                      {t("admin")}
                    </Link>
                  )}
                </>
              )}
              <Link href="/predictions" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                {t("predictions")}
              </Link>
              <Link href="/combinations" onClick={() => setIsOpen(false)} className="text-green-400 hover:text-green-300 transition font-medium py-2">
                {t("combinations")}
              </Link>
              <Link href="/ai-search" onClick={() => setIsOpen(false)} className="text-blue-400 hover:text-blue-300 transition font-medium py-2">
                🤖 {t("aiSearch")}
              </Link>
              <Link href="/live" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                {t("live")}
              </Link>
              <Link href="/favorites" onClick={() => setIsOpen(false)} className="text-amber-300 hover:text-amber-200 transition font-medium py-2">
                {language === "fr" ? "Matchs favoris" : "Favorite matches"}
              </Link>
              <Link href="/lottery" onClick={() => setIsOpen(false)} className="text-green-500 hover:text-green-400 transition font-medium py-2 animate-heartbeat">
                🎰 {t("lotteries")}
              </Link>
              <Link href="/faq" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                {t("faq")}
              </Link>
              <Link href="/contact" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white transition font-medium py-2">
                {t("contact")}
              </Link>
              <div className="border-t border-gray-800 pt-3 mt-3">
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="mb-2 rounded-full border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300"
                >
                  {language === "fr" ? "English" : "Français"}
                </button>
                {isAuthenticated ? (
                  <>
                    <Link href="/profile" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-2 text-gray-300 hover:text-white">
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                          <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                          <path d="M4 21a8 8 0 0 1 16 0" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      {t("profile")}
                    </Link>
                    <button
                      onClick={logout}
                      className="block text-gray-300 hover:text-white transition font-medium py-2 w-full text-left"
                    >
                      {t("logout")}
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setIsOpen(false)} className="block text-gray-300 hover:text-white transition font-medium py-2">
                      {t("login")}
                    </Link>
                    <Link href="/register" onClick={() => setIsOpen(false)} className="block bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition font-medium text-center mt-2">
                      {t("signup")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
      <div className="mobile-bottom-nav md:hidden" role="navigation" aria-label="Navigation principale">
        <Link
          href={isAuthenticated ? "/dashboard" : "/"}
          aria-label={t("home")}
          aria-current={pathname === "/" || pathname === "/dashboard" ? "page" : undefined}
          className={`mobile-bottom-nav-link ${pathname === "/" || pathname === "/dashboard" ? "is-active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1" strokeWidth="1.8" />
            <rect x="14" y="4" width="6" height="6" rx="1" strokeWidth="1.8" />
            <rect x="4" y="14" width="6" height="6" rx="1" strokeWidth="1.8" />
            <rect x="14" y="14" width="6" height="6" rx="1" strokeWidth="1.8" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">{t("home")}</span>
        </Link>
        <Link
          href="/live"
          aria-label={t("live")}
          aria-current={pathname === "/live" ? "page" : undefined}
          className={`mobile-bottom-nav-link ${pathname === "/live" ? "is-active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
            <path d="M4 12h3l2-4 4 8 2-4h5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">{t("live")}</span>
        </Link>
        <Link
          href="/favorites"
          aria-label={language === "fr" ? "Favoris" : "Favorites"}
          aria-current={pathname.startsWith("/favorites") ? "page" : undefined}
          className={`mobile-bottom-nav-link ${pathname.startsWith("/favorites") ? "is-active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">{language === "fr" ? "Favoris" : "Saved"}</span>
        </Link>
        <Link
          href="/predictions"
          aria-label={t("predictions")}
          aria-current={pathname.startsWith("/predictions") || pathname.startsWith("/match/") ? "page" : undefined}
          className={`mobile-bottom-nav-link ${pathname.startsWith("/predictions") || pathname.startsWith("/match/") ? "is-active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 2 2.7 2 3.4-.2 1.2 3.2 2.8 2-1.1 3.2 1.1 3.2-2.8 2-1.2 3.2-3.4-.2L12 22l-2.7-2-3.4.2-1.2-3.2-2.8-2L3 11.8 1.9 8.6l2.8-2 1.2-3.2 3.4.2L12 2Zm0 3.1-2.1 1.5-2.6-.1-.9 2.4-2.1 1.5.8 2.4-.8 2.4 2.1 1.5.9 2.4 2.6-.1 2.1 1.5 2.1-1.5 2.6.1.9-2.4 2.1-1.5-.8-2.4.8-2.4-2.1-1.5-.9-2.4-2.6.1L12 5.1Z" />
            <path d="m12 8 2.5 1.8-.9 2.9h-3.2l-.9-2.9L12 8Zm-5.4 1.5 2.5 1.8-.9 2.9-3.1-1 .8-2.5.7-1.2Zm10.8 0 .7 1.2.8 2.5-3.1 1-.9-2.9 2.5-1.8ZM7.5 16l3.1 1-.2 3.2-2.6-1-.3-3.2Zm9 0-.3 3.2-2.6 1-.2-3.2 3.1-1Z" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">{t("predictions")}</span>
        </Link>
        <Link
          href={isAuthenticated ? "/profile" : "/payment"}
          aria-label={isAuthenticated ? t("profile") : t("premiumPlan")}
          aria-current={pathname.startsWith("/profile") || pathname.startsWith("/payment") ? "page" : undefined}
          className={`mobile-bottom-nav-link ${pathname.startsWith("/profile") || pathname.startsWith("/payment") ? "is-active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="m12 3 9 9-9 9-9-9 9-9Z" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m12 8 4 4-4 4-4-4 4-4Z" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">{isAuthenticated ? t("profile") : t("premiumPlan")}</span>
        </Link>
      </div>
    </>
  );
}
