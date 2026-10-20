"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  readGeneratedCombinations,
  subscribeToGeneratedCombinations,
} from "@/lib/generatedCombinations";
import BasketDrawer from "@/components/BasketDrawer";

/**
 * Bouton flottant du panier : ouvre un tiroir latéral en direct (aperçu des
 * combinaisons déjà générées, cotes estimées, suppressions instantanées) au
 * lieu de naviguer. Le compteur du badge reflète le panier — les combinaisons
 * déjà générées — et pulse à chaque changement de contenu.
 */
export default function FloatingBasketLink() {
  const { text } = useLanguage();
  const [itemCount, setItemCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const previousCount = useRef<number | null>(null);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    const syncCount = () => {
      try {
        const count = readGeneratedCombinations().length;
        if (previousCount.current !== null && count !== previousCount.current) {
          setPulseKey(key => key + 1);
        }
        previousCount.current = count;
        setItemCount(count);
        setReadError("");
      } catch (error) {
        setReadError(error instanceof Error ? error.message : text("Impossible de lire le panier.", "Unable to read basket."));
      }
    };
    syncCount();
    return subscribeToGeneratedCombinations(syncCount);
  }, [text]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={text(`Ouvrir le panier, ${itemCount} combinaison(s)`, `Open basket, ${itemCount} combination(s)`)}
        aria-expanded={open}
        title={readError || text("Mon panier", "My basket")}
        className="fixed bottom-24 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-green-300/40 bg-gradient-to-br from-green-500 to-emerald-700 text-white shadow-lg shadow-green-950/60 transition hover:scale-105 hover:shadow-green-900/60 md:bottom-6 md:right-6"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 3.75h14a1.75 1.75 0 0 1 1.75 1.75v13a1.75 1.75 0 0 1-1.75 1.75H5a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 5 3.75Z" strokeWidth="1.7" />
          <path d="M7.5 8h4m-4 4h2m-2 4h4m2.5-6.5 1.25 1.25L18 8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16.25" cy="15.75" r="2.25" strokeWidth="1.7" />
        </svg>
        <span
          key={pulseKey}
          className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-black bg-fuchsia-600 px-1 text-xs font-bold text-white animate-pulse-count"
        >
          {itemCount}
        </span>
        {readError && <span className="sr-only" role="alert">{readError}</span>}
      </button>
      <BasketDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
