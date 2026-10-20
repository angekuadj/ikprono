"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminSection from "@/components/AdminSection";
import { readAdminPayments, readAdminUsers } from "@/lib/adminData";
import { useLanguage } from "@/context/LanguageContext";

export default function AdminPage() {
  const { language, text } = useLanguage();
  const [summary, setSummary] = useState({
    users: 0,
    payments: 0,
    revenue: 0
  });
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const payments = readAdminPayments();
      setSummary({
        users: readAdminUsers().length,
        payments: payments.length,
        revenue: payments
          .filter(payment => payment.status === "paid")
          .reduce((total, payment) => total + payment.amount, 0)
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : text("Impossible de charger le résumé.", "Unable to load the summary.")
      );
    }
  }, [text]);

  const sections = [
    {
      href: "/admin/users",
      title: text("Gérer les utilisateurs", "Manage users"),
      description: text("Consulter les comptes et gérer les utilisateurs inscrits.", "View accounts and manage registered users."),
      action: text("Ouvrir les utilisateurs", "Open users")
    },
    {
      href: "/admin/offers",
      title: text("Offres et abonnements", "Plans and subscriptions"),
      description: text("Attribuer ou retirer une offre à un compte, et consulter ses droits réels.", "Grant or remove a plan for an account and view its actual access."),
      action: text("Gérer les offres", "Manage plans")
    },
    {
      href: "/admin/stats",
      title: text("Statistiques", "Statistics"),
      description: text("Consulter les indicateurs calculés depuis les données disponibles.", "View metrics calculated from available data."),
      action: text("Voir les statistiques", "View statistics")
    },
    {
      href: "/admin/payments",
      title: text("Historique des paiements", "Payment history"),
      description: text("Consulter les transactions et leur statut.", "View transactions and their status."),
      action: text("Voir les paiements", "View payments")
    }
  ];

  return (
    <AdminSection
      title={text("Tableau de bord", "Dashboard")}
      description={text("Bienvenue dans l’espace d’administration IkProno.", "Welcome to the IkProno admin area.")}
    >
      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mb-8 grid gap-5 sm:grid-cols-3">
        {[
          { label: text("Comptes répertoriés", "Accounts listed"), value: summary.users.toLocaleString(language === "fr" ? "fr-FR" : "en-US") },
          { label: text("Transactions enregistrées", "Transactions recorded"), value: summary.payments.toLocaleString(language === "fr" ? "fr-FR" : "en-US") },
          {
            label: text("Revenus confirmés", "Confirmed revenue"),
            value: `${summary.revenue.toLocaleString(language === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 2 })} €`
          }
        ].map((card, index) => (
          <article
            key={card.label}
            className={`admin-card admin-stagger-${index + 1} animate-slide-up rounded-2xl p-6`}
          >
            <p className="relative z-10 text-sm text-slate-400">{card.label}</p>
            <p className="gradient-text relative z-10 mt-3 text-3xl font-bold">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section, index) => (
          <Link
            key={section.href}
            href={section.href}
            className={`admin-card admin-stagger-${index + 1} animate-slide-up group rounded-2xl p-6`}
          >
            <span className="relative z-10 mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-lg text-fuchsia-200 ring-1 ring-fuchsia-300/15">
              {index === 0 ? "◉" : index === 1 ? "▥" : "↗"}
            </span>
            <h2 className="relative z-10 text-lg font-semibold text-white transition-colors group-hover:text-fuchsia-100">{section.title}</h2>
            <p className="relative z-10 mt-2 min-h-12 text-sm leading-6 text-slate-400">{section.description}</p>
            <span className="relative z-10 mt-5 inline-block text-sm font-semibold text-fuchsia-300 transition-transform group-hover:translate-x-1">
              {section.action} →
            </span>
          </Link>
        ))}
      </div>

      <p className="admin-note mt-8 rounded-2xl p-5 text-sm leading-6 text-violet-100">
        {text("Version prototype : les comptes et les indicateurs sont locaux à ce navigateur. Les paiements ne sont pas encore connectés à un prestataire.", "Prototype version: accounts and metrics are stored locally in this browser. Payments are not yet connected to a provider.")}
      </p>
    </AdminSection>
  );
}
