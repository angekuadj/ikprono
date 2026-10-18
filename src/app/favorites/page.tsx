"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import FavoriteFixtureButton from "@/components/FavoriteFixtureButton";
import { useLanguage } from "@/context/LanguageContext";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import {
  readFavoriteFixtures,
  subscribeToFavoriteFixtures,
  writeFavoriteFixtures,
} from "@/lib/favoriteFixtures";
import type { Fixture } from "@/lib/fixtures";

export default function FavoritesPage() {
  const { text, language } = useLanguage();
  const [favorites, setFavorites] = useState<Fixture[]>([]);
  const [storageError, setStorageError] = useState("");
  const favoriteIds = useMemo(() => favorites.map(fixture => fixture.id), [favorites]);
  const { fixturesById, error: refreshError } = useFixtureStatuses(favoriteIds);
  const locale = language === "fr" ? "fr-FR" : "en";

  useEffect(() => {
    const syncFavorites = () => {
      try {
        setFavorites(readFavoriteFixtures());
        setStorageError("");
      } catch (cause) {
        setStorageError(cause instanceof Error ? cause.message : "Impossible de lire les favoris.");
      }
    };
    syncFavorites();
    return subscribeToFavoriteFixtures(syncFavorites);
  }, []);

  const removeFavorite = (fixtureId: string) => {
    try {
      const updated = favorites.filter(fixture => fixture.id !== fixtureId);
      writeFavoriteFixtures(updated);
      setStorageError("");
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : "Impossible de modifier les favoris.");
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            {text("Votre suivi", "Your watchlist")}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{text("Matchs favoris", "Favorite matches")}</h1>
          <p className="mt-2 text-sm text-gray-400">
            {text(
              "Vos favoris sont enregistrés sur cet appareil. Les scores et statuts sont actualisés automatiquement.",
              "Your favorites are saved on this device. Scores and statuses refresh automatically."
            )}
          </p>
        </header>

        {storageError && (
          <p role="alert" className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            {storageError}
          </p>
        )}
        {refreshError && favorites.length > 0 && (
          <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
            {text(
              "La mise à jour des scores est indisponible. Les dernières informations enregistrées sont affichées.",
              "Score updates are unavailable. The last saved information is shown."
            )}{" "}
            {refreshError}
          </p>
        )}

        {favorites.length === 0 ? (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-lg font-semibold">{text("Aucun match favori pour le moment.", "No favorite matches yet.")}</p>
            <p className="mt-2 text-sm text-gray-400">
              {text("Ajoutez un match depuis les rencontres, les matchs en direct ou sa page de détails.", "Add a match from fixtures, live matches, or its details page.")}
            </p>
            <Link href="/predictions" className="mt-5 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
              {text("Parcourir les matchs", "Browse matches")}
            </Link>
          </section>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {favorites.map(savedFixture => {
              const fixture = fixturesById[savedFixture.id] ?? savedFixture;
              const isLive = Boolean(fixture.liveDisplay)
                || /live|direct|mi-temps|half-time|halftime/i.test(fixture.status ?? "");
              return (
                <article key={fixture.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <Link href={`/match/${encodeURIComponent(fixture.id)}`} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-gray-300">{fixture.league}</p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })} · {fixture.time}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                        isLive
                          ? "bg-red-900/70 text-red-200"
                          : "bg-gray-800 text-gray-300"
                      }`}>
                        {fixture.liveDisplay || fixture.status || text("À venir", "Upcoming")}
                      </span>
                    </div>
                    <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center">
                      <span className="flex min-w-0 flex-col items-center gap-2 text-sm font-semibold">
                        {fixture.homeImageUrl && <Image src={fixture.homeImageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 object-contain" />}
                        <span className="line-clamp-2">{fixture.homeTeam}</span>
                      </span>
                      <span className="whitespace-nowrap text-lg font-bold">
                        {fixture.score || (fixture.homeScore !== undefined || fixture.awayScore !== undefined
                          ? `${fixture.homeScore ?? "-"} - ${fixture.awayScore ?? "-"}`
                          : "vs")}
                      </span>
                      <span className="flex min-w-0 flex-col items-center gap-2 text-sm font-semibold">
                        {fixture.awayImageUrl && <Image src={fixture.awayImageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 object-contain" />}
                        <span className="line-clamp-2">{fixture.awayTeam}</span>
                      </span>
                    </div>
                  </Link>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 pt-3">
                    <FavoriteFixtureButton fixture={savedFixture} />
                    <button
                      type="button"
                      onClick={() => removeFavorite(savedFixture.id)}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-400 transition hover:bg-red-950/50 hover:text-red-300"
                    >
                      {text("Retirer", "Remove")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
