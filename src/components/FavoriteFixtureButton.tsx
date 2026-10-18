"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  readFavoriteFixtures,
  subscribeToFavoriteFixtures,
  writeFavoriteFixtures,
} from "@/lib/favoriteFixtures";
import type { Fixture } from "@/lib/fixtures";

export default function FavoriteFixtureButton({ fixture }: { fixture: Fixture }) {
  const { text } = useLanguage();
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const syncFavorites = () => {
      try {
        setIsFavorite(readFavoriteFixtures().some(item => item.id === fixture.id));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Impossible de lire les favoris.");
      }
    };
    syncFavorites();
    return subscribeToFavoriteFixtures(syncFavorites);
  }, [fixture.id]);

  const toggleFavorite = () => {
    try {
      const favorites = readFavoriteFixtures();
      const updated = favorites.some(item => item.id === fixture.id)
        ? favorites.filter(item => item.id !== fixture.id)
        : [...favorites, fixture];
      writeFavoriteFixtures(updated);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier les favoris.");
    }
  };

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={toggleFavorite}
        aria-pressed={isFavorite}
        aria-label={isFavorite
          ? text(`Retirer ${fixture.homeTeam} - ${fixture.awayTeam} des favoris`, `Remove ${fixture.homeTeam} vs ${fixture.awayTeam} from favorites`)
          : text(`Suivre ${fixture.homeTeam} - ${fixture.awayTeam}`, `Follow ${fixture.homeTeam} vs ${fixture.awayTeam}`)}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
          isFavorite
            ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
            : "border-gray-700 text-gray-300 hover:border-amber-500 hover:text-amber-200"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" aria-hidden="true">
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        {isFavorite ? text("Suivi", "Following") : text("Suivre", "Follow")}
      </button>
      {error && <span role="alert" className="mt-1 text-[10px] text-red-300">{error}</span>}
    </span>
  );
}
