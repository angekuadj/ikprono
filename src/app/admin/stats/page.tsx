"use client";

import { useEffect, useState } from "react";
import AdminSection from "@/components/AdminSection";
import { readAdminPayments, readAdminUsers } from "@/lib/adminData";
import { useLanguage } from "@/context/LanguageContext";

export default function AdminStatsPage() {
  const { language, text } = useLanguage();
  const [totals, setTotals] = useState({
    users: 0,
    payments: 0,
    paidPayments: 0,
    revenue: 0
  });
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const payments = readAdminPayments();
      const paidPayments = payments.filter(payment => payment.status === "paid");
      setTotals({
        users: readAdminUsers().length,
        payments: payments.length,
        paidPayments: paidPayments.length,
        revenue: paidPayments.reduce((sum, payment) => sum + payment.amount, 0)
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : text("Impossible de charger les statistiques.", "Unable to load statistics.")
      );
    }
  }, [text]);

  const cards = [
    { label: text("Comptes enregistrés", "Registered accounts"), value: totals.users.toLocaleString(language === "fr" ? "fr-FR" : "en-US") },
    { label: text("Transactions", "Transactions"), value: totals.payments.toLocaleString(language === "fr" ? "fr-FR" : "en-US") },
    { label: text("Paiements confirmés", "Confirmed payments"), value: totals.paidPayments.toLocaleString(language === "fr" ? "fr-FR" : "en-US") },
    { label: text("Revenus confirmés", "Confirmed revenue"), value: `${totals.revenue.toLocaleString(language === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 2 })} €` }
  ];

  return (
    <AdminSection
      title={text("Statistiques", "Statistics")}
      description={text("Indicateurs calculés à partir des comptes et des paiements enregistrés.", "Metrics calculated from registered accounts and payments.")}
    >
      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <article
            key={card.label}
            className={`admin-card admin-stagger-${index + 1} animate-slide-up rounded-2xl p-6`}
          >
            <p className="relative z-10 text-sm text-slate-400">{card.label}</p>
            <p className="admin-metric-value relative z-10 mt-3 text-3xl font-bold">{card.value}</p>
          </article>
        ))}
      </div>
      <div className="admin-note mt-6 rounded-2xl p-5 text-sm leading-6 text-violet-100">
        {text("Ces chiffres proviennent du stockage local de ce navigateur. Ils ne sont pas centralisés et ne représentent pas des statistiques de production.", "These figures come from this browser's local storage. They are not centralized and do not represent production statistics.")}
      </div>
    </AdminSection>
  );
}
