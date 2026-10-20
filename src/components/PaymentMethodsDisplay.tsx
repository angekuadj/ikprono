"use client";

import { useLanguage } from "@/context/LanguageContext";

interface PaymentMethod {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  countries: string[];
}

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "mtn",
    name: "MTN Mobile Money",
    nameEn: "MTN Mobile Money",
    icon: "🟡",
    description: "Paiement via MTN Mobile Money dans plusieurs pays d'Afrique",
    descriptionEn: "Payment via MTN Mobile Money in several African countries",
    countries: ["CI", "GH", "UG", "RW", "NG"],
  },
  {
    id: "orange",
    name: "Orange Money",
    nameEn: "Orange Money",
    icon: "🟠",
    description: "Paiement via Orange Money (Côte d'Ivoire, Sénégal, Mali, Guinée)",
    descriptionEn: "Payment via Orange Money (Ivory Coast, Senegal, Mali, Guinea)",
    countries: ["CI", "SN", "ML", "GN"],
  },
  {
    id: "wave",
    name: "WAVE",
    nameEn: "WAVE",
    icon: "🌊",
    description: "Solution de paiement mobile au Sénégal",
    descriptionEn: "Mobile payment solution in Senegal",
    countries: ["SN"],
  },
  {
    id: "moov",
    name: "Moov",
    nameEn: "Moov",
    icon: "🔵",
    description: "Paiement via Moov (Bénin, Togo, Côte d'Ivoire)",
    descriptionEn: "Payment via Moov (Benin, Togo, Ivory Coast)",
    countries: ["BJ", "TG", "CI"],
  },
  {
    id: "card",
    name: "Carte bancaire",
    nameEn: "Credit/Debit Card",
    icon: "💳",
    description: "Visa, Mastercard et autres cartes bancaires internationales",
    descriptionEn: "Visa, Mastercard and other international cards",
    countries: [],
  },
  {
    id: "ussd",
    name: "USSD",
    nameEn: "USSD",
    icon: "📱",
    description: "Paiement par code USSD",
    descriptionEn: "Payment via USSD code",
    countries: [],
  },
  {
    id: "banktransfer",
    name: "Virement bancaire",
    nameEn: "Bank Transfer",
    icon: "🏦",
    description: "Virement bancaire direct",
    descriptionEn: "Direct bank transfer",
    countries: [],
  },
];

export function PaymentMethodsDisplay() {
  const { text } = useLanguage();

  return (
    <div className="mt-6 p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        {text("Méthodes de paiement acceptées", "Accepted payment methods")}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PAYMENT_METHODS.map(method => (
          <div
            key={method.id}
            className="flex items-center space-x-2 text-xs text-gray-400"
            title={text(method.description, method.descriptionEn)}
          >
            <span className="text-lg">{method.icon}</span>
            <span className="truncate">{text(method.name, method.nameEn)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {text(
          "Tous les paiements sont sécurisés par Flutterwave",
          "All payments are secured by Flutterwave"
        )}
      </p>
    </div>
  );
}
