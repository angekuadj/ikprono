"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import {
  readFixtureBasket,
  subscribeToFixtureBasket,
  writeFixtureBasket,
} from "@/lib/fixtureBasket";
import {
  readGeneratedCombinations,
  subscribeToGeneratedCombinations,
  writeGeneratedCombinations,
  type StoredGeneratedCombination,
} from "@/lib/generatedCombinations";
import type { CouponLevel } from "@/lib/coupons";

/**
 * Tiroir (drawer) du panier : les combinaisons **déjà générées**, en direct.
 *
 * Le panier, c'est l'onglet « Déjà générées » : le tiroir liste les coupons
 * générés (cote estimée, matchs, niveau de risque) avec suppression instantanée,
 * plus un aperçu du nombre de matchs sélectionnés. Le contenu se met à jour sans
 * rechargement grâce aux abonnements du magasin localStorage (et à la
 * synchronisation Firestore pour les comptes connectés).
 */

const LEVEL_LABELS: Record<CouponLevel, { fr: string; en: string }> = {
  sure: { fr: "Sûre", en: "Safe" },
  medium: { fr: "Moyenne", en: "Medium" },
  risky: { fr: "Risquée", en: "Risky" },
};

const MAX_VISIBLE_MATCHES = 3;

function formatCreatedAt(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BasketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { text, language } = useLanguage();
  const [combinations, setCombinations] = useState<StoredGeneratedCombination[]>([]);
  const [fixtureCount, setFixtureCount] = useState(0);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    const sync = () => {
      try {
        setCombinations(readGeneratedCombinations());
        setFixtureCount(readFixtureBasket().length);
        setReadError("");
      } catch (error) {
        setReadError(error instanceof Error
          ? error.message
          : text("Impossible de lire le panier.", "Unable to read basket."));
      }
    };
    sync();
    const unsubscribeGenerated = subscribeToGeneratedCombinations(sync);
    const unsubscribeFixtures = subscribeToFixtureBasket(sync);
    return () => {
      unsubscribeGenerated();
      unsubscribeFixtures();
    };
  }, [text]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  const removeCombination = (combinationId: string) => {
    try {
      writeGeneratedCombinations(
        readGeneratedCombinations().filter(item => item.id !== combinationId)
      );
    } catch (error) {
      setReadError(error instanceof Error
        ? error.message
        : text("Impossible de retirer la combinaison.", "Unable to remove the combination."));
    }
  };

  const clearBasket = () => {
    writeGeneratedCombinations([]);
    writeFixtureBasket([]);
  };

  if (!open) return null;

  return (
    <div className="basket-drawer-overlay fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={text("Mon panier", "My basket")}>
      <button
        type="button"
        aria-label={text("Fermer le panier", "Close basket")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <aside className="basket-drawer-panel absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl animate-slide-in-right">
        <header className="basket-drawer-header flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-white">
              {text("Mon panier", "My basket")}
            </h2>
            <p className="text-xs text-gray-400">
              {text(`${combinations.length} combinaison(s) déjà générée(s)`, `${combinations.length} generated combination(s)`)}
              {fixtureCount > 0 && (
                <> · {text(`${fixtureCount} match(s) sélectionné(s)`, `${fixtureCount} selected match(es)`)}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={text("Fermer", "Close")}
            className="rounded-md px-2 py-1 text-lg text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ×
          </button>
        </header>

        <div className="basket-drawer-list min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {readError && (
            <p role="alert" className="mb-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-200">
              {readError}
            </p>
          )}
          {combinations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span aria-hidden="true" className="text-4xl opacity-40">🛒</span>
              <p className="text-sm text-gray-400">
                {text("Votre panier est vide. Générez une combinaison pour la retrouver ici.", "Your basket is empty. Generate a combination to find it here.")}
              </p>
              <Link
                href="/combinations"
                onClick={onClose}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500"
              >
                {text("Générer une combinaison", "Generate a combination")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {combinations.map(combination => {
                const levelLabel = LEVEL_LABELS[combination.coupon.level];
                const matches = combination.coupon.matches;
                const visibleMatches = matches.slice(0, MAX_VISIBLE_MATCHES);
                const extraMatches = matches.length - visibleMatches.length;
                return (
                  <li
                    key={combination.id}
                    className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 transition hover:border-green-800/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {combination.coupon.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {formatCreatedAt(combination.createdAt, language)}
                          {levelLabel && (
                            <> · <span className="text-amber-300/80">{language === "fr" ? levelLabel.fr : levelLabel.en}</span></>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCombination(combination.id)}
                        aria-label={text(`Retirer « ${combination.coupon.title} » du panier`, `Remove “${combination.coupon.title}” from basket`)}
                        className="shrink-0 rounded-md px-2 py-1 text-sm text-gray-500 transition hover:bg-red-900/40 hover:text-red-300"
                      >
                        ✕
                      </button>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {visibleMatches.map(match => (
                        <li key={match.fixtureId} className="truncate text-xs text-gray-300">
                          {match.homeTeam} <span className="text-gray-600">vs</span> {match.awayTeam}
                        </li>
                      ))}
                      {extraMatches > 0 && (
                        <li className="text-[11px] text-gray-500">
                          {text(`+ ${extraMatches} autre(s) match(s)`, `+ ${extraMatches} more match(es)`)}
                        </li>
                      )}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      {matches.length} {text("match(s)", "match(es)")}
                      {typeof combination.coupon.estimatedCombinedRate === "number" && (
                        <> · {text("Cote théorique", "Theoretical odds")}{" "}
                          <span className="font-semibold text-green-400">{combination.coupon.estimatedCombinedRate.toFixed(2)}</span>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="basket-drawer-footer space-y-2 border-t border-gray-800 px-4 py-3">
          {combinations.length > 0 && (
            <button
              type="button"
              onClick={clearBasket}
              className="w-full rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 transition hover:border-red-700 hover:text-red-300"
            >
              {text("Vider le panier", "Clear basket")}
            </button>
          )}
          <div className="flex gap-2">
            <Link
              href="/basket"
              onClick={onClose}
              className="basket-drawer-primary-action flex-1 rounded-lg bg-green-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-green-500"
            >
              {text("Ouvrir le panier", "Open basket")}
            </Link>
            <Link
              href="/combinations"
              onClick={onClose}
              className="basket-drawer-secondary-action flex-1 rounded-lg border border-gray-700 px-3 py-2 text-center text-sm font-semibold text-gray-200 transition hover:bg-gray-800"
            >
              {text("Générer", "Generate")}
            </Link>
          </div>
        </footer>
      </aside>
    </div>
  );
}
