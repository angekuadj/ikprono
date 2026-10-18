"use client";

import { useEffect, useState } from "react";
import AdminSection from "@/components/AdminSection";
import { readAdminPayments, type AdminPayment } from "@/lib/adminData";
import { useLanguage } from "@/context/LanguageContext";

export default function AdminPaymentsPage() {
  const { language, text } = useLanguage();
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setPayments(
        readAdminPayments().sort(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime()
        )
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : text("Impossible de charger l’historique des paiements.", "Unable to load payment history.")
      );
    }
  }, [text]);

  const statusLabels: Record<AdminPayment["status"], string> = {
    paid: text("Payé", "Paid"),
    pending: text("En attente", "Pending"),
    failed: text("Échoué", "Failed")
  };

  return (
    <AdminSection
      title={text("Historique des paiements", "Payment history")}
      description={text("Consultez les transactions associées aux abonnements.", "View transactions associated with subscriptions.")}
    >
      <section className="admin-panel animate-slide-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/[0.06] p-5">
          <h2 className="text-lg font-semibold text-white">{text("Transactions", "Transactions")}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {payments.length} {text("transaction", "transaction")}{payments.length !== 1 ? "s" : ""}
          </p>
        </div>
        {error && (
          <p role="alert" className="m-5 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="admin-table-head">
              <tr>
                {[text("Date", "Date"), text("Utilisateur", "User"), text("Offre", "Plan"), text("Montant", "Amount"), text("Méthode", "Method"), text("Statut", "Status")].map(label => (
                  <th key={label} className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-fuchsia-100/70">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {payments.map(payment => (
                <tr key={payment.id} className="admin-table-row border-t border-white/[0.05]">
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                    {new Date(payment.createdAt).toLocaleString(language === "fr" ? "fr-FR" : "en-US")}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-white">{payment.userEmail}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">{payment.plan}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                    {payment.amount.toLocaleString(language === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: payment.currency })}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">{payment.method}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">{statusLabels[payment.status]}</td>
                </tr>
              ))}
              {payments.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <p className="font-medium text-white">{text("Aucun paiement enregistré", "No payments recorded")}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      {text("L’historique se remplira lorsqu’un fournisseur de paiement sera connecté.", "The history will appear once a payment provider is connected.")}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="admin-note border-t border-white/[0.06] px-5 py-4 text-xs text-violet-100">
          {text("Le paiement sur cette version est simulé ; aucune transaction réelle ni donnée de carte bancaire n’est stockée.", "Payments are simulated in this version; no real transactions or card data are stored.")}
        </p>
      </section>
    </AdminSection>
  );
}
