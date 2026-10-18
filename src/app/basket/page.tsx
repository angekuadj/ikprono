"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
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
import {
  readSavedSelections,
  writeSavedSelections,
  type SavedSelection,
} from "@/lib/savedSelections";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import { uniqueGeneratedCoupons, type GeneratedCoupon, type CouponPick } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";
import {
  isFixtureFinished,
  parseFixtureScore,
  settleCoupon,
  settleCouponMatch,
  settleCouponPick,
  type CouponOutcome,
} from "@/lib/couponSettlement";
import { generateUUID } from "@/lib/uuid";

const MAX_SELECTION_SIZE = 5;
type BasketTab = "basket" | "generated" | "selections";

export default function BasketPage() {
  const { user, isAuthenticated, isLoading, remainingProposals, recordProposals } = useAuth();
  const { language, text } = useLanguage();
  const router = useRouter();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [generatedCombinations, setGeneratedCombinations] = useState<StoredGeneratedCombination[]>([]);
  const [basketError, setBasketError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>([]);
  const [couponErrors, setCouponErrors] = useState<Record<string, string>>({});
  const [generatingSelectionId, setGeneratingSelectionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BasketTab>("basket");
  const trackedFixtures = useMemo(
    () => [...fixtures, ...generatedCombinations.flatMap(combination => combination.fixtures), ...savedSelections.flatMap(selection => selection.fixtures)],
    [fixtures, generatedCombinations, savedSelections]
  );
  const fixtureIds = useMemo(
    () => Array.from(new Set(
      trackedFixtures
        .filter(fixture => !isFixtureFinished(fixture))
        .map(fixture => fixture.id)
    )),
    [trackedFixtures]
  );
  const { fixturesById, error: fixtureStatusError } = useFixtureStatuses(fixtureIds);

  useEffect(() => {
    const syncBasket = () => {
      try {
        setFixtures(readFixtureBasket());
        setBasketError("");
      } catch (error) {
        setBasketError(error instanceof Error ? error.message : "Impossible de lire le panier.");
      }
    };
    syncBasket();
    return subscribeToFixtureBasket(syncBasket);
  }, []);

  useEffect(() => {
    const syncGeneratedCombinations = () => {
      try {
        setGeneratedCombinations(readGeneratedCombinations());
        setBasketError("");
      } catch (error) {
        setBasketError(error instanceof Error ? error.message : text("Impossible de lire les combinaisons enregistrées.", "Unable to read saved combinations."));
      }
    };
    syncGeneratedCombinations();
    return subscribeToGeneratedCombinations(syncGeneratedCombinations);
  }, [text]);

  useEffect(() => {
    if (!user) {
      setSavedSelections([]);
      return;
    }
    try {
      setSavedSelections(readSavedSelections(user.id));
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : text("Impossible de lire vos sélections enregistrées.", "Unable to read saved selections."));
    }
  }, [user, text]);

  const removeFixture = (fixtureId: string) => {
    try {
      writeFixtureBasket(fixtures.filter(fixture => fixture.id !== fixtureId));
      setSaveError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de modifier le panier.", "Unable to update the basket."));
    }
  };

  const clearBasket = () => {
    try {
      writeFixtureBasket([]);
      setSaveError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de vider le panier.", "Unable to clear the basket."));
    }
  };

  const removeGeneratedCombination = (combinationId: string) => {
    try {
      writeGeneratedCombinations(generatedCombinations.filter(combination => combination.id !== combinationId));
      setBasketError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de retirer cette combinaison.", "Unable to remove this combination."));
    }
  };

  const saveSelection = () => {
    setSaveError("");
    if (!isAuthenticated || !user) {
      router.push("/login?next=%2Fbasket");
      return;
    }
    if (fixtures.length === 0) return;
    if (remainingProposals <= 0) {
      setSaveError(text(
        "Votre quota de sélections est épuisé. Passez à Premium pour continuer.",
        "You have used all your selections. Upgrade to Premium to continue."
      ));
      return;
    }

    let existingSelections: SavedSelection[];
    try {
      existingSelections = readSavedSelections(user.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : text("Impossible de lire vos sélections enregistrées.", "Unable to read saved selections."));
      return;
    }

    const selection: SavedSelection = {
      id: generateUUID(),
      createdAt: new Date().toISOString(),
      fixtures,
    };
    try {
      writeSavedSelections(user.id, [...existingSelections, selection]);
      if (recordProposals(1) === 0) {
        writeSavedSelections(user.id, existingSelections);
        setSaveError(text(
          "Votre quota de sélections est épuisé. Passez à Premium pour continuer.",
          "You have used all your selections. Upgrade to Premium to continue."
        ));
        return;
      }
      writeFixtureBasket([]);
      setSavedSelections([...existingSelections, selection]);
      setActiveTab("selections");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : text("Impossible d’enregistrer votre sélection.", "Unable to save your selection."));
    }
  };

  const generateSelectionCoupons = async (selection: SavedSelection) => {
    if (selection.coupons || !user) return;
    setGeneratingSelectionId(selection.id);
    setCouponErrors(current => {
      const next = { ...current };
      delete next[selection.id];
      return next;
    });

    try {
      const response = await fetch("/api/coupons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          selectionId: selection.id,
          fixtureIds: selection.fixtures.map(fixture => fixture.id),
        }),
      });
      const payload = await response.json() as {
        coupons?: GeneratedCoupon[];
        alreadyGenerated?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de générer les coupons.", "Unable to generate coupons."));
      }
      if (!Array.isArray(payload.coupons) || payload.coupons.length !== 3) {
        throw new Error(text("Le service a renvoyé une réponse invalide.", "The service returned an invalid response."));
      }
      const coupons = uniqueGeneratedCoupons(payload.coupons);
      if (coupons.length === 0) {
        throw new Error(text("Le service n’a renvoyé aucun coupon distinct.", "The service did not return any distinct coupons."));
      }
      const updatedSelections = savedSelections.map(savedSelection =>
        savedSelection.id === selection.id
          ? { ...savedSelection, coupons, couponsGeneratedAt: new Date().toISOString() }
          : savedSelection
      );
      writeSavedSelections(user.id, updatedSelections);
      setSavedSelections(updatedSelections);
    } catch (error) {
      setCouponErrors(current => ({
        ...current,
        [selection.id]: error instanceof Error
          ? error.message
          : text("Impossible de générer les coupons.", "Unable to generate coupons."),
      }));
    } finally {
      setGeneratingSelectionId(null);
    }
  };

  const getCouponPickLabel = (pick: CouponPick) => {
    if (!pick.selection) return text("Historique insuffisant", "Insufficient history");
    const labels: Record<NonNullable<CouponPick["selection"]>, string> = {
      home: text("Victoire domicile (1)", "Home win (1)"),
      draw: text("Match nul (N)", "Draw (N)"),
      away: text("Victoire extérieur (2)", "Away win (2)"),
      "home-or-draw": text("Domicile ou nul (1X)", "Home or draw (1X)"),
      "away-or-draw": text("Extérieur ou nul (X2)", "Away or draw (X2)"),
      "either-win": text("Victoire d’une équipe (12)", "Either team to win (12)"),
      "over-0.5": text("Plus de 0,5 but", "Over 0.5 goals"),
      "over-1.5": text("Plus de 1,5 buts", "Over 1.5 goals"),
      "over-2.5": text("Plus de 2,5 buts", "Over 2.5 goals"),
    };
    return labels[pick.selection];
  };

  const outcomeLabel = (outcome: CouponOutcome) => ({
    pending: text("En attente", "Pending"),
    won: text("Gagnée", "Won"),
    lost: text("Perdue", "Lost"),
    unavailable: text("Résultat indisponible", "Result unavailable"),
  })[outcome];

  const outcomeStyle = (outcome: CouponOutcome) => ({
    pending: "border-amber-700 bg-amber-950/50 text-amber-200",
    won: "border-green-700 bg-green-950/50 text-green-200",
    lost: "border-red-800 bg-red-950/50 text-red-200",
    unavailable: "border-gray-700 bg-gray-800 text-gray-300",
  })[outcome];

  const outcomeIcon = (outcome: CouponOutcome) => {
    if (outcome === "won") return "✓";
    if (outcome === "lost") return "✕";
    if (outcome === "pending") return "◷";
    return "?";
  };

  const couponOutcome = (coupon: GeneratedCoupon, fallbackFixtures: Fixture[]) =>
    settleCoupon(coupon.matches.map(match =>
      settleCouponMatch(
        match,
        fixturesById[match.fixtureId] ?? fallbackFixtures.find(fixture => fixture.id === match.fixtureId)
      )
    ));

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <p role="status" className="text-gray-300">{text("Chargement du panier…", "Loading basket…")}</p>
      </main>
    );
  }

  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const remainingLabel = Number.isFinite(remainingProposals) ? `${remainingProposals}/3` : "∞";

  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <Link href="/predictions" className="text-sm font-semibold text-green-400 hover:text-green-300">
            ← {text("Retour aux rencontres", "Back to fixtures")}
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-white">{text("Mon panier", "My basket")}</h1>
          <p className="mt-2 text-gray-400">
            {text("Retrouvez vos matchs sélectionnés et vos combinaisons déjà générées.", "Manage selected fixtures and already generated combinations.")}
          </p>
        </header>

        {basketError && <p role="alert" className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{basketError}</p>}
        {fixtureStatusError && <p role="alert" className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{fixtureStatusError}</p>}
        {saveError && (
          <div role="alert" className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
            <p>{saveError}</p>
            {isAuthenticated && remainingProposals <= 0 && (
              <Link href="/payment" className="mt-2 inline-block font-semibold underline">
                {text("Voir les offres Premium", "View Premium plans")}
              </Link>
            )}
          </div>
        )}

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2" role="tablist" aria-label={text("Contenu du panier", "Basket content")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "basket"}
            onClick={() => setActiveTab("basket")}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${activeTab === "basket" ? "bg-green-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {text("Mon panier", "My basket")} ({fixtures.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "generated"}
            onClick={() => setActiveTab("generated")}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${activeTab === "generated" ? "bg-green-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {text("Déjà générées", "Already generated")} ({generatedCombinations.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "selections"}
            onClick={() => setActiveTab("selections")}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${activeTab === "selections" ? "bg-green-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {text("Mes sélections", "My selections")} ({savedSelections.length})
          </button>
        </div>

        {activeTab === "generated" && (
          <section className="space-y-4" aria-label={text("Combinaisons déjà générées", "Already generated combinations")}>
            {generatedCombinations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/70 px-6 py-12 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-950 text-green-300">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{text("Aucune combinaison enregistrée", "No saved combinations")}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
                  {text("Ajoutez ici une combinaison depuis la page Combinaisons. Elle sera conservée telle qu’elle a été générée.", "Add a combination from the Combinations page. It will be saved exactly as generated.")}
                </p>
                <Link href="/combinations" className="mt-5 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500">
                  {text("Trouver une combinaison", "Find a combination")}
                </Link>
              </div>
            ) : (
              generatedCombinations.slice().reverse().map(combination => (
                <article key={combination.id} className="overflow-hidden rounded-2xl border border-green-900/70 bg-gradient-to-br from-gray-900 to-gray-950 shadow-lg shadow-black/30">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 p-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-green-400">
                        {text("Combinaison déjà générée", "Already generated combination")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-bold text-white">{combination.coupon.title}</h2>
                        {(() => {
                          const outcome = couponOutcome(combination.coupon, combination.fixtures);
                          return (
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${outcomeStyle(outcome)}`}>
                              <span aria-hidden="true">{outcomeIcon(outcome)}</span>
                              {outcomeLabel(outcome)}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="mt-1 text-sm text-gray-400">{combination.coupon.description}</p>
                      <p className="mt-2 text-xs text-gray-500">{new Date(combination.createdAt).toLocaleString(locale)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {typeof combination.coupon.estimatedCombinedRate === "number" && (
                        <span className="rounded-full border border-green-800 bg-green-950/60 px-3 py-1 text-sm font-semibold text-green-200">
                          {text("Estimation indicative", "Indicative estimate")} {combination.coupon.estimatedCombinedRate}%
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeGeneratedCombination(combination.id)}
                        aria-label={text("Retirer cette combinaison", "Remove this combination")}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-gray-700 text-gray-400 transition hover:border-red-700 hover:text-red-300"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  </header>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {combination.coupon.matches.map(match => {
                      const fixture = fixturesById[match.fixtureId] ?? combination.fixtures.find(item => item.id === match.fixtureId);
                      const matchOutcome = settleCouponMatch(match, fixture);
                      const finished = fixture ? isFixtureFinished(fixture) : false;
                      const score = fixture && finished ? parseFixtureScore(fixture) : null;
                      return (
                        <article key={match.fixtureId} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="font-semibold text-white">{match.homeTeam} — {match.awayTeam}</h3>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeStyle(matchOutcome)}`}>
                              <span aria-hidden="true">{outcomeIcon(matchOutcome)}</span>
                              {outcomeLabel(matchOutcome)}
                            </span>
                          </div>
                          {fixture?.score && <p className="mt-1 text-xs text-gray-400">{text("Score final :", "Final score:")} {fixture.score}</p>}
                          <ul className="mt-3 space-y-2">
                            {match.picks.map(pick => {
                              const pickOutcomeValue = score ? settleCouponPick(pick, score) : null;
                              const pickOutcome: CouponOutcome = score
                                ? pickOutcomeValue === null ? "unavailable" : pickOutcomeValue ? "won" : "lost"
                                : finished ? "unavailable" : "pending";
                              return (
                                <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <span className="text-gray-300">{getCouponPickLabel(pick)}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${outcomeStyle(pickOutcome)}`}>
                                    <span aria-hidden="true">{outcomeIcon(pickOutcome)}</span>
                                    {score || finished
                                      ? outcomeLabel(pickOutcome)
                                      : pick.historicalRate === null
                                        ? text("Pas de données", "No data")
                                        : `${pick.historicalRate}% (${pick.sampleSize} ${text("match(s)", "matches")})`}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-3 inline-block text-xs font-semibold text-green-400 hover:text-green-300">
                            {text("Voir le match →", "View fixture →")}
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === "selections" && (
          <section className="mb-6 rounded-xl border border-green-900 bg-gray-950 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{text("Mes sélections", "My selections")}</h2>
                <p className="mt-1 text-sm text-gray-400">{text("Ces sélections sont enregistrées sur cet appareil.", "These selections are saved on this device.")}</p>
              </div>
              <span className="text-sm text-green-300">{savedSelections.length}</span>
            </div>
            {savedSelections.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 text-center">
                <p className="text-sm text-gray-300">
                  {isAuthenticated
                    ? text("Aucune sélection enregistrée pour le moment.", "You have no saved selections yet.")
                    : text("Connectez-vous pour enregistrer et retrouver vos sélections.", "Log in to save and view your selections.")}
                </p>
                {!isAuthenticated && (
                  <Link href="/login?next=%2Fbasket" className="mt-3 inline-block font-semibold text-green-400 hover:text-green-300">
                    {text("Se connecter", "Log in")}
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
              {[...savedSelections].reverse().map(selection => (
                <article key={selection.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                  <p className="text-xs text-gray-500">
                    {new Date(selection.createdAt).toLocaleString(locale)}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {selection.fixtures.map(fixture => {
                      const currentFixture = fixturesById[fixture.id] ?? fixture;
                      return (
                        <li key={fixture.id} className="text-sm text-gray-200">
                          {fixture.homeTeam} — {fixture.awayTeam}
                          <span className="ml-2 text-gray-500">
                            {currentFixture.score || currentFixture.status || fixture.time}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void generateSelectionCoupons(selection)}
                    disabled={generatingSelectionId !== null || Boolean(selection.coupons)}
                    className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selection.coupons
                        ? "border border-gray-700 bg-gray-800 text-gray-300"
                        : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                  >
                    {selection.coupons
                      ? text("Coupons déjà générés", "Coupons already generated")
                      : generatingSelectionId === selection.id
                        ? text("Génération…", "Generating…")
                        : text("Générer 3 coupons", "Generate 3 coupons")}
                  </button>
                  {couponErrors[selection.id] && (
                    <p role="alert" className="mt-3 text-sm text-red-300">{couponErrors[selection.id]}</p>
                  )}
                  {selection.coupons && (
                    <div className="mt-4 space-y-3">
                      {selection.couponsGeneratedAt && (
                        <p className="text-xs text-gray-500">
                          {text("Générés le ", "Generated on ")}
                          {new Date(selection.couponsGeneratedAt).toLocaleString(locale)}
                        </p>
                      )}
                      <p className="text-xs text-amber-300">
                        {text(
                          "Chaque match est une nouvelle chance. Gardez confiance, profitez du jeu et avancez avec espoir !",
                          "Every match is a new chance. Stay hopeful, enjoy the game, and keep believing!"
                        )}
                      </p>
                      {uniqueGeneratedCoupons(selection.coupons).map(coupon => (
                        <section key={coupon.level} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-white">
                              {text(coupon.title, coupon.level === "sure" ? "Safer coupon" : coupon.level === "medium" ? "Medium-risk coupon" : "Risky coupon")}
                            </h3>
                            {(() => {
                              const outcome = couponOutcome(coupon, selection.fixtures);
                              return (
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeStyle(outcome)}`}>
                                  <span aria-hidden="true">{outcomeIcon(outcome)}</span>
                                  {outcomeLabel(outcome)}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="mt-1 text-xs text-gray-400">
                            {text(
                              coupon.level === "sure"
                                ? "Double chance + au moins 1 but"
                                : coupon.level === "medium"
                                  ? "Résultat historique le plus fréquent + au moins 2 buts"
                                  : "Vainqueur le plus fréquent + au moins 3 buts",
                              coupon.level === "sure"
                                ? "Double chance + at least 1 goal"
                                : coupon.level === "medium"
                                  ? "Most frequent historical result + at least 2 goals"
                                  : "Most frequent winner + at least 3 goals"
                            )}
                          </p>
                          <ul className="mt-3 space-y-2">
                            {coupon.matches.map(match => {
                              const fixture = fixturesById[match.fixtureId] ?? selection.fixtures.find(item => item.id === match.fixtureId);
                              const matchOutcome = settleCouponMatch(match, fixture);
                              return (
                              <li key={match.fixtureId} className="rounded-md bg-gray-900/70 p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-white">{match.homeTeam} — {match.awayTeam}</p>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${outcomeStyle(matchOutcome)}`}>
                                    <span aria-hidden="true">{outcomeIcon(matchOutcome)}</span>
                                    {outcomeLabel(matchOutcome)}
                                  </span>
                                </div>
                                {fixture?.score && isFixtureFinished(fixture) && (
                                  <p className="mt-1 text-xs text-gray-400">{text("Score final :", "Final score:")} {fixture.score}</p>
                                )}
                                <ul className="mt-2 space-y-1">
                                  {match.picks.map(pick => {
                                    const finished = fixture ? isFixtureFinished(fixture) : false;
                                    const score = fixture && finished ? parseFixtureScore(fixture) : null;
                                    const pickOutcomeValue = score ? settleCouponPick(pick, score) : null;
                                    const pickOutcome: CouponOutcome = score
                                      ? pickOutcomeValue === null ? "unavailable" : pickOutcomeValue ? "won" : "lost"
                                      : finished ? "unavailable" : "pending";
                                    return (
                                      <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <span className="text-gray-300">{getCouponPickLabel(pick)}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${outcomeStyle(pickOutcome)}`}>
                                          <span aria-hidden="true">{outcomeIcon(pickOutcome)}</span>
                                          {score || finished
                                            ? outcomeLabel(pickOutcome)
                                            : pick.historicalRate === null
                                              ? text("Pas de données", "No data")
                                              : text(
                                                `${pick.historicalRate}% sur ${pick.sampleSize} match(s)`,
                                                `${pick.historicalRate}% across ${pick.sampleSize} match(es)`
                                              )}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "basket" && (fixtures.length === 0 ? (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <h2 className="text-lg font-semibold text-white">{text("Votre panier est vide", "Your basket is empty")}</h2>
            <p className="mt-2 text-sm text-gray-400">{text("Ajoutez des matchs depuis les pages Rencontres ou Calendrier.", "Add fixtures from the Fixtures or Schedule pages.")}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/predictions" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                {text("Choisir des matchs", "Choose fixtures")}
              </Link>
              <Link href="/ai-search" className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-green-600">
                {text("Par lieu et compétition", "By location and competition")}
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="space-y-3" aria-label={text("Matchs dans le panier", "Fixtures in basket")}>
              {fixtures.map(fixture => {
                const currentFixture = fixturesById[fixture.id] ?? fixture;
                const dateLabel = new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                return (
                  <article key={fixture.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{fixture.homeTeam} <span className="text-gray-500">—</span> {fixture.awayTeam}</p>
                      <p className="mt-1 text-sm text-gray-400">{currentFixture.location ? `${currentFixture.location} · ` : ""}{currentFixture.competition ?? currentFixture.league}</p>
                      <p className="mt-1 text-xs text-gray-500">{dateLabel} · {currentFixture.time}{currentFixture.status ? ` · ${currentFixture.status}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {currentFixture.score && <span className="font-bold text-white">{currentFixture.score}</span>}
                      <button
                        type="button"
                        onClick={() => removeFixture(fixture.id)}
                        className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-red-700 hover:text-red-300"
                      >
                        {text("Retirer", "Remove")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{text(`${fixtures.length}/${MAX_SELECTION_SIZE} matchs`, `${fixtures.length}/${MAX_SELECTION_SIZE} fixtures`)}</p>
                  {isAuthenticated ? (
                    <p className="mt-1 text-sm text-gray-400">
                      {text("Sélections restantes", "Selections remaining")}: {remainingLabel}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-amber-300">
                      {text("Connectez-vous pour enregistrer cette sélection.", "Log in to save this selection.")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={saveSelection}
                  disabled={fixtures.length === 0}
                  className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAuthenticated
                    ? text("Enregistrer ma sélection", "Save my selection")
                    : text("Se connecter pour valider", "Log in to continue")}
                </button>
              </div>
              <p className="mt-4 border-t border-gray-800 pt-4 text-xs text-gray-500">
                {text(
                  "Cette action enregistre vos matchs et utilise une sélection de votre quota. Aucun pronostic ou cote automatique n’est produit.",
                  "This saves your fixtures and uses one selection from your quota. It does not generate a prediction or odds."
                )}
              </p>
            </section>

            <button type="button" onClick={clearBasket} className="mt-4 text-sm text-gray-400 underline hover:text-white">
              {text("Vider le panier", "Clear basket")}
            </button>
          </>
        ))}
      </div>
    </main>
  );
}
