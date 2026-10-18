"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { Fixture, FixtureResponse } from "@/lib/fixtures";

function getLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getStatus(fixture: Fixture) {
  return fixture.status?.trim().toLocaleLowerCase("fr-FR") ?? "";
}

export default function UserDashboard() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { language, text } = useLanguage();
  const router = useRouter();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixturesDate, setFixturesDate] = useState("");
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState("");
  const [refreshKey, refreshNow] = useAutoRefresh();
  const hasLoadedFixtures = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const controller = new AbortController();
    const loadFixtures = async () => {
      if (!hasLoadedFixtures.current) setFixturesLoading(true);
      try {
        const dateParams = new URLSearchParams({ preferredDate: getLocalDate() });
        const dateResponse = await fetch(`/api/sports/fixtures/latest-date?${dateParams}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const datePayload = await dateResponse.json() as { date?: string | null; error?: string };
        if (!dateResponse.ok) {
          throw new Error(datePayload.error || "Unable to load the fixture date.");
        }
        if (!datePayload.date) {
          setFixtures([]);
          setFixturesDate("");
          setFixturesError("");
          return;
        }

        const fixtureParams = new URLSearchParams({
          from: datePayload.date,
          to: datePayload.date,
          sport: "all",
        });
        const fixtureResponse = await fetch(`/api/sports/fixtures?${fixtureParams}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const fixturePayload = await fixtureResponse.json() as FixtureResponse & { error?: string };
        if (!fixtureResponse.ok) {
          throw new Error(fixturePayload.error || "Unable to load fixtures.");
        }
        if (!Array.isArray(fixturePayload.fixtures)) {
          throw new Error("The fixtures service returned an invalid response.");
        }
        setFixtures(fixturePayload.fixtures);
        setFixturesDate(datePayload.date);
        setFixturesError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setFixturesError(error instanceof Error ? error.message : "Unable to load fixtures.");
      } finally {
        if (!controller.signal.aborted) {
          hasLoadedFixtures.current = true;
          setFixturesLoading(false);
        }
      }
    };

    void loadFixtures();
    return () => controller.abort();
  }, [refreshKey]);

  const counts = useMemo(() => {
    const completed = fixtures.filter(fixture => getStatus(fixture) === "terminé").length;
    const live = fixtures.filter(fixture => ["en live", "mi-temps"].includes(getStatus(fixture))).length;
    const upcoming = fixtures.filter(fixture => ["prévu", "reporté"].includes(getStatus(fixture))).length;
    return { total: fixtures.length, completed, live, upcoming };
  }, [fixtures]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div role="status" aria-label={text("Chargement…", "Loading…")} className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-green-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div role="status" aria-label={text("Redirection vers la connexion…", "Redirecting to sign in…")} className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-green-500" />
      </div>
    );
  }

  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const formattedDate = fixturesDate
    ? new Date(`${fixturesDate}T12:00:00.000Z`).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : text("Aucune date disponible", "No date available");
  const stats = [
    { label: text("Matchs de la journée", "Matches on selected day"), value: counts.total, color: "text-white" },
    { label: text("En cours", "In progress"), value: counts.live, color: "text-red-400" },
    { label: text("À venir", "Upcoming"), value: counts.upcoming, color: "text-sky-400" },
    { label: text("Terminés", "Completed"), value: counts.completed, color: "text-gray-300" },
  ];

  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-400">
              {text("Espace personnel", "Personal dashboard")}
            </p>
            <h1 className="text-3xl font-bold text-white">{text("Bonjour", "Welcome")}, {user?.name}</h1>
            <p className="mt-2 capitalize text-gray-400">{formattedDate}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={refreshNow}
              disabled={fixturesLoading}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-600 disabled:cursor-wait disabled:opacity-50"
            >
              {fixturesLoading ? text("Actualisation…", "Refreshing…") : text("Actualiser", "Refresh")}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              {text("Déconnexion", "Log out")}
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={text("Résumé des rencontres", "Fixture summary")}>
          {stats.map(stat => (
            <article key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-sm font-medium text-gray-400">{stat.label}</h2>
              <p className={`mt-3 text-3xl font-bold ${stat.color}`}>
                {fixturesLoading ? "—" : stat.value}
              </p>
            </article>
          ))}
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 p-5">
              <div>
                <h2 className="text-lg font-semibold text-white">{text("Rencontres", "Fixtures")}</h2>
                <p className="mt-1 text-sm text-gray-400">{text("Données réelles pour", "Real fixtures for")} {formattedDate}</p>
              </div>
              <Link href="/predictions" className="text-sm font-semibold text-green-400 hover:text-green-300">
                {text("Tout afficher", "View all")} →
              </Link>
            </div>

            {fixturesError ? (
              <p role="alert" className="p-6 text-sm text-red-300">{fixturesError}</p>
            ) : fixturesLoading ? (
              <p role="status" className="p-6 text-sm text-gray-400">{text("Chargement des rencontres…", "Loading fixtures…")}</p>
            ) : fixtures.length === 0 ? (
              <p className="p-6 text-sm text-gray-400">{text("Aucune rencontre trouvée pour cette date.", "No fixtures found for this date.")}</p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {fixtures.slice(0, 8).map(fixture => (
                  <li key={fixture.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{fixture.homeTeam} <span className="text-gray-500">—</span> {fixture.awayTeam}</p>
                      <p className="mt-1 truncate text-sm text-gray-400">{fixture.league}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-white">{fixture.score || fixture.time}</span>
                      {fixture.status && (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          ["en live", "mi-temps"].includes(getStatus(fixture))
                            ? "bg-red-950 text-red-300"
                            : getStatus(fixture) === "terminé"
                              ? "bg-gray-800 text-gray-300"
                              : "bg-sky-950 text-sky-300"
                        }`}>
                          {fixture.liveDisplay || fixture.status}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-lg font-semibold text-white">{text("Accès rapide", "Quick access")}</h2>
              <div className="mt-4 space-y-3">
                <Link href="/predictions" className="block rounded-lg border border-gray-800 bg-gray-950 p-4 transition hover:border-green-700">
                  <span className="font-semibold text-white">{text("Rechercher des matchs", "Find fixtures")}</span>
                  <span className="mt-1 block text-sm text-gray-400">{text("Filtrer, rechercher et parcourir les rencontres.", "Filter, search, and browse fixtures.")}</span>
                </Link>
                <Link href="/ai-search" className="block rounded-lg border border-gray-800 bg-gray-950 p-4 transition hover:border-green-700">
                  <span className="font-semibold text-white">{text("Calendrier par compétition", "Browse competitions")}</span>
                  <span className="mt-1 block text-sm text-gray-400">{text("Explorer les matchs par lieu et compétition.", "Explore matches by location and competition.")}</span>
                </Link>
                <Link href="/live" className="block rounded-lg border border-gray-800 bg-gray-950 p-4 transition hover:border-red-700">
                  <span className="font-semibold text-white">{text("Matchs en direct", "Live matches")}</span>
                  <span className="mt-1 block text-sm text-gray-400">{text("Voir les scores et les matchs en cours.", "View scores and matches in progress.")}</span>
                </Link>
              </div>
            </section>

            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-lg font-semibold text-white">{text("Mon compte", "My account")}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-gray-400">{text("Nom", "Name")}</dt>
                  <dd className="mt-1 font-medium text-white">{user?.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">{text("Adresse e-mail", "Email address")}</dt>
                  <dd className="mt-1 break-all font-medium text-white">{user?.email}</dd>
                </div>
              </dl>
              <Link href="/profile" className="mt-5 inline-block text-sm font-semibold text-green-400 hover:text-green-300">
                {text("Gérer mon profil", "Manage profile")} →
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
