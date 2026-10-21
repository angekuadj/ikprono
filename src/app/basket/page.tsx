"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  readCouponHistory,
  subscribeToCouponHistory,
  writeCouponHistory,
  type StoredCouponHistory,
} from "@/lib/couponHistory";
import {
  readSavedSelections,
  writeSavedSelections,
  type SavedSelection,
} from "@/lib/savedSelections";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import { uniqueGeneratedCoupons, type GeneratedCoupon, type CouponPick, type CouponFixturePrediction } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";
import {
  isFixtureFinished,
  parseFixtureScore,
  settleCoupon,
  settleCouponMatch,
  settleCouponPick,
  combinationCompletion,
  type CouponOutcome,
} from "@/lib/couponSettlement";
import { generateUUID } from "@/lib/uuid";
import { recordCombinationUsage } from "@/lib/subscription";
import { postJson } from "@/lib/apiClient";
import { exportCombinationPdf } from "@/lib/exportCombinationPdf";
import { MARKET_ESTIMATES, type MarketSelection } from "@/lib/marketEstimates";
import {
  readMarketSelections,
  subscribeToMarketSelections,
  writeMarketSelections,
  type MarketSelectionsByFixture,
} from "@/lib/marketSelections";

const MAX_SELECTION_SIZE = 20;
type BasketTab = "basket" | "generated" | "history" | "selections";

export default function BasketPage() {
  const { user, isAuthenticated, isLoading, entitlements, refreshEntitlements } = useAuth();
  const { language, text } = useLanguage();
  const router = useRouter();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [generatedCombinations, setGeneratedCombinations] = useState<StoredGeneratedCombination[]>([]);
  const [couponHistory, setCouponHistory] = useState<StoredCouponHistory[]>([]);
  const [basketError, setBasketError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>([]);
  const [marketSelections, setMarketSelections] = useState<MarketSelectionsByFixture>({});
  const [couponErrors, setCouponErrors] = useState<Record<string, string>>({});
  const [generatingSelectionId, setGeneratingSelectionId] = useState<string | null>(null);
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<BasketTab>("generated");
  const [expandedCombinations, setExpandedCombinations] = useState<Set<string>>(new Set());
  const trackedFixtures = useMemo(
    () => [
      ...fixtures,
      ...generatedCombinations.flatMap(combination => combination.fixtures),
      ...couponHistory.flatMap(combination => combination.fixtures),
      ...savedSelections.flatMap(selection => selection.fixtures),
    ],
    [fixtures, generatedCombinations, couponHistory, savedSelections]
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
    const syncMarketSelections = () => {
      try {
        setMarketSelections(readMarketSelections());
      } catch (error) {
        setBasketError(error instanceof Error ? error.message : text("Impossible de lire les marchés sélectionnés.", "Unable to read selected markets."));
      }
    };
    syncMarketSelections();
    return subscribeToMarketSelections(syncMarketSelections);
  }, [text]);

  useEffect(() => {
    const syncGeneratedCombinations = () => {
      try {
        const combinations = readGeneratedCombinations();
        console.log("📥 Lecture des combinaisons dans le panier:", combinations.length);
        setGeneratedCombinations(combinations);
        setBasketError("");
      } catch (error) {
        console.error("❌ Erreur lecture combinaisons:", error);
        setBasketError(error instanceof Error ? error.message : text("Impossible de lire les combinaisons enregistrées.", "Unable to read saved combinations."));
      }
    };
    syncGeneratedCombinations();
    return subscribeToGeneratedCombinations(syncGeneratedCombinations);
  }, [text]);

  useEffect(() => {
    const syncCouponHistory = () => {
      try {
        setCouponHistory(readCouponHistory());
        setBasketError("");
      } catch (error) {
        setBasketError(error instanceof Error ? error.message : text("Impossible de lire l'historique des coupons.", "Unable to read coupon history."));
      }
    };
    syncCouponHistory();
    return subscribeToCouponHistory(syncCouponHistory);
  }, [text]);

  // Auto-archivage : la vérification ne démarre qu'après 20 secondes
  // suivant l'ouverture de la page /basket.
  useEffect(() => {
    const timer = setTimeout(() => {
      setVerificationEnabled(true);
    }, 6_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!verificationEnabled) return;
    for (const combination of generatedCombinations) {
      archiveGeneratedCombination(combination);
    }
  }, [generatedCombinations, fixturesById, verificationEnabled]);

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

  // Set initial tab based on localStorage data (client-side only)
  useEffect(() => {
    const initialGenerated = readGeneratedCombinations();
    const initialBasket = readFixtureBasket();
    setActiveTab(initialGenerated.length > 0 ? "generated" : initialBasket.length > 0 ? "basket" : "generated");
  }, []);

  const removeFixture = (fixtureId: string) => {
    try {
      writeFixtureBasket(fixtures.filter(fixture => fixture.id !== fixtureId));
      const nextSelections = readMarketSelections();
      delete nextSelections[fixtureId];
      writeMarketSelections(nextSelections);
      setSaveError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de modifier le panier.", "Unable to update the basket."));
    }
  };

  const clearBasket = () => {
    try {
      writeFixtureBasket([]);
      writeMarketSelections({});
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

  const removeMatchFromCombination = (combinationId: string, matchId: string) => {
    try {
      const combination = generatedCombinations.find(c => c.id === combinationId);
      if (!combination) return;
      const nextMatches = combination.coupon.matches.filter(match => match.fixtureId !== matchId);
      const nextFixtures = combination.fixtures.filter(fixture => fixture.id !== matchId);
      if (nextMatches.length === 0) {
        writeGeneratedCombinations(generatedCombinations.filter(c => c.id !== combinationId));
      } else {
        const updated: StoredGeneratedCombination = {
          ...combination,
          coupon: { ...combination.coupon, matches: nextMatches },
          fixtures: nextFixtures,
        };
        writeGeneratedCombinations(
          generatedCombinations.map(c => (c.id === combinationId ? updated : c))
        );
      }
      setBasketError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de retirer ce match.", "Unable to remove this match."));
    }
  };

  const archiveGeneratedCombination = (combination: StoredGeneratedCombination) => {
    try {
      const history = readCouponHistory();
      const alreadyArchived = history.some(item => item.id === combination.id);
      if (alreadyArchived) return;

      // Déterminer le résultat automatiquement : tous les matchs doivent être terminés
      const allFinished = combination.coupon.matches.every(match => {
        const fixture = combination.fixtures.find(f => f.id === match.fixtureId) ?? fixturesById[match.fixtureId];
        return fixture ? isFixtureFinished(fixture) : false;
      });
      if (!allFinished) return;

      const matchOutcomes = combination.coupon.matches.map(match => {
        const fixture = combination.fixtures.find(f => f.id === match.fixtureId) ?? fixturesById[match.fixtureId];
        return settleCouponMatch(match, fixture);
      });
      const finalOutcome = settleCoupon(matchOutcomes);
      if (finalOutcome !== "won" && finalOutcome !== "lost") return;

      const archived: StoredCouponHistory = {
        id: combination.id,
        createdAt: combination.createdAt,
        archivedAt: new Date().toISOString(),
        coupon: combination.coupon,
        fixtures: combination.fixtures,
        finalOutcome,
      };
      writeCouponHistory([...history, archived]);
      writeGeneratedCombinations(generatedCombinations.filter(candidate => candidate.id !== combination.id));
      setBasketError("");
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible d'archiver cette combinaison.", "Unable to archive this combination."));
    }
  };

  const saveSelection = () => {
    setSaveError("");
    if (!isAuthenticated || !user) {
      router.push("/login?next=%2Fbasket");
      return;
    }
    if (fixtures.length === 0) return;
    if (!entitlements.canGenerate) {
      setSaveError(entitlements.trialActive || entitlements.hasCombinationAccess
        ? text(
          `Vous avez atteint votre quota de ${entitlements.dailyLimit} combinaisons aujourd’hui. Revenez demain.`,
          `You have reached your quota of ${entitlements.dailyLimit} combinations today. Come back tomorrow.`
        )
        : text(
          "Aucune offre active : la génération de combinaisons est en pause. Choisissez l’offre Combinaisons pour continuer.",
          "No active plan: combination generation is paused. Choose the Combinations plan to continue."
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
      marketPicks: Object.fromEntries(
        fixtures
          .filter(fixture => (marketSelections[fixture.id] ?? []).length > 0)
          .map(fixture => [fixture.id, marketSelections[fixture.id]])
      ),
    };
    try {
      writeSavedSelections(user.id, [...existingSelections, selection]);
      const usage = recordCombinationUsage({
        accountId: user.id,
        isAuthenticated: true,
        role: user.role,
        guestRemaining: 0,
      }, 1);
      if (usage.accepted === 0) {
        writeSavedSelections(user.id, existingSelections);
        setSaveError(text(
          "Votre quota de combinaisons est épuisé. Choisissez une offre pour continuer.",
          "Your combination quota is used up. Choose a plan to continue."
        ));
        return;
      }
      writeFixtureBasket([]);
      writeMarketSelections({});
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
      const response = await postJson("/api/coupons/generate", {
        userId: user.id,
        selectionId: selection.id,
        fixtureIds: selection.fixtures.map(fixture => fixture.id),
      });
      const payload = await response.json() as {
        coupons?: GeneratedCoupon[];
        alreadyGenerated?: boolean;
        error?: string;
        code?: string;
      };
      if (response.status === 402) {
        throw new Error(payload.error || text(
          "Votre quota de combinaisons du jour est épuisé. Choisissez une offre pour continuer.",
          "Your daily combination quota is used up. Choose a plan to continue."
        ));
      }
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
      void refreshEntitlements();
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
      "over-3.5": text("Plus de 3,5 buts", "Over 3.5 goals"),
      "under-0.5": text("Moins de 0,5 but", "Under 0.5 goals"),
      "under-1.5": text("Moins de 1,5 buts", "Under 1.5 goals"),
      "under-2.5": text("Moins de 2,5 buts", "Under 2.5 goals"),
      "under-3.5": text("Moins de 3,5 buts", "Under 3.5 goals"),
      "home-1.5": text("Domicile -1.5", "Home -1.5"),
      "away-1.5": text("Extérieur -1.5", "Away -1.5"),
      "home-2.5": text("Domicile -2.5", "Home -2.5"),
      "away-2.5": text("Extérieur -2.5", "Away -2.5"),
      "home+1.5": text("Domicile +1.5", "Home +1.5"),
      "away+1.5": text("Extérieur +1.5", "Away +1.5"),
      "home-over-1.5": text("Domicile plus de 1,5 but", "Home over 1.5 goals"),
      "away-over-1.5": text("Extérieur plus de 1,5 but", "Away over 1.5 goals"),
      "home-under-1.5": text("Domicile moins de 1,5 but", "Home under 1.5 goals"),
      "away-under-1.5": text("Extérieur moins de 1,5 but", "Away under 1.5 goals"),
      "home-0-1": text("Domicile entre 0 et 1 but", "Home 0 to 1 goals"),
      "home-1-3": text("Domicile entre 1 et 3 buts", "Home 1 to 3 goals"),
      "away-0-1": text("Extérieur entre 0 et 1 but", "Away 0 to 1 goals"),
      "away-1-3": text("Extérieur entre 1 et 3 buts", "Away 1 to 3 goals"),
      scorer: text("Buteur (n'importe quand)", "Anytime scorer"),
      assist: text("Passeur décisif (n'importe quand)", "Anytime assist"),
      "home-scorer": text("Buteur domicile (n'importe quand)", "Home scorer (anytime)"),
      "away-scorer": text("Buteur extérieur (n'importe quand)", "Away scorer (anytime)"),
      "home-assist": text("Passeur décisif domicile (n'importe quand)", "Home assist (anytime)"),
      "away-assist": text("Passeur décisif extérieur (n'importe quand)", "Away assist (anytime)"),
      "over-5.5": text("Plus de 5,5 corners", "Over 5.5 corners"),
      "over-8.5": text("Plus de 8,5 corners", "Over 8.5 corners"),
      "over-10.5": text("Plus de 10,5 corners", "Over 10.5 corners"),
    };
    return labels[pick.selection];
  };

  const fixtureStatusLabel = (fixture: Fixture | undefined) => {
    if (!fixture) return text("Prévu", "Scheduled");
    if (isFixtureFinished(fixture)) return text("Terminé", "Finished");
    const status = (fixture.status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR");
    if (/direct|live|en direct/.test(status)) return text("En direct", "Live");
    return text("Prévu", "Scheduled");
  };

  const combinationStatusLabel = (matches: CouponFixturePrediction[], fixtures: Fixture[], fixturesById?: Record<string, Fixture | undefined>) => {
    const getFixture = (matchId: string) => fixturesById?.[matchId] ?? fixtures.find(fx => fx.id === matchId);
    const anyLive = matches.some(match => {
      const f = getFixture(match.fixtureId);
      if (!f) return false;
      return !isFixtureFinished(f) && /direct|live|en direct/.test((f.status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR"));
    });
    if (anyLive) return text("En direct", "Live");
    const anyScheduled = matches.some(match => {
      const f = getFixture(match.fixtureId);
      if (!f) return false;
      return !isFixtureFinished(f);
    });
    if (anyScheduled) return text("En attente", "Pending");
    return text("Terminé", "Finished");
  };

  const exportGeneratedCombinationPdf = (combination: StoredGeneratedCombination) => {
    const matchStatuses = Object.fromEntries(combination.coupon.matches.map(match => {
      const fixture = fixturesById[match.fixtureId] ?? combination.fixtures.find(item => item.id === match.fixtureId);
      return [`${match.homeTeam} — ${match.awayTeam}`, settleCouponMatch(match, fixture)];
    }));
    const pickStatuses = Object.fromEntries(combination.coupon.matches.flatMap(match => {
      const fixture = fixturesById[match.fixtureId] ?? combination.fixtures.find(item => item.id === match.fixtureId);
      const score = fixture ? parseFixtureScore(fixture) : null;
      return match.picks.map(pick => {
        const result = score ? settleCouponPick(pick, score) : null;
        const outcome: CouponOutcome = score
          ? result === null ? "unavailable" : result ? "won" : "lost"
          : fixture && isFixtureFinished(fixture) ? "unavailable" : fixture ? "pending" : "unavailable";
        return [`${match.homeTeam} — ${match.awayTeam}::${getCouponPickLabel(pick)}`, outcome];
      });
    }));
    const content = [
      combination.coupon.title,
      combination.coupon.description,
      `${text("Date d’enregistrement", "Saved on")}: ${new Date(combination.createdAt).toLocaleString(locale)}`,
      ...(typeof combination.coupon.estimatedCombinedRate === "number"
        ? [`${text("Estimation indicative", "Indicative estimate")}: ${combination.coupon.estimatedCombinedRate}%`]
        : []),
      "",
      ...combination.coupon.matches.flatMap(match => [
        `${match.homeTeam} — ${match.awayTeam}`,
        ...match.picks.map(pick => `  - ${getCouponPickLabel(pick)}`),
        "",
      ]),
    ].join("\n");

    try {
      exportCombinationPdf(combination.coupon.title, content, language, matchStatuses, pickStatuses);
      setBasketError("");
    } catch (error) {
      console.error("Could not export saved combination as PDF.", error);
      setBasketError(text(
        "Impossible d’ouvrir l’export PDF. Autorisez les fenêtres contextuelles puis réessayez.",
        "Could not open the PDF export. Allow pop-ups and try again."
      ));
    }
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
  const marketPickLabel = (pick: MarketSelection) => {
    const market = MARKET_ESTIMATES.find(option => option.id === pick.market);
    return market ? text(market.label, market.labelEn) : pick.market;
  };
  const combinationMarketEstimate = (picks: MarketSelection[]) => {
    if (picks.length === 0) return null;
    const estimatedProbability = picks.reduce((probability, pick) => probability * pick.estimatedRate / 100, 1);
    return {
      probabilityPercent: estimatedProbability * 100,
      estimatedOdds: estimatedProbability > 0 ? 1 / estimatedProbability : null,
    };
  };

  const toggleCombinationExpansion = (combinationId: string) => {
    setExpandedCombinations(prev => {
      const next = new Set(prev);
      if (next.has(combinationId)) {
        next.delete(combinationId);
      } else {
        next.add(combinationId);
      }
      return next;
    });
  };
  const basketMarketPicks = fixtures.flatMap(fixture => marketSelections[fixture.id] ?? []);
  const basketEstimate = combinationMarketEstimate(basketMarketPicks);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <p role="status" className="text-gray-300">{text("Chargement du panier…", "Loading basket…")}</p>
      </main>
    );
  }

  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const remainingLabel = Number.isFinite(entitlements.remainingToday) ? `${entitlements.remainingToday}/${entitlements.dailyLimit}` : "∞";

  return (
    <main className="feature-page page-basket min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="basket-layout mx-auto">
        <header className="basket-header mb-5">
          <div>
            <Link href="/predictions" className="basket-back-link">
              <span aria-hidden="true">←</span>
              {text("Retour aux rencontres", "Back to fixtures")}
            </Link>
            <p className="basket-eyebrow">{text("VOTRE ESPACE DE SÉLECTION", "YOUR PICKS WORKSPACE")}</p>
            <h1 className="text-3xl font-bold text-white">{text("Mon panier", "My basket")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              {text("Organisez vos matchs, suivez vos combinaisons et retrouvez vos sélections en un seul endroit.", "Organize fixtures, track combinations and manage your picks in one place.")}
            </p>
          </div>
          <Link href="/predictions" className="basket-add-link">
            <span aria-hidden="true">+</span>
            {text("Ajouter des matchs", "Add fixtures")}
          </Link>
        </header>

        <section className="basket-overview mb-6" aria-label={text("Résumé du panier", "Basket overview")}>
          <article className="basket-overview-card">
            <span className="basket-overview-label">{text("Matchs sélectionnés", "Selected fixtures")}</span>
            <strong>{fixtures.length}<small>/{MAX_SELECTION_SIZE}</small></strong>
            <span>{text("dans le panier", "in your basket")}</span>
          </article>
          <article className="basket-overview-card">
            <span className="basket-overview-label">{text("Combinaisons", "Combinations")}</span>
            <strong>{generatedCombinations.length}</strong>
            <span>{text("déjà générées", "already generated")}</span>
          </article>
          <article className="basket-overview-card">
            <span className="basket-overview-label">{text("Historique", "History")}</span>
            <strong>{couponHistory.length}</strong>
            <span>{text("coupons archivés", "saved coupons")}</span>
          </article>
          <article className="basket-overview-card basket-overview-quota">
            <span className="basket-overview-label">{text("Quota du jour", "Daily quota")}</span>
            <strong>{isAuthenticated ? remainingLabel : "—"}</strong>
            <span>{isAuthenticated ? text("générations restantes", "generations remaining") : text("connexion requise", "sign in required")}</span>
          </article>
        </section>

        {basketError && <p role="alert" className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{basketError}</p>}
        {fixtureStatusError && <p role="alert" className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{fixtureStatusError}</p>}
        {saveError && (
          <div role="alert" className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
            <p>{saveError}</p>
            {isAuthenticated && !entitlements.canGenerate && (
              <Link href="/payment" className="mt-2 inline-block font-semibold underline">
                {text("Voir les offres", "View plans")}
              </Link>
            )}
          </div>
        )}

        <div className="basket-tabs mb-6 rounded-xl border border-gray-800 bg-gray-900 p-2" role="tablist" aria-label={text("Contenu du panier", "Basket content")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "basket"}
            onClick={() => setActiveTab("basket")}
            className={`basket-tab rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === "basket" ? "is-active" : ""}`}
          >
            <span>{text("Panier", "Basket")}</span><span className="basket-tab-count">{fixtures.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "generated"}
            onClick={() => setActiveTab("generated")}
            className={`basket-tab rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === "generated" ? "is-active" : ""}`}
          >
            <span>{text("Générées", "Generated")}</span><span className="basket-tab-count">{generatedCombinations.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            className={`basket-tab rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === "history" ? "is-active" : ""}`}
          >
            <span>{text("Historique", "History")}</span><span className="basket-tab-count">{couponHistory.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "selections"}
            onClick={() => setActiveTab("selections")}
            className={`basket-tab rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === "selections" ? "is-active" : ""}`}
          >
            <span>{text("Mes sélections", "My picks")}</span><span className="basket-tab-count">{savedSelections.length}</span>
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
                  {text("Ajoutez une combinaison depuis la page Combinaisons après avoir retiré les rencontres que vous ne souhaitez pas garder.", "Add a combination from the Combinations page after removing any fixtures you do not want to keep.")}
                </p>
                <Link href="/combinations" className="mt-5 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500">
                  {text("Trouver une combinaison", "Find a combination")}
                </Link>
              </div>
            ) : (
              generatedCombinations.slice().reverse().map(combination => {
                const isExpanded = expandedCombinations.has(combination.id);
                const outcome = couponOutcome(combination.coupon, combination.fixtures);
                const completion = combinationCompletion({
                  matches: combination.coupon.matches,
                  fixtures: combination.fixtures,
                  fixturesById,
                });
                const isArchivingSoon = completion.allFinished && (outcome === "won" || outcome === "lost");
                // Le badge "En cours" ne s'affiche que si le résultat global n'est pas encore déterminé.
                const showProgressBadge = outcome === "pending";
                return (
                  <article key={combination.id} className="overflow-hidden rounded-2xl border border-green-900/70 bg-gradient-to-br from-gray-900 to-gray-950 shadow-lg shadow-black/30">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 p-4 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleCombinationExpansion(combination.id)}
                          className="flex w-full items-start gap-2 text-left"
                        >
                          <svg
                            className={`h-5 w-5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-400">
                              {text("Combinaison déjà générée", "Already generated combination")}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-bold text-white sm:text-xl">{combination.coupon.title}</h2>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${outcomeStyle(outcome)}`}>
                                <span aria-hidden="true">{outcomeIcon(outcome)}</span>
                                {outcomeLabel(outcome)}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${outcome === "pending" ? "border-gray-600 bg-gray-900/50 text-gray-300" : outcome === "lost" ? "border-red-700 bg-red-950/40 text-red-200" : "border-green-600 bg-green-950/40 text-green-200"}`}>
                                <span aria-hidden="true">{outcome === "pending" ? "⏳" : outcome === "lost" ? "✕" : "✓"}</span>
                                {combinationStatusLabel(combination.coupon.matches, combination.fixtures, fixturesById)}
                              </span>
                              {showProgressBadge && completion.total > 0 && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                    isArchivingSoon
                                      ? "border-orange-600 bg-orange-950/40 text-orange-300"
                                      : "border-gray-600 bg-gray-900/50 text-gray-300"
                                  }`}
                                >
                                  <span aria-hidden="true">
                                    {isArchivingSoon ? "⟳" : "●"}
                                  </span>
                                  {isArchivingSoon
                                    ? `${text("À archiver", "Archiving soon")} (${completion.finished}/${completion.total})`
                                    : `${text("En cours", "In progress")} (${completion.pending}/${completion.total})`}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-400">{combination.coupon.description}</p>
                            <p className="mt-1.5 text-[11px] text-gray-500">{new Date(combination.createdAt).toLocaleString(locale)}</p>
                          </div>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {typeof combination.coupon.estimatedCombinedRate === "number" && (
                          <span className="rounded-full border border-green-800 bg-green-950/60 px-3 py-1 text-xs font-semibold text-green-200">
                            {text("Estimation indicative", "Indicative estimate")} {combination.coupon.estimatedCombinedRate}%
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => exportGeneratedCombinationPdf(combination)}
                          title={text("Ouvrir l’impression et choisir « Enregistrer au format PDF »", "Open print and choose “Save as PDF”")}
                          className="rounded-lg border border-green-700 px-3 py-1.5 text-xs font-semibold text-green-200 transition hover:bg-green-950/50"
                        >
                          {text("Exporter PDF", "Export PDF")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGeneratedCombination(combination.id)}
                          aria-label={text("Retirer cette combinaison", "Remove this combination")}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-700 text-gray-400 transition hover:border-red-700 hover:text-red-300"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>
                  </header>
                  {isExpanded && (
                    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
                    {combination.coupon.matches.map(match => {
                      const fixture = fixturesById[match.fixtureId] ?? combination.fixtures.find(item => item.id === match.fixtureId);
                      const matchOutcome = settleCouponMatch(match, fixture);
                      const finished = fixture ? isFixtureFinished(fixture) : false;
                      const score = fixture && finished ? parseFixtureScore(fixture) : null;
                      const matchDateLabel = fixture
                        ? new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                        })
                        : null;
                      return (
                        <article key={match.fixtureId} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                          <div className="flex items-center justify-between gap-2 border-b border-dashed border-gray-800 pb-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <p className="min-w-0 truncate text-[10px] font-medium text-gray-400">
                                {fixture
                                  ? `${fixture.sport === "football" ? "⚽ " : ""}${fixture.competition ?? fixture.league} · ${matchDateLabel} (${fixture.time})`
                                  : text("Détails de la rencontre", "Fixture details")}
                              </p>
                              <span className={`text-[10px] font-semibold ${fixture && isFixtureFinished(fixture) ? "text-gray-300" : fixture && /direct|live|en direct/.test((fixture.status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR")) ? "text-green-300" : "text-amber-300"}`}>
                                {fixtureStatusLabel(fixture)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeStyle(matchOutcome)}`}>
                                <span aria-hidden="true">{outcomeIcon(matchOutcome)}</span>
                                {outcomeLabel(matchOutcome)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeMatchFromCombination(combination.id, match.fixtureId)}
                                aria-label={text(`Retirer ${match.homeTeam} — ${match.awayTeam}`, `Remove ${match.homeTeam} — ${match.awayTeam}`)}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-gray-700 text-gray-400 transition hover:border-red-700 hover:bg-red-950/40 hover:text-red-300"
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {fixture?.homeImageUrl && (
                                <Image src={fixture.homeImageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 object-contain" />
                              )}
                              <h3 className="line-clamp-2 text-xs font-semibold text-white">{match.homeTeam}</h3>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                              {fixture?.score ?? "VS"}
                            </span>
                            <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                              <h3 className="line-clamp-2 text-xs font-semibold text-white">{match.awayTeam}</h3>
                              {fixture?.awayImageUrl && (
                                <Image src={fixture.awayImageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 object-contain" />
                              )}
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1.5">
                            {match.picks.map(pick => {
                              const pickOutcomeValue = score ? settleCouponPick(pick, score) : null;
                              const pickOutcome: CouponOutcome = score
                                ? pickOutcomeValue === null ? "unavailable" : pickOutcomeValue ? "won" : "lost"
                                : finished ? "unavailable" : "pending";
                              return (
                                <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-gray-300">{getCouponPickLabel(pick)}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${outcomeStyle(pickOutcome)}`}>
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
                          <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-2 inline-block text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">
                            {text("Voir le match →", "View fixture →")}
                          </Link>
                        </article>
                      );
                    })}
                    </div>
                  )}
                </article>
                );
              })
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="space-y-4" aria-label={text("Historique des coupons", "Coupon history")}>
            {couponHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/70 px-6 py-12 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gray-800 text-gray-400">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.89l-3.62 3.62L7 14l1.42-1.42L11 13.17V15h2v-1.83l4.58-4.58L17 14l-3.75 3.75z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{text("Aucun coupon dans l'historique", "No coupons in history")}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
                  {text("Les combinaisons terminées (gagnées ou perdues) apparaissent ici une fois archivées.", "Finished combinations (won or lost) appear here once archived.")}
                </p>
              </div>
            ) : (
              couponHistory.slice().reverse().map(combination => {
                const outcome = combination.finalOutcome;
                return (
                  <article key={combination.id} className="overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 shadow-lg shadow-black/30">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 p-4 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-white sm:text-xl">{combination.coupon.title}</h2>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${outcomeStyle(outcome)}`}>
                            <span aria-hidden="true">{outcomeIcon(outcome)}</span>
                            {outcomeLabel(outcome)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{combination.coupon.description}</p>
                        <p className="mt-1.5 text-[11px] text-gray-500">
                          {text("Enregistrée le", "Saved on")} {new Date(combination.createdAt).toLocaleString(locale)} ·
                          {text("Archivée le", "Archived on")} {new Date(combination.archivedAt).toLocaleString(locale)}
                        </p>
                        {typeof combination.coupon.estimatedCombinedRate === "number" && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            {text("Estimation indicative", "Indicative estimate")}: {combination.coupon.estimatedCombinedRate}%
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          writeCouponHistory(couponHistory.filter(item => item.id !== combination.id));
                          setBasketError("");
                        }}
                        aria-label={text("Retirer de l'historique", "Remove from history")}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-700 text-gray-400 transition hover:border-red-700 hover:text-red-300"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </header>
                    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
                    {combination.coupon.matches.map(match => {
                      const fixture = combination.fixtures.find(item => item.id === match.fixtureId);
                      const matchOutcome = settleCouponMatch(match, fixture);
                      const finished = fixture ? isFixtureFinished(fixture) : false;
                      const score = fixture && finished ? parseFixtureScore(fixture) : null;
                      const matchDateLabel = fixture
                        ? new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                        })
                        : null;
                      return (
                        <article key={match.fixtureId} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                          <div className="flex items-center justify-between gap-2 border-b border-dashed border-gray-800 pb-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <p className="min-w-0 truncate text-[10px] font-medium text-gray-400">
                                {fixture
                                  ? `${fixture.sport === "football" ? "⚽ " : ""}${fixture.competition ?? fixture.league} · ${matchDateLabel} (${fixture.time})`
                                  : text("Détails de la rencontre", "Fixture details")}
                              </p>
                              <span className={`text-[10px] font-semibold ${fixture && isFixtureFinished(fixture) ? "text-gray-300" : fixture && /direct|live|en direct/.test((fixture.status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR")) ? "text-green-300" : "text-amber-300"}`}>
                                {fixtureStatusLabel(fixture)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeStyle(matchOutcome)}`}>
                                <span aria-hidden="true">{outcomeIcon(matchOutcome)}</span>
                                {outcomeLabel(matchOutcome)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeMatchFromCombination(combination.id, match.fixtureId)}
                                aria-label={text(`Retirer ${match.homeTeam} — ${match.awayTeam}`, `Remove ${match.homeTeam} — ${match.awayTeam}`)}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-gray-700 text-gray-400 transition hover:border-red-700 hover:bg-red-950/40 hover:text-red-300"
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {fixture?.homeImageUrl && (
                                <Image src={fixture.homeImageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 object-contain" />
                              )}
                              <h3 className="line-clamp-2 text-xs font-semibold text-white">{match.homeTeam}</h3>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                              {fixture?.score ?? "VS"}
                            </span>
                            <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                              <h3 className="line-clamp-2 text-xs font-semibold text-white">{match.awayTeam}</h3>
                              {fixture?.awayImageUrl && (
                                <Image src={fixture.awayImageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 object-contain" />
                              )}
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1.5">
                            {match.picks.map(pick => {
                              const pickOutcomeValue = score ? settleCouponPick(pick, score) : null;
                              const pickOutcome: CouponOutcome = score
                                ? pickOutcomeValue === null ? "unavailable" : pickOutcomeValue ? "won" : "lost"
                                : finished ? "unavailable" : "pending";
                              return (
                                <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-gray-300">{getCouponPickLabel(pick)}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${outcomeStyle(pickOutcome)}`}>
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
                          <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-2 inline-block text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">
                            {text("Voir le match →", "View fixture →")}
                          </Link>
                        </article>
                      );
                    })}
                    </div>
                  </article>
                );
              })
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
                      const picks = selection.marketPicks?.[fixture.id] ?? [];
                      return (
                        <li key={fixture.id} className="text-sm text-gray-200">
                          <span>{fixture.homeTeam} — {fixture.awayTeam}</span>
                          <span className="ml-2 text-gray-500">{currentFixture.score || currentFixture.status || fixture.time}</span>
                          {picks.length > 0 && (
                            <ul className="mb-2 ml-3 mt-1 space-y-1 border-l border-fuchsia-900 pl-2">
                              {picks.map(pick => (
                                <li key={pick.market} className="flex flex-wrap justify-between gap-x-2 text-xs text-gray-400">
                                  <span>{marketPickLabel(pick)}</span>
                                  <span className="text-fuchsia-200">{pick.estimatedRate}% · ≈{pick.estimatedOdds.toFixed(2)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {selection.marketPicks && (
                    <div className="mt-2 rounded-md border border-green-900/60 bg-green-950/20 p-2 text-xs text-green-200">
                      {(() => {
                        const estimate = combinationMarketEstimate(Object.values(selection.marketPicks).flat());
                        return estimate ? (
                          <>
                            <span className="font-semibold">                            {text("Estimation du modèle", "Model estimate")}: </span>
                            {estimate.probabilityPercent < 0.005 ? "< 0,01%" : `${estimate.probabilityPercent.toFixed(2)}%`}
                            {estimate.estimatedOdds && <span> · ≈{estimate.estimatedOdds.toFixed(2)}</span>}
                          </>
                        ) : text("Aucun marché sélectionné", "No market picks selected");
                      })()}
                    </div>
                  )}
                  {selection.marketPicks && Object.values(selection.marketPicks).some(picks => picks.length > 0) && (
                    <p className="mt-1 text-[10px] text-gray-500">
                      {text("Probabilités du modèle, pas des cotes bookmaker ; la combinaison suppose les choix indépendants.", "Model probabilities, not bookmaker odds; the combination assumes picks are independent.")}
                    </p>
                  )}
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
            <section className="grid gap-2.5 sm:grid-cols-2" aria-label={text("Matchs dans le panier", "Fixtures in basket")}>
              {fixtures.map(fixture => {
                const currentFixture = fixturesById[fixture.id] ?? fixture;
                const selectedMarketPicks = marketSelections[fixture.id] ?? [];
                const dateLabel = new Date(`${currentFixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                const dateTimeLabel = `${dateLabel} (${currentFixture.time})`;
                return (
                  <article key={fixture.id} className="basket-fixture-card relative overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 p-3 shadow-md shadow-black/20">
                    <div className="flex items-start justify-between gap-2 border-b border-dashed border-gray-700 pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-gray-300">
                          {currentFixture.sport === "football" ? "⚽ " : ""}{currentFixture.location ? `${currentFixture.location} · ` : ""}{currentFixture.competition ?? currentFixture.league}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-500">{dateTimeLabel}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFixture(fixture.id)}
                        aria-label={text(`Retirer ${fixture.homeTeam} — ${fixture.awayTeam}`, `Remove ${fixture.homeTeam} — ${fixture.awayTeam}`)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-gray-700 text-gray-400 transition hover:border-red-700 hover:bg-red-950/40 hover:text-red-300"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {currentFixture.homeImageUrl && (
                          <Image src={currentFixture.homeImageUrl} alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 object-contain" />
                        )}
                        <span className="line-clamp-2 text-xs font-semibold text-white">{currentFixture.homeTeam}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">VS</span>
                      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                        <span className="line-clamp-2 text-xs font-semibold text-white">{currentFixture.awayTeam}</span>
                        {currentFixture.awayImageUrl && (
                          <Image src={currentFixture.awayImageUrl} alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 object-contain" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-dashed border-gray-700 pt-2 text-[10px]">
                      <span className="truncate text-gray-400">{currentFixture.status || text("Rencontre sélectionnée", "Selected fixture")}</span>
                      {currentFixture.score && <span className="shrink-0 font-bold text-white">{currentFixture.score}</span>}
                    </div>
                    {selectedMarketPicks.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-gray-800 pt-2">
                        {selectedMarketPicks.map(pick => (
                          <li key={pick.market} className="flex flex-wrap items-center justify-between gap-x-2 text-[10px]">
                            <span className="text-gray-300">{marketPickLabel(pick)}</span>
                            <span className="rounded-full border border-fuchsia-900 bg-fuchsia-950/30 px-2 py-0.5 font-medium text-fuchsia-200">
                              {pick.estimatedRate}% · ≈{pick.estimatedOdds.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
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
              {basketEstimate && (
                <div className="mt-4 rounded-lg border border-green-800/70 bg-green-950/30 px-3 py-2.5">
                  <p className="text-xs font-semibold text-green-200">
                    {text("Estimation du modèle pour la combinaison", "Model estimate for the combination")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {basketEstimate.probabilityPercent < 0.005 ? "< 0,01%" : `${basketEstimate.probabilityPercent.toFixed(2)}%`}
                    {basketEstimate.estimatedOdds && <span className="ml-2 text-green-300">≈ {basketEstimate.estimatedOdds.toFixed(2)}</span>}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">
                    {text(
                      "Calcul basé sur les probabilités du modèle, en supposant les sélections indépendantes. Ce n’est pas une cote bookmaker ni une garantie.",
                      "Calculated from model probabilities, assuming independent picks. This is not bookmaker odds or a guarantee."
                    )}
                  </p>
                </div>
              )}
              <p className="mt-4 border-t border-gray-800 pt-4 text-xs text-gray-500">
                {text(
                  "Cette action enregistre les matchs et marchés choisis et utilise une sélection de votre quota. Les valeurs affichées sont des estimations du modèle, pas des cotes bookmaker.",
                  "This saves your chosen fixtures and markets and uses one selection from your quota. Displayed values are model estimates, not bookmaker odds."
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
