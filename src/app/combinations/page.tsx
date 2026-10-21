"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import { readFixtureBasket, writeFixtureBasket } from "@/lib/fixtureBasket";
import { readGeneratedCombinations, writeGeneratedCombinations } from "@/lib/generatedCombinations";
import { formatTheoreticalOdds, uniqueGeneratedCoupons, type GeneratedCoupon, type GeneratedStatisticCoupon, type GeneratedScorerCoupon, type CouponPick, type StatisticMarket } from "@/lib/coupons";
import type { Fixture, FixtureResponse } from "@/lib/fixtures";
import type { LiveMatchAnalysis } from "@/lib/liveAnalysis";
import {
  COMBINATION_DAILY_LIMIT,
  COMBINATIONS_MONTHLY_PRICE_FCFA,
  GUEST_COMBINATION_COUNT_KEY,
  GUEST_COMBINATION_LIMIT,
  GLOBAL_TRIAL_PHASE_END_DAY,
  PACK_MONTHLY_PRICE_FCFA,
  TRIAL_DAILY_LIMIT,
  TV_DAILY_PRICE_FCFA,
  isGlobalTrialPhaseActive,
  recordCombinationUsage,
  type ServerEntitlements,
} from "@/lib/subscription";
import { postJson } from "@/lib/apiClient";
import { generateUUID } from "@/lib/uuid";
import { exportCombinationPdf } from "@/lib/exportCombinationPdf";
import {
  readSavedStatisticCombinations,
  writeSavedStatisticCombinations,
  type SavedStatisticCombination,
} from "@/lib/savedStatisticCombinations";
import {
  isFixtureFinished,
  parseFixtureScore,
  settleCouponMatch,
  settleCouponPick,
  type CouponOutcome,
} from "@/lib/couponSettlement";

const MAX_FIXTURES = 20;
const DEFAULT_LOOKAHEAD_DAYS = 7;
const PAGE_SIZE = 12;

/**
 * Statuts considérés comme « en direct » par les API (`fotmob.ts` produit
 * « En direct » ; « mi-temps » et « en live » sont tolérés par sécurité).
 */
function isLiveFixtureStatus(status: string | undefined): boolean {
  const normalized = status?.trim().toLocaleLowerCase("fr-FR") ?? "";
  return normalized === "en direct" || normalized === "mi-temps" || normalized === "en live";
}

type RiskLevel = "very-safe" | "safe" | "medium" | "bold" | "very-risky";
type CombinationsTab = "fixtures" | "ai";

/** Normalise un texte pour la recherche (accents et casse ignorés). */
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Texte indexé pour une rencontre : équipes, compétition, ligue, date. */
function fixtureSearchText(fixture: Fixture): string {
  return normalizeSearchText([
    fixture.homeTeam,
    fixture.awayTeam,
    fixture.competition ?? "",
    fixture.league,
    fixture.date,
    fixture.time,
  ].join(" "));
}

const STATISTIC_MARKETS: { id: StatisticMarket; label: string; labelEn: string; description: string; descriptionEn: string }[] = [
  { id: "shots", label: "Tirs dans le match", labelEn: "Total shots", description: "Total des tirs des deux équipes", descriptionEn: "Combined shots from both teams" },
  { id: "cards", label: "Cartons dans le match", labelEn: "Match cards", description: "Total des cartons jaunes et rouges", descriptionEn: "Combined yellow and red cards" },
  { id: "corners", label: "Corners dans le match", labelEn: "Match corners", description: "Total des corners des deux équipes", descriptionEn: "Combined corners from both teams" },
  { id: "shots-on-target", label: "Tirs cadrés dans le match", labelEn: "Shots on target", description: "Total des tirs cadrés des deux équipes", descriptionEn: "Combined shots on target from both teams" },
  { id: "scorers", label: "Buteurs", labelEn: "Scorers", description: "Prédiction des buteurs probables dans les matchs", descriptionEn: "Prediction of likely scorers in matches" },
];
const STATISTIC_RISK_TARGETS: Record<RiskLevel, number> = {
  "very-safe": 80,
  safe: 70,
  medium: 60,
  bold: 50,
  "very-risky": 40,
};

const RISK_LEVELS: Record<RiskLevel, { label: string; labelEn: string; description: string; descriptionEn: string }> = {
  "very-safe": {
    label: "Très prudent",
    labelEn: "Very safe",
    description: "Double chance sur au moins 1 but avec les meilleurs historiques",
    descriptionEn: "Double chance with at least 1 goal, best historical rates",
  },
  "safe": {
    label: "Prudent",
    labelEn: "Safe",
    description: "Double chance et au moins 1 but",
    descriptionEn: "Double chance and at least 1 goal",
  },
  "medium": {
    label: "Moyen",
    labelEn: "Medium",
    description: "",
    descriptionEn: "",
  },
  "bold": {
    label: "Audacieux",
    labelEn: "Bold",
    description: "Vainqueur le plus fréquent et au moins 2 buts",
    descriptionEn: "Most frequent winner and at least 2 goals",
  },
  "very-risky": {
    label: "Risque très élevé",
    labelEn: "Very risky",
    description: "Vainqueur le plus fréquent et au moins 3 buts",
    descriptionEn: "Most frequent winner and at least 3 goals",
  },
};

function getLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export default function CombinationsPage() {
  const { isAuthenticated, isLoading: authLoading, entitlements, user, refreshEntitlements } = useAuth();
  const { language, text } = useLanguage();
  const [activeTab, setActiveTab] = useState<CombinationsTab>("fixtures");
  const [startDate, setStartDate] = useState(getLocalDate);
  const [endDate, setEndDate] = useState(() => addDays(getLocalDate(), DEFAULT_LOOKAHEAD_DAYS - 1));
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fixtureQuery, setFixtureQuery] = useState("");
  const [coupons, setCoupons] = useState<GeneratedCoupon[]>([]);
  const [safeCoupon, setSafeCoupon] = useState<GeneratedCoupon | null>(null);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  const [showRiskOptions, setShowRiskOptions] = useState(false);
  const [showAutoRiskOptions, setShowAutoRiskOptions] = useState(false);
  const [requestedCount, setRequestedCount] = useState(3);
  const [liveOnly, setLiveOnly] = useState(false);
  const [randomSelection, setRandomSelection] = useState(false);
  const [statisticMarket, setStatisticMarket] = useState<StatisticMarket>("shots");
  const [statisticCount, setStatisticCount] = useState(3);
  const [aiSetupStep, setAiSetupStep] = useState<1 | 2>(1);
  const [statisticCoupon, setStatisticCoupon] = useState<GeneratedStatisticCoupon | null>(null);
  const [scorerCoupon, setScorerCoupon] = useState<GeneratedScorerCoupon | null>(null);
  const [savedStatisticCombinations, setSavedStatisticCombinations] = useState<SavedStatisticCombination[]>([]);
  const [scorerSaveNotice, setScorerSaveNotice] = useState("");
  const [aiAnalyses, setAiAnalyses] = useState<LiveMatchAnalysis[]>([]);
  const [aiAnalysing, setAiAnalysing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [guestCombinationsUsed, setGuestCombinationsUsed] = useState(0);
  const [refreshKey, refreshNow] = useAutoRefresh();
  const guestCombinationsRemaining = Math.max(0, GUEST_COMBINATION_LIMIT - guestCombinationsUsed);
  const trialPhaseActive = isGlobalTrialPhaseActive();
  const canGenerateCombination = entitlements.canGenerate;
  const combinationLimitReached = !entitlements.canGenerate && !authLoading;
  const needsSignIn = !isAuthenticated && guestCombinationsRemaining === 0;
  const needsOffer = isAuthenticated && !entitlements.trialActive && !entitlements.hasCombinationAccess;
  const dailyLimitReached = entitlements.reason === "offer-daily-limit" || entitlements.reason === "trial-daily-limit";
  const hasPaidCombinationAccess = entitlements.offers.includes("combinations") || entitlements.offers.includes("pack");
  const needsOfferForTomorrow = !hasPaidCombinationAccess
    && (!entitlements.hasCombinationAccess || entitlements.reason === "trial-daily-limit");
  const remainingTodayLabel = Number.isFinite(entitlements.remainingToday)
    ? String(entitlements.remainingToday)
    : "∞";
  const suggestionCount = Number.isFinite(entitlements.remainingToday)
    ? Math.min(3, Math.max(0, entitlements.remainingToday))
    : 3;
  const couponFixtureIds = useMemo(
    () => Array.from(new Set([
      ...(safeCoupon?.matches.map(match => match.fixtureId) ?? []),
      ...coupons.flatMap(coupon => coupon.matches.map(match => match.fixtureId)),
    ])),
    [safeCoupon, coupons]
  );
  const { fixturesById: refreshedCouponFixtures } = useFixtureStatuses(couponFixtureIds);

  useEffect(() => {
    const loadGuestCombinationCount = () => {
      try {
        const stored = localStorage.getItem(GUEST_COMBINATION_COUNT_KEY);
        if (typeof window === "undefined" || typeof localStorage === "undefined") {
          setGuestCombinationsUsed(0);
          return;
        }
        if (stored === null) {
          setGuestCombinationsUsed(0);
          return;
        }
        const count = Number(stored);
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error("The stored guest combination count is invalid.");
        }
        setGuestCombinationsUsed(count);
      } catch (error) {
        console.error("Could not read the guest combination count.", error);
        setActionError(text(
          "Impossible de lire votre quota de combinaisons gratuites.",
          "Unable to read your free combination quota."
        ));
      }
    };
    loadGuestCombinationCount();
    window.addEventListener("storage", loadGuestCombinationCount);
    return () => window.removeEventListener("storage", loadGuestCombinationCount);
  }, [text]);

  useEffect(() => {
    try {
      setSavedStatisticCombinations(readSavedStatisticCombinations());
    } catch (error) {
      console.error("Could not read saved statistics combinations.", error);
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de lire les combinaisons enregistrées.", "Unable to read saved combinations."));
    }
  }, [text]);

  const requireGuestCombinationQuota = () => {
    if (authLoading) {
      setActionError(text("Vérification de votre session…", "Checking your session…"));
      return 0;
    }
    if (!entitlements.canGenerate) {
      setActionError(entitlements.reason === "no-offer" && !isAuthenticated
        ? text(
          `Vous avez utilisé vos ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous pour continuer.`,
          `You have used your ${GUEST_COMBINATION_LIMIT} free combinations. Sign in to continue.`
        )
        : text(
          "Votre quota de combinaisons du jour est épuisé. Passez à une offre pour continuer.",
          "Your daily combination quota is used up. Get a plan to continue."
        ));
      return 0;
    }
    return Number.isFinite(entitlements.remainingToday)
      ? entitlements.remainingToday
      : Number.POSITIVE_INFINITY;
  };

  /**
   * Enregistre `count` générations dans le quota courant (invité, essai ou offre).
   * Renvoie false quand le quota est insuffisant.
   */
  const recordGuestCombinations = (count: number): boolean => {
    if (count <= 0) return true;
    const result = recordCombinationUsage({
      accountId: user?.id ?? "guest",
      isAuthenticated,
      role: user?.role,
      guestRemaining: guestCombinationsRemaining,
    }, count);
    if (!isAuthenticated) setGuestCombinationsUsed(current => current + result.accepted);
    return result.accepted >= count;
  };

  /**
   * Synchronise l'affichage avec le quota calculé par le serveur après une
   * génération (le serveur est la source de vérité).
   */
  const applyServerEntitlements = (payload: { entitlements?: ServerEntitlements }) => {
    if (!payload.entitlements) return;
    setGuestCombinationsUsed(payload.entitlements.usedToday);
    if (isAuthenticated) void refreshEntitlements();
  };

  /** Traduit un refus de quota renvoyé par le serveur (HTTP 402). */
  const quotaErrorMessage = (payload: { error?: string; code?: string }): string => {
    if (payload.code === "guest-limit-reached") {
      return text(
        `Vous avez utilisé vos ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous pour continuer.`,
        `You have used your ${GUEST_COMBINATION_LIMIT} free combinations. Sign in to continue.`
      );
    }
    return payload.error || text(
      "Votre quota de combinaisons du jour est épuisé. Choisissez une offre pour continuer.",
      "Your daily combination quota is used up. Choose a plan to continue."
    );
  };

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: startDate,
      to: endDate,
      sport: "football",
    });

    const loadFixtures = async () => {
      setLoading(true);
      try {
        const [upcomingResponse, liveResponse] = await Promise.all([
          fetch(`/api/sports/fixtures?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch("/api/sports/fixtures/live", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        const upcomingPayload = await upcomingResponse.json() as FixtureResponse & { error?: string };
        const livePayload = await liveResponse.json() as FixtureResponse & { error?: string };

        if (!upcomingResponse.ok || !Array.isArray(upcomingPayload.fixtures)) {
          throw new Error(upcomingPayload.error || "Unable to load upcoming fixtures.");
        }
        if (!liveResponse.ok || !Array.isArray(livePayload.fixtures)) {
          throw new Error(livePayload.error || "Unable to load live fixtures.");
        }

        const upcoming = upcomingPayload.fixtures
          .filter(fixture =>
            fixture.status?.trim().toLocaleLowerCase("fr-FR") === "prévu" &&
            fixture.date >= getLocalDate()
          )
          .sort((first, second) =>
            `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
          );

        const live = livePayload.fixtures
          .filter(fixture => isLiveFixtureStatus(fixture.status))
          .sort((first, second) =>
            `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
          );

        const allFixtures = [...live, ...upcoming];
        const uniqueFixtures = Array.from(new Map(allFixtures.map(fixture => [fixture.id, fixture])).values());
        setFixtures(uniqueFixtures);
        setSelectedIds(current => current.filter(id => uniqueFixtures.some(fixture => fixture.id === id)));
        setCurrentPage(page => Math.min(page, Math.max(1, Math.ceil(uniqueFixtures.length / PAGE_SIZE))));
        setLoadError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load fixtures.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadFixtures();
    return () => controller.abort();
  }, [startDate, endDate, refreshKey]);

  const selectedFixtures = useMemo(
    () => selectedIds
      .map(id => fixtures.find(fixture => fixture.id === id))
      .filter((fixture): fixture is Fixture => fixture !== undefined),
    [fixtures, selectedIds]
  );
  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const relevantFixtures = liveOnly
    ? fixtures.filter(fixture => isLiveFixtureStatus(fixture.status))
    : fixtures;
  const normalizedFixtureQuery = normalizeSearchText(fixtureQuery);
  const searchedFixtures = normalizedFixtureQuery
    ? fixtures.filter(fixture => fixtureSearchText(fixture).includes(normalizedFixtureQuery))
    : fixtures;
  const totalPages = Math.max(1, Math.ceil(searchedFixtures.length / PAGE_SIZE));
  const visibleFixtures = searchedFixtures.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const fixturesForCombination = selectedFixtures.length > 0
    ? selectedFixtures
    : relevantFixtures.slice(0, requestedCount);

  const clearGeneratedOutputs = () => {
    setActionError("");
    setActionNotice("");
    setCoupons([]);
    setSafeCoupon(null);
  };

  const toggleFixture = (fixtureId: string) => {
    clearGeneratedOutputs();
    setSelectedIds(current => {
      if (current.includes(fixtureId)) {
        return current.filter(id => id !== fixtureId);
      }
      if (current.length >= MAX_FIXTURES) {
        setActionError(text(
          `Choisissez au maximum ${MAX_FIXTURES} rencontres par combinaison.`,
          `Choose no more than ${MAX_FIXTURES} fixtures per combination.`
        ));
        return current;
      }
      return [...current, fixtureId];
    });
  };

  const selectAllVisibleFixtures = () => {
    clearGeneratedOutputs();
    setSelectedIds(current => {
      const room = MAX_FIXTURES - current.length;
      if (room <= 0) {
        setActionError(text(
          `Choisissez au maximum ${MAX_FIXTURES} rencontres par combinaison.`,
          `Choose no more than ${MAX_FIXTURES} fixtures per combination.`
        ));
        return current;
      }
      const additions = visibleFixtures
        .map(fixture => fixture.id)
        .filter(id => !current.includes(id))
        .slice(0, room);
      return [...current, ...additions];
    });
  };

  const generateCombinations = async (regenerate = false, couponCount = 3, selectedRiskLevel = riskLevel) => {
    if (fixturesForCombination.length === 0) return;
    const remaining = requireGuestCombinationQuota();
    if (remaining === 0) return;
    const requestedCoupons = Math.min(couponCount, remaining);
    setGenerating(true);
    setShowRiskOptions(false);
    setActionError("");
    if (!regenerate) setCoupons([]);

    try {
      const response = await postJson("/api/coupons/suggest", {
        fixtureIds: fixturesForCombination.map(fixture => fixture.id),
        riskLevel: selectedRiskLevel,
        regenerate,
        couponCount: requestedCoupons,
      });
      const payload = await response.json() as { coupons?: GeneratedCoupon[]; error?: string; code?: string; entitlements?: ServerEntitlements };
      if (response.status === 402) {
        throw new Error(quotaErrorMessage(payload));
      }
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de proposer les combinaisons.", "Unable to suggest combinations."));
      }
      if (!Array.isArray(payload.coupons) || payload.coupons.length === 0) {
        throw new Error(text("Le service a renvoyé une réponse invalide.", "The service returned an invalid response."));
      }
      const distinctCoupons = uniqueGeneratedCoupons(payload.coupons).slice(0, requestedCoupons);
      if (distinctCoupons.length === 0) {
        throw new Error(text("Le service n’a proposé aucune nouvelle combinaison.", "The service did not suggest any new combinations."));
      }
      setCoupons(distinctCoupons);
      recordGuestCombinations(distinctCoupons.length);
      applyServerEntitlements(payload);
      setActionNotice("");    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de proposer les combinaisons.", "Unable to suggest combinations."));
    } finally {
      setGenerating(false);
    }
  };

  /** Analyse IA (moteur expert local) des matchs en direct sélectionnés. */
  const analyseLiveWithAI = async () => {
    const liveIds = fixturesForCombination
      .filter(fixture => isLiveFixtureStatus(fixture.status))
      .map(fixture => fixture.id)
      .slice(0, 8);
    if (liveIds.length === 0) {
      setAiAnalyses([]);
      setAiError(text(
        "Sélectionnez au moins un match en direct pour lancer l'analyse IA.",
        "Select at least one live match to start the AI analysis."
      ));
      return;
    }
    setAiAnalysing(true);
    setAiError("");
    try {
      const response = await postJson("/api/live/analysis", { fixtureIds: liveIds });
      const payload = await response.json() as { analyses?: LiveMatchAnalysis[]; error?: string };
      if (!response.ok || !Array.isArray(payload.analyses) || payload.analyses.length === 0) {
        throw new Error(payload.error || text(
          "Analyse impossible pour le moment.",
          "Analysis unavailable right now."
        ));
      }
      setAiAnalyses(payload.analyses);
    } catch (error) {
      setAiError(error instanceof Error
        ? error.message
        : text("Analyse impossible pour le moment.", "Analysis unavailable right now."));
    } finally {
      setAiAnalysing(false);
    }
  };

  const generateAutoCombination = async (selectedRiskLevel = riskLevel, excludeFixtureIds: string[] = []) => {
    const remainingQuota = requireGuestCombinationQuota();
    if (remainingQuota === 0) return;
    setGenerating(true);
    setActionError("");
    setCoupons([]);
    try {
      const response = await postJson("/api/coupons/suggest", {
        mode: "auto",
        from: startDate,
        to: endDate,
        count: requestedCount,
        riskLevel: selectedRiskLevel,
        excludeFixtureIds,
        includeLive: false,
        randomSelection,
      });
      const payload = await response.json() as { coupon?: GeneratedCoupon; error?: string; code?: string; entitlements?: ServerEntitlements };
      if (response.status === 402) {
        throw new Error(quotaErrorMessage(payload));
      }
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de proposer cette combinaison.", "Unable to suggest this combination."));
      }
      if (
        !payload.coupon ||
        !Array.isArray(payload.coupon.matches) ||
        payload.coupon.matches.length !== requestedCount
      ) {
        throw new Error(text("Le service a renvoyé une combinaison invalide.", "The service returned an invalid combination."));
      }
      setRiskLevel(selectedRiskLevel);
      setSafeCoupon(payload.coupon);
      recordGuestCombinations(1);
      applyServerEntitlements(payload);
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
          : text("Impossible de proposer cette combinaison.", "Unable to suggest this combination."));
    } finally {
      setGenerating(false);
    }
  };

  const generateStatisticCombination = async (
    selectedRiskLevel = riskLevel,
    excludeFixtureIds: string[] = []
  ) => {
    const remaining = requireGuestCombinationQuota();
    if (remaining === 0) return;
    setGenerating(true);
    setActionError("");
    try {
      if (statisticMarket === "scorers") {
        await generateScorerCombination(excludeFixtureIds);
        return;
      }

      const response = await postJson("/api/coupons/suggest", {
        mode: "statistic",
        from: startDate,
        to: endDate,
        count: statisticCount,
        riskLevel: selectedRiskLevel,
        market: statisticMarket,
        excludeFixtureIds,
        includeLive: liveOnly,
        randomSelection,
      });
      const payload = await response.json() as { coupon?: GeneratedStatisticCoupon; error?: string; code?: string; entitlements?: ServerEntitlements };
      if (response.status === 402) {
        throw new Error(quotaErrorMessage(payload));
      }
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de générer cette combinaison statistique.", "Unable to generate this statistics combination."));
      }
      if (!payload.coupon || !Array.isArray(payload.coupon.matches) || payload.coupon.matches.length !== statisticCount) {
        throw new Error(text("Le service a renvoyé une combinaison invalide.", "The service returned an invalid combination."));
      }
      setRiskLevel(selectedRiskLevel);
      setStatisticCoupon(payload.coupon);
      recordGuestCombinations(1);
      applyServerEntitlements(payload);
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de générer cette combinaison statistique.", "Unable to generate this statistics combination."));
    } finally {
      setGenerating(false);
    }
  };

  const generateScorerCombination = async (
    excludeFixtureIds: string[] = []
  ) => {
    const remainingQuota = requireGuestCombinationQuota();
    if (remainingQuota === 0) return;
    setGenerating(true);
    setActionError("");
    try {
      const response = await postJson("/api/coupons/suggest", {
        mode: "scorer",
        from: startDate,
        to: endDate,
        count: statisticCount,
        excludeFixtureIds,
        includeLive: liveOnly,
        randomSelection,
      });
      const payload = await response.json() as { coupon?: GeneratedScorerCoupon; error?: string; code?: string; entitlements?: ServerEntitlements };
      if (response.status === 402) {
        throw new Error(quotaErrorMessage(payload));
      }
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de générer cette combinaison de buteurs.", "Unable to generate this scorer combination."));
      }
      if (!payload.coupon || !Array.isArray(payload.coupon.matches) || payload.coupon.matches.length === 0) {
        throw new Error(text("Le service a renvoyé une combinaison invalide.", "The service returned an invalid combination."));
      }
      setScorerCoupon(payload.coupon);
      recordGuestCombinations(1);
      applyServerEntitlements(payload);
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de générer cette combinaison de buteurs.", "Unable to generate this scorer combination."));
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Convertit une combinaison de buteurs en combinaison standard afin de la
   * ranger dans le panier (onglet « Déjà générées »), comme les autres
   * combinaisons. Aucune probabilité n'est fournie : le taux reste indéfini.
   */
  const scorerCouponToGeneratedCoupon = (coupon: GeneratedScorerCoupon): GeneratedCoupon => ({
    level: "medium",
    title: coupon.title,
    description: [
      coupon.description,
      ...coupon.matches.map(match =>
        `${match.homeTeam} — ${match.homeScorer?.name ?? text("Aucun buteur", "No scorer")} · ` +
        `${match.awayTeam} — ${match.awayScorer?.name ?? text("Aucun buteur", "No scorer")}`
      ),
    ].join(" · "),
    matches: coupon.matches.map(match => ({
      fixtureId: match.fixtureId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      picks: [
        ...(match.homeScorer
          ? [{
            market: "scorer" as const,
            selection: "home-scorer" as const,
            historicalRate: null,
            sampleSize: 0,
            playerName: match.homeScorer.name,
            ...(match.homeScorer.imageUrl ? { playerImageUrl: match.homeScorer.imageUrl } : {}),
          }]
          : []),
        ...(match.awayScorer
          ? [{
            market: "scorer" as const,
            selection: "away-scorer" as const,
            historicalRate: null,
            sampleSize: 0,
            playerName: match.awayScorer.name,
            ...(match.awayScorer.imageUrl ? { playerImageUrl: match.awayScorer.imageUrl } : {}),
          }]
          : []),
      ],
    })),
  });

  const saveScorerCombination = () => {
    setActionError("");
    setActionNotice("");
    setScorerSaveNotice("");
    if (!scorerCoupon) return;
    try {
      // 1. Enregistrement local de la combinaison statistique (historique de l'appareil).
      const saved = readSavedStatisticCombinations();
      const newSaved: SavedStatisticCombination = {
        id: generateUUID(),
        createdAt: new Date().toISOString(),
        coupon: {
          ...scorerCoupon,
          matches: scorerCoupon.matches.map(match => ({
            fixtureId: match.fixtureId,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            market: "scorers" as StatisticMarket,
            selection: "over" as const,
            line: 0.5,
            historicalRate: 70,
            sampleSize: 100,
          })),
          estimatedCombinedRate: 70,
          riskLevel: "medium",
        },
      };
      writeSavedStatisticCombinations([...saved, newSaved]);
      setSavedStatisticCombinations([...saved, newSaved]);

      // 2. Ajout au panier, onglet « Déjà générées ».
      const fixturesById = new Map(fixtures.map(fixture => [fixture.id, fixture]));
      const matchedFixtures = scorerCoupon.matches
        .map(match => fixturesById.get(match.fixtureId))
        .filter((fixture): fixture is Fixture => fixture !== undefined);
      if (matchedFixtures.length === 0) {
        throw new Error(text(
          "Les rencontres de cette combinaison ne sont plus disponibles.",
          "This combination's fixtures are no longer available."
        ));
      }
      const generatedCoupon = scorerCouponToGeneratedCoupon(scorerCoupon);
      const stored = readGeneratedCombinations();
      const duplicate = stored.some(combination => JSON.stringify(combination.coupon) === JSON.stringify(generatedCoupon));
      if (!duplicate) {
        writeGeneratedCombinations([
          ...stored,
          {
            id: generateUUID(),
            createdAt: new Date().toISOString(),
            coupon: generatedCoupon,
            fixtures: matchedFixtures,
          },
        ]);
      }
      setScorerSaveNotice(duplicate
        ? text(
          "Cette combinaison figure déjà dans le panier (onglet « Déjà générées »).",
          "This combination is already in your basket (“Already generated” tab)."
        )
        : text(
          "Combinaison ajoutée au panier (onglet « Déjà générées »).",
          "Combination added to your basket (“Already generated” tab)."
        ));
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible d'enregistrer la combinaison.", "Unable to save combination."));
    }
  };

  const addFixturesToBasket = (fixturesToAdd: Fixture[]) => {
    setActionError("");
    try {
      const basket = readFixtureBasket();
      const newFixtures = fixturesToAdd.filter(fixture => !basket.some(item => item.id === fixture.id));
      if (basket.length + newFixtures.length > MAX_FIXTURES) {
        setActionError(text(
          `Votre panier ne peut pas dépasser ${MAX_FIXTURES} rencontres. Retirez-en avant d’ajouter cette sélection.`,
          `Your basket can contain at most ${MAX_FIXTURES} fixtures. Remove some before adding this selection.`
        ));
        return;
      }
      writeFixtureBasket([...basket, ...newFixtures]);
      setActionError(text("Les rencontres ont été ajoutées à votre panier.", "Fixtures were added to your basket."));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : text("Impossible de modifier le panier.", "Unable to update the basket."));
    }
  };

  const saveCouponsForTracking = (couponsToSave: GeneratedCoupon[]): { success: boolean; wasDuplicate: boolean } => {
    try {
      const stored = readGeneratedCombinations();
      console.log("📦 Combinations actuelles dans localStorage:", stored.length);
      const additions = couponsToSave
        .map(coupon => {
          const fixturesById = new Map<string, Fixture>([
            ...fixtures.map(fixture => [fixture.id, fixture] as const),
            ...Object.entries(refreshedCouponFixtures),
          ]);
          const matchedFixtures = coupon.matches
            .map(match => fixturesById.get(match.fixtureId))
            .filter((fixture): fixture is Fixture => fixture !== undefined);
          if (matchedFixtures.length !== coupon.matches.length) {
            throw new Error(text(
              "Impossible d’enregistrer le suivi : certains matchs ne sont plus disponibles.",
              "Unable to save tracking: some fixtures are no longer available."
            ));
          }
          return {
            id: generateUUID(),
            createdAt: new Date().toISOString(),
            coupon,
            fixtures: matchedFixtures,
          };
        })
        .filter(candidate => {
          const signature = JSON.stringify(
            candidate.coupon.matches
              .map(match => ({
                fixtureId: match.fixtureId,
                picks: match.picks
                  .map(pick => ({ market: pick.market, selection: pick.selection }))
                  .sort((first, second) =>
                    `${first.market}:${first.selection}`.localeCompare(`${second.market}:${second.selection}`)
                  ),
              }))
              .sort((first, second) => first.fixtureId.localeCompare(second.fixtureId))
          );
          return !stored.some(combination => {
            const existingSignature = JSON.stringify(
              combination.coupon.matches
                .map(match => ({
                  fixtureId: match.fixtureId,
                  picks: match.picks
                    .map(pick => ({ market: pick.market, selection: pick.selection }))
                    .sort((first, second) =>
                      `${first.market}:${first.selection}`.localeCompare(`${second.market}:${second.selection}`)
                    ),
                }))
                .sort((first, second) => first.fixtureId.localeCompare(second.fixtureId))
            );
            return existingSignature === signature;
          });
        });

      console.log("➕ Nouvelles combinaisons à ajouter:", additions.length);
      if (additions.length > 0) {
        writeGeneratedCombinations([...stored, ...additions]);
        const savedIds = new Set(readGeneratedCombinations().map(combination => combination.id));
        if (additions.some(combination => !savedIds.has(combination.id))) {
          throw new Error(text(
            "La combinaison n’a pas pu être confirmée dans le panier. Réessayez.",
            "The combination could not be confirmed in the basket. Please try again."
          ));
        }
        console.log("✅ Écriture réussie dans localStorage");
      } else {
        console.log("⚠️ Aucune nouvelle combinaison (doublon)");
      }
      return { success: true, wasDuplicate: additions.length === 0 };
    } catch (error) {
      console.error("❌ Erreur lors de l'enregistrement:", error);
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible d’enregistrer le suivi des coupons.", "Unable to save coupon tracking."));
      return { success: false, wasDuplicate: false };
    }
  };

  const addGeneratedCombinationToBasket = (coupon: GeneratedCoupon) => {
    setActionError("");
    setActionNotice("");
    const result = saveCouponsForTracking([coupon]);
    if (result.success) {
      if (result.wasDuplicate) {
        setActionNotice(text("Cette combinaison est déjà enregistrée dans le panier.", "This combination is already saved in your basket."));
      } else {
        setActionNotice(text("Cette combinaison est enregistrée et son résultat est suivi dans le panier.", "This combination is saved and its result is tracked in your basket."));
      }
    }
  };

  const removeCouponMatch = (couponIndex: number, fixtureId: string) => {
    setCoupons(current => current.map((coupon, index) => {
      if (index !== couponIndex || coupon.matches.length <= 1) return coupon;
      const matches = coupon.matches.filter(match => match.fixtureId !== fixtureId);
      const pickRates = matches.map(match => {
        const rates = match.picks.map(pick => pick.historicalRate).filter((rate): rate is number => rate !== null);
        return rates.length > 0 ? rates.reduce((rate, next) => rate * next / 100, 100) : 0;
      });
      const estimatedCombinedRate = coupon.estimatedCombinedRate === undefined
        ? undefined
        : Number(pickRates.reduce((rate, next) => rate * next / 100, 100).toFixed(2));
      return { ...coupon, matches, ...(estimatedCombinedRate === undefined ? {} : { estimatedCombinedRate }) };
    }));
    setActionError("");
    setActionNotice(text("La rencontre a été retirée de la combinaison.", "Fixture removed from the combination."));
  };

  const removeSafeCouponMatch = (fixtureId: string) => {
    setSafeCoupon(current => current && current.matches.length > 1
      ? (() => {
        const matches = current.matches.filter(match => match.fixtureId !== fixtureId);
        const pickRates = matches.map(match => {
          const rates = match.picks.map(pick => pick.historicalRate).filter((rate): rate is number => rate !== null);
          return rates.length > 0 ? rates.reduce((rate, next) => rate * next / 100, 100) : 0;
        });
        const estimatedCombinedRate = current.estimatedCombinedRate === undefined
          ? undefined
          : Number(pickRates.reduce((rate, next) => rate * next / 100, 100).toFixed(2));
        return { ...current, matches, ...(estimatedCombinedRate === undefined ? {} : { estimatedCombinedRate }) };
      })()
      : current);
    setActionError("");
    setActionNotice(text("La rencontre a été retirée de la combinaison.", "Fixture removed from the combination."));
  };

  const removeStatisticMatch = (fixtureId: string) => {
    setStatisticCoupon(current => current && current.matches.length > 1
      ? (() => {
        const matches = current.matches.filter(match => match.fixtureId !== fixtureId);
        return {
          ...current,
          matches,
          estimatedCombinedRate: Number(matches.reduce((rate, match) => rate * match.historicalRate / 100, 100).toFixed(2)),
        };
      })()
      : current);
    setActionError("");
    setActionNotice(text("La rencontre a été retirée de la combinaison.", "Fixture removed from the combination."));
  };

  const formatGeneratedCoupon = (coupon: GeneratedCoupon) => [
    coupon.title,
    coupon.description,
    "",
    ...coupon.matches.flatMap(match => [
      `${match.homeTeam} — ${match.awayTeam}`,
      ...match.picks.map(pick => `  - ${pickLabel(pick)}`),
      "",
    ]),
  ].join("\n");

  const formatStatisticCoupon = (coupon: GeneratedStatisticCoupon) => [
    coupon.title,
    coupon.description,
    `${text("Estimation combinée indicative", "Indicative combined estimate")}: ${coupon.estimatedCombinedRate}%`,
    "",
    ...coupon.matches.flatMap(match => {
      const market = STATISTIC_MARKETS.find(option => option.id === match.market);
      const direction = match.selection === "over" ? text("Plus de", "Over") : text("Moins de", "Under");
      const line = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(match.line);
      return [
        `${match.homeTeam} — ${match.awayTeam}`,
        `  - ${text(market?.label ?? match.market, market?.labelEn ?? match.market)}: ${direction} ${line}`,
        `  - ${match.historicalRate}% ${text("sur", "across")} ${match.sampleSize} ${text("match(s) historique(s)", "historical match(es)")}`,
        "",
      ];
    }),
  ].join("\n");

  const getCouponPickOutcome = (coupon: GeneratedCoupon, fixtureId: string, pick: CouponPick): CouponOutcome => {
    const fixture = refreshedCouponFixtures[fixtureId] ?? fixtures.find(item => item.id === fixtureId);
    if (!fixture) return "unavailable";
    const score = parseFixtureScore(fixture);
    const result = settleCouponPick(pick, score, fixture);
    return result === null
      ? isFixtureFinished(fixture) ? "unavailable" : "pending"
      : result ? "won" : "lost";
  };
  const getCouponPickStatuses = (coupon: GeneratedCoupon) => Object.fromEntries(
    coupon.matches.flatMap(match => match.picks.map(pick => [
      `${match.homeTeam} — ${match.awayTeam}::${pickLabel(pick)}`,
      getCouponPickOutcome(coupon, match.fixtureId, pick),
    ]))
  );
  const exportCombination = (
    title: string,
    content: string,
    matchStatuses?: Record<string, CouponOutcome>,
    pickStatuses?: Record<string, CouponOutcome>
  ) => {
    try {
      exportCombinationPdf(title, content, language, matchStatuses, pickStatuses);
      setActionError("");
      setActionNotice(text(
        "Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.",
        "Choose “Save as PDF” in the print window."
      ));
    } catch (error) {
      console.error("Could not export combination.", error);
      setActionError(text("Impossible d’exporter cette combinaison.", "Unable to export this combination."));
    }
  };

  const shareCombination = async (title: string, content: string) => {
    setActionError("");
    setActionNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ title, text: content });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setActionNotice(text("La combinaison a été copiée pour être partagée.", "Combination copied and ready to share."));
      } else {
        throw new Error("Sharing and clipboard access are unavailable.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Could not share combination.", error);
      setActionError(text("Impossible de partager cette combinaison. Essayez de l’exporter.", "Unable to share this combination. Try exporting it."));
    }
  };

  const saveStatisticCombination = (coupon: GeneratedStatisticCoupon) => {
    try {
      const saved = readSavedStatisticCombinations();
      const signature = JSON.stringify(coupon.matches.map(match => [
        match.fixtureId,
        match.market,
        match.selection,
        match.line,
      ]));
      const alreadySaved = saved.some(item =>
        JSON.stringify(item.coupon.matches.map(match => [
          match.fixtureId,
          match.market,
          match.selection,
          match.line,
        ])) === signature
      );
      if (alreadySaved) {
        setActionNotice(text("Cette combinaison est déjà enregistrée sur cet appareil.", "This combination is already saved on this device."));
        setActionError("");
        return;
      }
      const next = [
        ...saved,
        { id: generateUUID(), createdAt: new Date().toISOString(), coupon },
      ];
      writeSavedStatisticCombinations(next);
      setSavedStatisticCombinations(next);
      setActionError("");
      setActionNotice(text("La combinaison a été enregistrée sur cet appareil.", "Combination saved on this device."));
    } catch (error) {
      console.error("Could not save statistics combination.", error);
      setActionNotice("");
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible d’enregistrer cette combinaison.", "Unable to save this combination."));
    }
  };

  const removeSavedStatisticCombination = (id: string) => {
    try {
      const next = savedStatisticCombinations.filter(item => item.id !== id);
      writeSavedStatisticCombinations(next);
      setSavedStatisticCombinations(next);
      setActionError("");
      setActionNotice(text("La combinaison enregistrée a été supprimée.", "Saved combination removed."));
    } catch (error) {
      console.error("Could not remove saved statistics combination.", error);
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de supprimer cette combinaison.", "Unable to remove this combination."));
    }
  };

  const renderCombinationActions = (
    title: string,
    content: string,
    matchStatuses?: Record<string, CouponOutcome>,
    pickStatuses?: Record<string, CouponOutcome>
  ) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => exportCombination(title, content, matchStatuses, pickStatuses)}
        className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-green-600 hover:text-white"
      >
        {text("Exporter en PDF", "Export as PDF")}
      </button>
      <button
        type="button"
        onClick={() => void shareCombination(title, content)}
        className="rounded-lg border border-green-700 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-950/50"
      >
        {text("Partager", "Share")}
      </button>
    </div>
  );

  const pickLabel = (pick: CouponPick) => {
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
      "home+2.5": text("Domicile +2.5", "Home +2.5"),
      "away+2.5": text("Extérieur +2.5", "Away +2.5"),
      "home-over-0.5": text("Domicile plus de 0,5 but", "Home over 0.5 goals"),
      "home-over-1.5": text("Domicile plus de 1,5 but", "Home over 1.5 goals"),
      "home-over-2.5": text("Domicile plus de 2,5 buts", "Home over 2.5 goals"),
      "away-over-0.5": text("Extérieur plus de 0,5 but", "Away over 0.5 goals"),
      "away-over-1.5": text("Extérieur plus de 1,5 but", "Away over 1.5 goals"),
      "away-over-2.5": text("Extérieur plus de 2,5 buts", "Away over 2.5 goals"),
      "home-under-0.5": text("Domicile moins de 0,5 but", "Home under 0.5 goals"),
      "home-under-1.5": text("Domicile moins de 1,5 but", "Home under 1.5 goals"),
      "home-under-2.5": text("Domicile moins de 2,5 buts", "Home under 2.5 goals"),
      "away-under-0.5": text("Extérieur moins de 0,5 but", "Away under 0.5 goals"),
      "away-under-1.5": text("Extérieur moins de 1,5 but", "Away under 1.5 goals"),
      "away-under-2.5": text("Extérieur moins de 2,5 buts", "Away under 2.5 goals"),
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
    const label = labels[pick.selection];
    return pick.market === "scorer" && pick.playerName
      ? `${label} : ${pick.playerName}`
      : label;
  };

  const couponMatchOutcome = (coupon: GeneratedCoupon, fixtureId: string): CouponOutcome => {
    const match = coupon.matches.find(item => item.fixtureId === fixtureId);
    if (!match) return "unavailable";
    return settleCouponMatch(
      match,
      refreshedCouponFixtures[fixtureId] ?? fixtures.find(fixture => fixture.id === fixtureId)
    );
  };
  const outcomeLabel = (outcome: CouponOutcome) => ({
    pending: text("En attente", "Pending"),
    won: text("Gagné", "Won"),
    lost: text("Perdu", "Lost"),
    unavailable: text("Résultat indisponible", "Result unavailable"),
  })[outcome];
  const outcomeStyle = (outcome: CouponOutcome) => ({
    pending: "border-amber-700 bg-amber-950/50 text-amber-200",
    won: "border-green-700 bg-green-950/50 text-green-200",
    lost: "border-red-800 bg-red-950/50 text-red-200",
    unavailable: "border-gray-700 bg-gray-800 text-gray-300",
  })[outcome];
  const outcomeIcon = (outcome: CouponOutcome) => ({
    pending: "◷",
    won: "✓",
    lost: "✕",
    unavailable: "?",
  })[outcome];
  const renderMatchOutcome = (coupon: GeneratedCoupon, fixtureId: string) => {
    const outcome = couponMatchOutcome(coupon, fixtureId);
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeStyle(outcome)}`}>
        <span aria-hidden="true">{outcomeIcon(outcome)}</span>
        {outcomeLabel(outcome)}
      </span>
    );
  };
  const renderPickOutcome = (coupon: GeneratedCoupon, fixtureId: string, pick: CouponPick) => {
    const outcome = getCouponPickOutcome(coupon, fixtureId, pick);
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeStyle(outcome)}`}>
        <span aria-hidden="true">{outcomeIcon(outcome)}</span>
        {outcomeLabel(outcome)}
      </span>
    );
  };

  return (
    <main className="feature-page page-combinations min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="feature-page-content mx-auto max-w-6xl">
        {(actionError || actionNotice) && (
          <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            actionError ? "border-red-800 bg-red-950/40 text-red-200" : "border-green-800 bg-green-950/30 text-green-200"
          }`} role={actionError ? "alert" : "status"}>
            {actionError || actionNotice}
            {!actionError && actionNotice === text(
              "Cette combinaison est enregistrée et son résultat est suivi dans le panier.",
              "This combination is saved and its result is tracked in your basket."
            ) && (
              <Link href="/basket" className="ml-2 inline-flex font-semibold underline underline-offset-2 hover:text-white">
                {text("Ouvrir le panier", "Open basket")}
              </Link>
            )}
          </p>
        )}
        <header className="page-intro combinations-hero mb-5">
          <div>
            <p className="combinations-eyebrow">{text("VOTRE ESPACE DE PRONOSTICS", "YOUR PREDICTION WORKSPACE")}</p>
            <h1 className="text-3xl font-bold text-white">
              {activeTab === "ai" ? text("Construire une combinaison", "Build a combination") : text("Combinaisons à venir", "Upcoming combinations")}
            </h1>
            <p className="mt-2 max-w-3xl text-gray-400">
              {activeTab === "ai"
                ? text(
                  "Laissez le moteur statistique composer des sélections selon un marché et un niveau de risque.",
                  "Let the statistics engine build picks based on a market and risk level."
                )
                : text(
                  `Sélectionnez des rencontres ou demandez ${suggestionCount} propositions fondées sur les historiques disponibles.`,
                  `Select fixtures or request ${suggestionCount} suggestions based on available history.`
                )}
            </p>
          </div>
          {!authLoading && (
            <div className="combinations-quota">
              <span>{text("Générations disponibles", "Generations available")}</span>
              <strong>
                {trialPhaseActive
                  ? "∞"
                  : isAuthenticated
                    ? entitlements.canGenerate
                      ? Number.isFinite(entitlements.remainingToday) ? entitlements.remainingToday : "∞"
                      : "0"
                    : guestCombinationsRemaining}
              </strong>
              <span>{trialPhaseActive
                ? text("phase d’essai", "trial phase")
                : isAuthenticated
                  ? text("aujourd’hui", "today")
                  : text("gratuites", "free")}</span>
            </div>
          )}
          {!authLoading && (
            <p className="combinations-plan-note mt-3 text-xs text-gray-400">
              {trialPhaseActive
                ? text(
                  `Phase d'essai en cours (jusqu'au ${GLOBAL_TRIAL_PHASE_END_DAY.split("-").reverse().join("/")}) : combinaisons illimitées.${!isAuthenticated ? " Connectez-vous pour regarder les vidéos en direct." : ""}`,
                  `Free trial phase running until ${GLOBAL_TRIAL_PHASE_END_DAY}: unlimited combinations.${!isAuthenticated ? " Sign in to watch live videos." : ""}`
                )
                : entitlements.trialActive
                ? text(
                  `Essai gratuit : ${entitlements.trialDaysLeft} jour(s) restant(s) · ${entitlements.usedToday}/${entitlements.dailyLimit} combinaisons utilisées aujourd'hui${entitlements.offers.some(item => item === "combinations" || item === "pack") ? " (essai + offre souscrite)" : ""}.`,
                  `Free trial: ${entitlements.trialDaysLeft} day(s) left · ${entitlements.usedToday}/${entitlements.dailyLimit} combinations used today${entitlements.offers.some(item => item === "combinations" || item === "pack") ? " (trial + subscribed plan)" : ""}.`
                )
                : entitlements.hasCombinationAccess
                  ? text(
                    `Offre Combinaisons · ${entitlements.usedToday}/${entitlements.dailyLimit} utilisées aujourd'hui.`,
                    `Combinations plan · ${entitlements.usedToday}/${entitlements.dailyLimit} used today.`
                  )
                  : !isAuthenticated
                    ? text(
                      `Sans compte : ${guestCombinationsRemaining}/${GUEST_COMBINATION_LIMIT} combinaison(s) gratuite(s) restante(s).`,
                      `Without an account: ${guestCombinationsRemaining}/${GUEST_COMBINATION_LIMIT} free combination(s) left.`
                    )
                    : text("Aucune offre active.", "No active plan.")}
            </p>
          )}
        </header>

        <div className="combinations-mode-tabs mb-5 grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2" role="tablist" aria-label={text("Mode de combinaison", "Combination mode")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "fixtures"}
            onClick={() => setActiveTab("fixtures")}
            className={`combination-mode-tab rounded-lg px-4 py-3 text-left transition ${activeTab === "fixtures" ? "is-active" : ""}`}
          >
            <span className="block font-semibold">{text("Choisir les rencontres", "Choose fixtures")}</span>
            <span className="mt-1 block text-xs opacity-70">{text("Sélection manuelle ou propositions", "Manual picks or suggestions")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ai"}
            onClick={() => setActiveTab("ai")}
            className={`combination-mode-tab rounded-lg px-4 py-3 text-left transition ${activeTab === "ai" ? "is-active" : ""}`}
          >
            <span className="block font-semibold">{text("Générateur statistique", "Statistics generator")}</span>
            <span className="mt-1 block text-xs opacity-70">{text("Marchés, filtres et niveau de risque", "Markets, filters and risk level")}</span>
          </button>
        </div>

        {!authLoading && !isAuthenticated && (
          <section className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
            trialPhaseActive || guestCombinationsRemaining > 0
              ? "border-green-800 bg-green-950/20"
              : "border-amber-700 bg-amber-950/30"
          }`}>
            <p className="text-sm text-green-100">
              {trialPhaseActive
                ? text(
                  "Connectez-vous pour regarder les vidéos en direct.",
                  "Sign in to watch live videos."
                )
                : guestCombinationsRemaining === 0
                ? text(
                  `Vous avez atteint la limite de ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous pour continuer.`,
                  `You have reached the limit of ${GUEST_COMBINATION_LIMIT} free combinations. Sign in to continue.`
                )
                : text(
                  `Générez jusqu’à ${GUEST_COMBINATION_LIMIT} combinaisons gratuitement sans compte (${guestCombinationsUsed}/${GUEST_COMBINATION_LIMIT} utilisées).`,
                  `Generate up to ${GUEST_COMBINATION_LIMIT} combinations for free without an account (${guestCombinationsUsed}/${GUEST_COMBINATION_LIMIT} used).`
                )}
            </p>
            {trialPhaseActive ? (
              <Link href="/login?next=%2Fcombinations" className="rounded-lg border border-green-600 px-3 py-2 text-sm font-semibold text-green-100 hover:bg-green-900/40">
                {text("Se connecter pour les vidéos", "Sign in for videos")}
              </Link>
            ) : guestCombinationsRemaining === 0 && (
              <Link href="/login?next=%2Fcombinations" className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900/40">
                {text("Se connecter pour continuer", "Sign in to continue")}
              </Link>
            )}
          </section>
        )}

        {!authLoading && combinationLimitReached && (
          <section
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700 bg-amber-950/30 p-4"
          >
            <p className="text-sm text-amber-100">
              {needsSignIn
                ? text(
                  `Vous avez utilisé vos ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous : vous profitez ensuite de 3 jours d’essai gratuit (${TRIAL_DAILY_LIMIT} combinaisons par jour et vidéos en direct).`,
                  `You have used your ${GUEST_COMBINATION_LIMIT} free combinations. Sign in: you then get a free 3-day trial (${TRIAL_DAILY_LIMIT} combinations per day and live videos).`
                )
                : needsOffer
                  ? text(
                    `Votre essai gratuit est terminé. Choisissez une offre : Combinaisons à ${COMBINATIONS_MONTHLY_PRICE_FCFA} FCFA/mois (${COMBINATION_DAILY_LIMIT}/jour), TV à ${TV_DAILY_PRICE_FCFA} FCFA/jour, ou le pack Combi + TV à ${PACK_MONTHLY_PRICE_FCFA} FCFA/mois.`,
                    `Your free trial is over. Choose a plan: Combinations at ${COMBINATIONS_MONTHLY_PRICE_FCFA} XOF/month (${COMBINATION_DAILY_LIMIT}/day), TV at ${TV_DAILY_PRICE_FCFA} XOF/day, or the Combi + TV bundle at ${PACK_MONTHLY_PRICE_FCFA} XOF/month.`
                  )
                  : dailyLimitReached
                    ? text(
                      `Vous avez atteint votre quota de ${entitlements.dailyLimit} combinaisons aujourd’hui. Revenez demain${needsOfferForTomorrow ? " ou passez à l’offre Combinaisons" : ""}.`,
                      `You have reached your quota of ${entitlements.dailyLimit} combinations today. Come back tomorrow${needsOfferForTomorrow ? " or get the Combinations plan" : ""}.`
                    )
                    : text("Génération de combinaison indisponible.", "Combination generation unavailable.")}
            </p>
            <div className="flex flex-wrap gap-2">
              {needsSignIn && (
                <Link href="/login?next=%2Fcombinations" className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900/40">
                  {text("Se connecter", "Sign in")}
                </Link>
              )}
              {(needsOffer || (dailyLimitReached && needsOfferForTomorrow)) && (
                <Link href="/payment" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500">
                  {text("Voir les offres", "View plans")}
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="combination-date-toolbar mb-5 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">{text("Période des rencontres", "Fixture date range")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-gray-400">
                {text("Du", "From")}
                <input
                  type="date"
                  min={getLocalDate()}
                  value={startDate}
                  onChange={event => {
                    const nextStartDate = event.target.value || getLocalDate();
                    setStartDate(nextStartDate);
                    if (endDate < nextStartDate) setEndDate(nextStartDate);
                    setSelectedIds([]);
                    setCoupons([]);
                    setSafeCoupon(null);
                    setStatisticCoupon(null);
                  }}
                  className="ml-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <span className="pb-1 text-gray-600">→</span>
              <label className="text-xs text-gray-400">
                {text("Au", "To")}
                <input
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={event => {
                    setEndDate(event.target.value || startDate);
                    setSelectedIds([]);
                    setCoupons([]);
                    setSafeCoupon(null);
                    setStatisticCoupon(null);
                  }}
                  className="ml-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {text("Les matchs programmés dans cette période seront utilisés pour la combinaison.", "Scheduled matches in this date range will be used for the combination.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === "fixtures" && (
              <span className="text-sm text-gray-400">
                {text(`${selectedIds.length}/${MAX_FIXTURES} rencontres choisies`, `${selectedIds.length}/${MAX_FIXTURES} fixtures selected`)}
              </span>
            )}
            <button
              type="button"
              onClick={refreshNow}
              disabled={loading}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-green-600 disabled:opacity-50"
            >
              {text("Actualiser", "Refresh")}
            </button>
          </div>
        </section>

        {activeTab === "fixtures" && (
          <section className="combination-search-panel mb-4 rounded-xl border border-gray-800 bg-gray-900 p-4" aria-label={text("Rechercher des rencontres", "Search fixtures")}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="min-w-[16rem] flex-1 text-xs text-gray-400">
                {text("Rechercher une rencontre", "Search fixtures")}
                <input
                  type="search"
                  value={fixtureQuery}
                  onChange={event => {
                    setFixtureQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={text("Équipe, compétition ou date (AAAA-MM-JJ)", "Team, competition or date (YYYY-MM-DD)")}
                  className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllVisibleFixtures}
                  disabled={visibleFixtures.length === 0}
                  className="rounded-lg border border-green-700 bg-green-950/30 px-3 py-2 text-xs font-semibold text-green-200 hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {text("Tout sélectionner (page)", "Select all (page)")}
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearGeneratedOutputs();
                      setSelectedIds([]);
                    }}
                    className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-red-700 hover:text-red-300"
                  >
                    {text("Tout désélectionner", "Clear selection")}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {text(
                `Rencontres du ${startDate} au ${endDate} : ${searchedFixtures.length} résultat(s) sur ${fixtures.length}.`,
                `Fixtures from ${startDate} to ${endDate}: ${searchedFixtures.length} result(s) out of ${fixtures.length}.`
              )}
            </p>
          </section>
        )}

        {loadError && (
          <p role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</p>
        )}
        {activeTab === "fixtures" && (
          <>
        <section className="combination-fixtures-section" aria-label={text("Rencontres à venir", "Upcoming fixtures")}>
          {loading && fixtures.length === 0 ? (
            <p role="status" className="py-12 text-center text-gray-400">{text("Chargement des rencontres…", "Loading fixtures…")}</p>
          ) : fixtures.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
              <p className="text-gray-300">{text("Aucune rencontre programmée sur cette période.", "No scheduled fixtures in this period.")}</p>
            </div>
          ) : searchedFixtures.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
              <p className="text-gray-300">
                {text(
                  `Aucune rencontre du ${startDate} au ${endDate} ne correspond à votre recherche.`,
                  `No fixture between ${startDate} and ${endDate} matches your search.`
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleFixtures.map(fixture => {
                const selected = selectedIds.includes(fixture.id);
                return (
                  <article
                    key={fixture.id}
                    className={`flex items-center gap-3 rounded-xl border p-4 transition ${
                      selected ? "border-green-600 bg-green-950/30" : "border-gray-800 bg-gray-900 hover:border-gray-600"
                    }`}
                  >
                    <input
                      id={`fixture-${fixture.id}`}
                      type="checkbox"
                      aria-label={text(
                        `Sélectionner ${fixture.homeTeam} contre ${fixture.awayTeam}`,
                        `Select ${fixture.homeTeam} vs ${fixture.awayTeam}`
                      )}
                      checked={selected}
                      onChange={() => toggleFixture(fixture.id)}
                      className="h-4 w-4 accent-green-500"
                    />
                    <label htmlFor={`fixture-${fixture.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block font-semibold text-white">{fixture.homeTeam} — {fixture.awayTeam}</span>
                      <span className="mt-1 block text-xs text-gray-400">
                        {new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })} · {fixture.time} · {fixture.competition || fixture.league}
                      </span>
                    </label>
                    <Link
                      href={`/match/${encodeURIComponent(fixture.id)}`}
                      className="shrink-0 text-xs font-semibold text-green-400 hover:text-green-300"
                    >
                      {text("Détails", "Details")}
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
          {searchedFixtures.length > PAGE_SIZE && (
            <nav className="mt-5 flex flex-wrap items-center justify-center gap-3" aria-label={text("Pagination des rencontres", "Fixture pagination")}>
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {text("Précédent", "Previous")}
              </button>
              <span className="text-sm text-gray-400">
                {text(`Page ${currentPage} sur ${totalPages}`, `Page ${currentPage} of ${totalPages}`)}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {text("Suivant", "Next")}
              </button>
            </nav>
          )}
        </section>

        <section className="combination-auto-controls mt-6 grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)] sm:items-end" aria-label={text("Paramètres de la combinaison automatique", "Automatic combination settings")}>
          <label className="combination-count-field block text-sm font-medium text-gray-200">
            {text("Nombre d’événements souhaités", "Number of events")}
            <select
              value={requestedCount}
              onChange={event => {
                setRequestedCount(Number(event.target.value));
                setSafeCoupon(null);
              }}
              className="mt-2 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white sm:max-w-xs"
            >
              {Array.from({ length: MAX_FIXTURES }, (_, index) => index + 1).map(count => (
                <option key={count} value={count}>
                  {text(`${count} événement${count > 1 ? "s" : ""}`, `${count} event${count > 1 ? "s" : ""}`)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-gray-400">
              {text(
                randomSelection
                  ? `L’IA choisira au hasard parmi les matchs du ${startDate} au ${endDate}.`
                  : `L’IA choisira les événements les mieux notés entre le ${startDate} et le ${endDate}.`,
                randomSelection
                  ? `AI will choose randomly from matches between ${startDate} and ${endDate}.`
                  : `AI will select the highest-rated events between ${startDate} and ${endDate}.`
              )}
            </span>
          </label>
          <div className="combination-auto-preferences flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={randomSelection}
                onChange={event => setRandomSelection(event.target.checked)}
                className="h-4 w-4 accent-green-500"
              />
              {text("Sélection aléatoire", "Random selection")}
            </label>
          </div>
          <div className="combination-auto-actions flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                setShowAutoRiskOptions(false);
                void generateAutoCombination(riskLevel);
              }}
              disabled={authLoading || !canGenerateCombination || loading || generating || fixtures.length === 0}
              className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating
                ? text("Recherche de la combinaison…", "Finding a combination…")
                : text("Trouver ma combinaison", "Find my combination")}
            </button>
            <button
              type="button"
              onClick={() => setShowAutoRiskOptions(current => !current)}
              disabled={generating}
              className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-200 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showAutoRiskOptions
                ? text("Masquer les risques", "Hide risk levels")
                : text("Niveau de risque", "Risk level")}
            </button>
          </div>
        </section>

        {showAutoRiskOptions && (
          <section className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4" aria-label={text("Choisir un niveau de risque automatique", "Choose an automatic risk level")}>
            <h2 className="text-sm font-semibold text-white">{text("Choisissez le risque de votre combinaison", "Choose your combination's risk level")}</h2>
            <p className="mt-1 text-xs text-gray-400">
              {text(
                randomSelection
                  ? `L’IA choisira au hasard ${requestedCount} rencontre(s) entre le ${startDate} et le ${endDate}.`
                  : `L’IA choisira les ${requestedCount} rencontre(s) les mieux notées entre le ${startDate} et le ${endDate}.`,
                randomSelection
                  ? `AI will randomly choose ${requestedCount} fixture(s) between ${startDate} and ${endDate}.`
                  : `AI will choose the ${requestedCount} highest-rated fixtures between ${startDate} and ${endDate}.`
              )}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(RISK_LEVELS) as RiskLevel[]).map(level => {
                const option = RISK_LEVELS[level];
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={authLoading || !canGenerateCombination || generating}
                    onClick={() => {
                      setShowAutoRiskOptions(false);
                      void generateAutoCombination(level);
                    }}
                    className={`rounded-lg border p-3 text-left transition hover:border-green-600 disabled:cursor-wait disabled:opacity-60 ${
                      riskLevel === level ? "border-green-700 bg-green-950/30" : "border-gray-700 bg-gray-950"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{text(option.label, option.labelEn)}</span>
                    {(option.description || option.descriptionEn) && (
                      <span className="mt-1 block text-xs text-gray-400">{text(option.description, option.descriptionEn)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setShowRiskOptions(false);
              void generateCombinations(false, suggestionCount || 3, riskLevel);
            }}
            disabled={authLoading || !canGenerateCombination || fixturesForCombination.length === 0 || generating}
            className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating
              ? text("Préparation des combinaisons…", "Preparing combinations…")
              : suggestionCount < 3
                ? text(`Proposer ${suggestionCount} combinaison(s)`, `Suggest ${suggestionCount} combination(s)`)
                : text("Proposer 3 combinaisons", "Suggest 3 combinations")}
          </button>
          <button
            type="button"
            onClick={() => setShowRiskOptions(current => !current)}
            disabled={generating}
            className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-200 hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showRiskOptions
              ? text("Masquer les risques", "Hide risk levels")
              : text("Niveau de risque", "Risk level")}
          </button>
          <button
            type="button"
            onClick={() => void analyseLiveWithAI()}
            disabled={aiAnalysing || generating}
            className="rounded-lg border border-purple-700 bg-purple-950/30 px-5 py-3 text-sm font-semibold text-purple-200 hover:border-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiAnalysing
              ? text("Analyse IA en cours…", "AI analysis running…")
              : text("🧠 Analyse IA (live)", "🧠 AI analysis (live)")}
          </button>
          <button
            type="button"
            onClick={() => addFixturesToBasket(selectedFixtures)}
            disabled={selectedFixtures.length === 0}
            className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-200 hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text("Ajouter au panier", "Add to basket")}
          </button>
        </div>

        {showRiskOptions && (
          <section className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4" aria-label={text("Choisir un niveau de risque", "Choose a risk level")}>
            <h2 className="text-sm font-semibold text-white">{text("Choisissez votre niveau de risque", "Choose your risk level")}</h2>
            {selectedFixtures.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {text(
                  `Sans rencontre cochée, les ${fixturesForCombination.length} prochaines rencontres seront utilisées.`,
                  `With no fixtures selected, the next ${fixturesForCombination.length} fixtures will be used.`
                )}
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(RISK_LEVELS) as RiskLevel[]).map(level => {
                const option = RISK_LEVELS[level];
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={authLoading || !canGenerateCombination || generating}
                    onClick={() => {
                      setRiskLevel(level);
                      void generateCombinations(true, suggestionCount || 3, level);
                    }}                    className={`rounded-lg border p-3 text-left transition hover:border-green-600 ${
                      riskLevel === level ? "border-green-700 bg-green-950/30" : "border-gray-700 bg-gray-950"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{text(option.label, option.labelEn)}</span>
                    {(option.description || option.descriptionEn) && (
                      <span className="mt-1 block text-xs text-gray-400">{text(option.description, option.descriptionEn)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {safeCoupon && (
          <section className="combination-result combination-result--auto mt-8 overflow-hidden rounded-2xl border border-green-900/70 bg-gradient-to-br from-gray-900 to-gray-950 shadow-lg shadow-black/20" aria-label={text("Combinaison proposée par l’IA", "AI suggested combination")}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white">{safeCoupon.title}</h2>
                <p className="mt-1 text-sm text-gray-400">{safeCoupon.description}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {text(
                    `${safeCoupon.matches.length} événement(s) choisi(s) automatiquement parmi ${fixtures.length} rencontre(s) à venir selon le niveau de risque ${text(RISK_LEVELS[riskLevel].label.toLocaleLowerCase("fr-FR"), RISK_LEVELS[riskLevel].labelEn.toLowerCase())}.`,
                    `${safeCoupon.matches.length} event(s) automatically chosen from ${fixtures.length} upcoming fixtures at the ${RISK_LEVELS[riskLevel].labelEn.toLowerCase()} risk level.`
                  )}
                </p>
              </div>
              {typeof safeCoupon.estimatedCombinedRate === "number" && (
                <span className="shrink-0 rounded-full border border-green-800 bg-green-950/60 px-3 py-1 text-xs font-semibold text-green-200">
                  {text("Estimation combinée indicative", "Indicative combined estimate")}: {safeCoupon.estimatedCombinedRate}%
                  {formatTheoreticalOdds(safeCoupon.estimatedCombinedRate) !== null && (
                    <> · {text("Cote théorique", "Theoretical odds")} <span className="text-green-400">{formatTheoreticalOdds(safeCoupon.estimatedCombinedRate)}</span></>
                  )}
                </span>
              )}
            </header>
            <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
              {safeCoupon.matches.map(match => (
                <article key={match.fixtureId} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {renderMatchOutcome(safeCoupon, match.fixtureId)}
                      <h3 className="mt-1 text-sm font-semibold text-white">{match.homeTeam} — {match.awayTeam}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSafeCouponMatch(match.fixtureId)}
                      disabled={safeCoupon.matches.length <= 1}
                      aria-label={text(`Retirer ${match.homeTeam} contre ${match.awayTeam}`, `Remove ${match.homeTeam} vs ${match.awayTeam}`)}
                      title={text("Retirer cette rencontre", "Remove this fixture")}
                      className="shrink-0 rounded border border-gray-700 px-2 text-xs text-gray-300 hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {match.picks.map(pick => {
                      const theoreticalOdds = pick.historicalRate === null
                        ? null
                        : formatTheoreticalOdds(pick.historicalRate);
                      return (
                        <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            {renderPickOutcome(safeCoupon, match.fixtureId, pick)}
                            <span className="flex items-center gap-2 text-gray-300">
                              {pick.playerImageUrl && (
                                <Image src={pick.playerImageUrl} alt={pick.playerName ?? ""} width={28} height={28} unoptimized className="h-7 w-7 rounded-full object-cover" />
                              )}
                              {pickLabel(pick)}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-green-900/80 bg-green-950/40 px-2 py-0.5 font-medium text-green-300">
                              {pick.historicalRate === null
                                ? text("Pas de données", "No data")
                                : `${pick.historicalRate}% (${pick.sampleSize} ${text("match(s)", "matches")})`}
                            </span>
                            {theoreticalOdds !== null && (
                              <span className="text-[11px] text-gray-400">
                                {text("Cote théorique", "Theoretical odds")}{" "}
                                <span className="font-semibold text-green-400">{theoreticalOdds}</span>
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-2 inline-block text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">
                    {text("Voir le match →", "View fixture →")}
                  </Link>
                </article>
              ))}
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-gray-800 px-3 py-3 sm:px-4">
              <button
                type="button"
                onClick={() => addGeneratedCombinationToBasket(safeCoupon)}
                className="rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-900/50"
              >
                {text("Enregistrer et suivre", "Save and track")}
              </button>
              <button
                type="button"
                onClick={() => void generateAutoCombination(riskLevel, safeCoupon.matches.map(match => match.fixtureId))}
                disabled={authLoading || !canGenerateCombination || generating}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:cursor-wait disabled:opacity-50"
              >
                {generating
                  ? text("Recherche…", "Generating…")
                  : text("Proposer une autre", "Suggest another")}
              </button>
              <p className="basis-full text-[11px] text-amber-300">
                {text(
                  "Estimation basée sur l’historique disponible, sans garantie de résultat.",
                  "Estimate based on available history; outcomes are not guaranteed."
                )}
              </p>
              {renderCombinationActions(
                safeCoupon.title,
                formatGeneratedCoupon(safeCoupon),
                Object.fromEntries(safeCoupon.matches.map(match => [ `${match.homeTeam} — ${match.awayTeam}`, couponMatchOutcome(safeCoupon, match.fixtureId) ])),
                getCouponPickStatuses(safeCoupon)
              )}
            </footer>
          </section>
        )}

        {(aiAnalyses.length > 0 || aiError) && (
          <section className="combination-result combination-result--live mt-10 rounded-2xl border border-purple-800/70 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 shadow-xl shadow-black/30 sm:p-6" aria-label={text("Analyse IA des matchs en direct", "AI analysis of live matches")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                <span aria-hidden="true">🧠</span>
                {text("Analyse IA — matchs en direct", "AI analysis — live matches")}
              </h2>
              <button
                type="button"
                onClick={() => setAiAnalyses([])}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-purple-600"
              >
                {text("Masquer", "Hide")}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {text(
                "Moteur expert local : croise score, temps restant, rythme et statistiques en direct. Seuls les événements encore ouverts sont proposés (jamais déjà gagnés ni perdus).",
                "Local expert engine: cross-checks score, remaining time, pace and live stats. Only still-open events are suggested (never already won or lost)."
              )}
            </p>
            {aiError && (
              <p role="alert" className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">{aiError}</p>
            )}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {aiAnalyses.map(analysis => {
                const expectedGoals = analysis.expectedGoalsRemaining.toFixed(1).replace(".", ",");
                const expectedLabel = analysis.expectedGoalsRemaining < 2
                  ? text("but attendu d'ici la fin", "goal expected until full time")
                  : text("buts attendus d'ici la fin", "goals expected until full time");
                return (
                  <article key={analysis.fixtureId} className="flex flex-col rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                    <header className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold leading-snug text-white">{`${analysis.homeTeam} — ${analysis.awayTeam}`}</h3>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-md border border-green-700 bg-green-950/50 px-2 py-1 text-xs font-bold text-green-300">{analysis.score}</span>
                        <span className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs font-semibold text-gray-300">{`${analysis.minute}'`}</span>
                      </div>
                    </header>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        analysis.tempo === "offensive"
                          ? "border border-orange-700 bg-orange-950/40 text-orange-300"
                          : analysis.tempo === "closed"
                            ? "border border-sky-800 bg-sky-950/40 text-sky-300"
                            : "border border-gray-700 bg-gray-900 text-gray-300"
                      }`}>
                        {analysis.tempo === "offensive"
                          ? text("⚡ Rythme offensif", "⚡ Offensive pace")
                          : analysis.tempo === "closed"
                            ? text("🛡️ Match fermé", "🛡️ Closed match")
                            : text("⚖️ Rythme équilibré", "⚖️ Balanced pace")}
                      </span>
                      <span className="rounded-full border border-purple-800 bg-purple-950/30 px-2.5 py-1 text-[11px] font-semibold text-purple-200">
                        {`≈ ${expectedGoals} ${expectedLabel}`}
                      </span>
                      <span className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                        {text(`${analysis.remainingMinutes} min restantes`, `${analysis.remainingMinutes} min remaining`)}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {analysis.insights.map((insight, index) => (
                        <li key={index} className="flex gap-2 text-xs leading-relaxed text-gray-300">
                          <span aria-hidden="true" className="mt-0.5 shrink-0 text-green-500">●</span>
                          <span>{text(insight.fr, insight.en)}</span>
                        </li>
                      ))}
                    </ul>
                    {analysis.recommendations.length > 0 && (
                      <div className="mt-4 border-t border-gray-800 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-green-300">
                          {text("Événements les plus réalistes", "Most realistic events")}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {analysis.recommendations.map((recommendation, index) => {
                            const chance = Math.round(recommendation.probability * 100);
                            const chanceStyle = chance >= 70
                              ? "border-green-800 bg-green-950/50 text-green-300"
                              : chance >= 45
                                ? "border-amber-800 bg-amber-950/40 text-amber-300"
                                : "border-gray-700 bg-gray-900 text-gray-300";
                            return (
                              <li key={index} className="rounded-lg border border-gray-800 bg-gray-900/80 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-2 text-xs font-semibold text-white">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-gray-300">{index + 1}</span>
                                    {text(recommendation.label.fr, recommendation.label.en)}
                                  </span>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${chanceStyle}`}>{`${chance} %`}</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                                  <div
                                    className={`h-full rounded-full ${chance >= 70 ? "bg-gradient-to-r from-green-600 to-green-400" : chance >= 45 ? "bg-gradient-to-r from-amber-600 to-amber-400" : "bg-gradient-to-r from-gray-600 to-gray-400"}`}
                                    style={{ width: `${chance}%` }}
                                  />
                                </div>
                                <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{text(recommendation.rationale.fr, recommendation.rationale.en)}</p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {coupons.length > 0 && (
          <section className="combination-results mt-10" aria-label={text("Combinaisons proposées", "Suggested combinations")}>
            <h2 className="mb-4 text-2xl font-bold text-white">{text("Vos combinaisons", "Your combinations")}</h2>
            <p className="combination-results-intro mb-4 text-sm text-gray-400">
              {text("Retirez les rencontres que vous ne souhaitez pas garder, puis enregistrez chaque combinaison pour suivre son résultat dans le panier.", "Remove any fixtures you do not want, then save each combination to track its result in your basket.")}
              {" "}
              <Link href="/basket" className="font-semibold underline hover:text-green-200">
                {text("Voir le suivi", "View tracking")}
              </Link>
            </p>
            <div className="combination-coupon-grid grid gap-4 lg:grid-cols-2">
              {coupons.map((coupon, index) => (
                <article key={`${coupon.level}-${index}`} className="combination-coupon-card rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <header className="combination-coupon-heading">
                    <h3 className="text-lg font-bold text-white">{coupon.title}</h3>
                    <p className="mt-1 text-sm text-gray-400">{coupon.description}</p>
                  </header>
                  <ul className="combination-pick-list mt-4 space-y-3">
                    {coupon.matches.map(match => (
                      <li key={match.fixtureId} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {renderMatchOutcome(coupon, match.fixtureId)}
                            <p className="mt-1 text-sm font-semibold text-white">{match.homeTeam} — {match.awayTeam}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCouponMatch(index, match.fixtureId)}
                            disabled={coupon.matches.length <= 1}
                            aria-label={text(`Retirer ${match.homeTeam} contre ${match.awayTeam}`, `Remove ${match.homeTeam} vs ${match.awayTeam}`)}
                            title={text("Retirer cette rencontre", "Remove this fixture")}
                            className="shrink-0 rounded border border-gray-700 px-2 text-xs text-gray-300 hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ×
                          </button>
                        </div>
                        <ul className="mt-2 space-y-2">
                          {match.picks.map(pick => (
                            <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                {renderPickOutcome(coupon, match.fixtureId, pick)}
                                <span className="flex items-center gap-2 text-gray-300">
                                  {pick.playerImageUrl && (
                                    <Image src={pick.playerImageUrl} alt={pick.playerName ?? ""} width={28} height={28} unoptimized className="h-7 w-7 rounded-full object-cover" />
                                  )}
                                  {pickLabel(pick)}
                                </span>
                              </span>
                              <span className="text-gray-500">
                                {pick.historicalRate === null
                                  ? text("Pas de données", "No data")
                                  : text(
                                    `${pick.historicalRate}% sur ${pick.sampleSize} match(s)`,
                                    `${pick.historicalRate}% across ${pick.sampleSize} match(es)`
                                  )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setActionNotice("");
                      const result = saveCouponsForTracking([coupon]);
                      if (result.success) {
                        if (result.wasDuplicate) {
                          setActionNotice(text("Cette combinaison est déjà enregistrée dans le panier.", "This combination is already saved in your basket."));
                        } else {
                          setActionNotice(text(
                            "La combinaison a été enregistrée et son résultat sera suivi dans le panier.",
                            "Combination saved and its result will be tracked in your basket."
                          ));
                        }
                      }
                    }}
                    className="mt-4 rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-900/50"
                  >
                    {text("Enregistrer et suivre", "Save and track")}
                  </button>
                  {renderCombinationActions(
                    coupon.title,
                    formatGeneratedCoupon(coupon),
                    Object.fromEntries(coupon.matches.map(match => [ `${match.homeTeam} — ${match.awayTeam}`, couponMatchOutcome(coupon, match.fixtureId) ])),
                    getCouponPickStatuses(coupon)
                  )}
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs text-amber-300">
              {text(
                "Ces propositions reposent sur les résultats historiques disponibles. Elles ne garantissent aucun résultat.",
                "These suggestions are based on available historical results and do not guarantee any outcome."
              )}
            </p>
          </section>
        )}
          </>
        )}

        {activeTab === "ai" && (
          <section className="ai-generator-panel rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6" aria-label={text("Générateur IA statistique", "AI statistics generator")}>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-green-400">{text("Générateur IA", "AI generator")}</p>
                <h2 className="mt-1 text-xl font-bold text-white">{text("Créer une combinaison statistique", "Create a statistics combination")}</h2>
              </div>
              <span className="shrink-0 rounded-full border border-gray-700 px-3 py-1 text-xs font-semibold text-gray-400">
                {text(`Étape ${aiSetupStep} sur 2`, `Step ${aiSetupStep} of 2`)}
              </span>
            </div>

            {aiSetupStep === 1 ? (
              <>
                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-gray-200">{text("Choisir une statistique", "Choose a statistic")}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {STATISTIC_MARKETS.map(market => (
                      <button
                        key={market.id}
                        type="button"
                        aria-pressed={statisticMarket === market.id}
                        onClick={() => {
                          setStatisticMarket(market.id);
                          setStatisticCoupon(null);
                        }}
                        className={`rounded-lg border p-4 text-left transition ${statisticMarket === market.id ? "border-green-600 bg-green-950/25" : "border-gray-700 bg-gray-950 hover:border-gray-500"}`}
                      >
                        <span className="block font-semibold text-white">{text(market.label, market.labelEn)}</span>
                        <span className="mt-1 block text-sm text-gray-400">{text(market.description, market.descriptionEn)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="mt-6 block max-w-xs text-sm font-medium text-gray-200">
                  {text("Nombre d’événements", "Number of events")}
                  <select
                    value={statisticCount}
                    onChange={event => {
                      setStatisticCount(Number(event.target.value));
                      setStatisticCoupon(null);
                    }}
                    className="mt-2 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
                  >
                    {Array.from({ length: MAX_FIXTURES }, (_, index) => index + 1).map(count => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="mt-6">
                  <legend className="mb-3 text-sm font-semibold text-gray-200">
                    {text("Type de rencontres", "Fixture type")}
                  </legend>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      aria-pressed={!liveOnly}
                      onClick={() => {
                        setLiveOnly(false);
                        setStatisticCoupon(null);
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                        !liveOnly ? "border-green-600 bg-green-950/30 text-green-200" : "border-gray-700 text-gray-400"
                      }`}
                    >
                      {text("Matchs à venir", "Upcoming matches")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={liveOnly}
                      onClick={() => {
                        setLiveOnly(true);
                        setStatisticCoupon(null);
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                        liveOnly ? "border-green-600 bg-green-950/30 text-green-200" : "border-gray-700 text-gray-400"
                      }`}
                    >
                      {text("Matchs en direct", "Live matches")}
                    </button>
                  </div>
                </fieldset>
                <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={randomSelection}
                    onChange={event => {
                      setRandomSelection(event.target.checked);
                      setStatisticCoupon(null);
                    }}
                    className="h-4 w-4 accent-green-500"
                  />
                  {text("Sélection aléatoire", "Random selection")}
                </label>
                <p className="mt-4 text-xs text-gray-500">
                  {text("Les matchs sans historique sont exclus. Le taux affiché est lissé selon le nombre d’observations et reste indicatif.", "Fixtures without history are excluded. Displayed rates are adjusted for sample size and remain indicative.")}
                </p>
                <button
                  type="button"
                  onClick={() => setAiSetupStep(2)}
                  disabled={loading || fixtures.length === 0}
                  className="mt-6 w-full rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {text("Continuer", "Continue")}
                </button>
              </>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{text("Choisir le niveau de risque", "Choose a risk level")}</h3>
                    <p className="mt-1 text-sm text-gray-400">
                      {text(
                        `${statisticCount} rencontre(s) · ${text(STATISTIC_MARKETS.find(market => market.id === statisticMarket)!.label.toLocaleLowerCase("fr-FR"), STATISTIC_MARKETS.find(market => market.id === statisticMarket)!.labelEn.toLowerCase())}`,
                        `${statisticCount} fixture(s) · ${STATISTIC_MARKETS.find(market => market.id === statisticMarket)!.labelEn.toLowerCase()}`
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={() => setAiSetupStep(1)} className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:text-white">
                    {text("Modifier", "Change")}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(RISK_LEVELS) as RiskLevel[]).map(level => {
                    const option = RISK_LEVELS[level];
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={riskLevel === level}
                        onClick={() => setRiskLevel(level)}
                        className={`rounded-lg border p-4 text-left transition ${riskLevel === level ? "border-green-600 bg-green-950/25" : "border-gray-700 bg-gray-950 hover:border-gray-500"}`}
                      >
                        <span className="block font-semibold text-white">{text(option.label, option.labelEn)}</span>
                        <span className="mt-1 block text-sm text-gray-400">
                          {text(
                            `Taux historique cible : environ ${STATISTIC_RISK_TARGETS[level]} %`,
                            `Target historical rate: about ${STATISTIC_RISK_TARGETS[level]}%`
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void generateStatisticCombination(riskLevel)}
                  disabled={authLoading || !canGenerateCombination || generating}
                  className="mt-6 w-full rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                >
                  {generating ? text("Génération…", "Generating…") : text("Générer ma combinaison", "Generate my combination")}
                </button>
              </>
            )}

            {scorerCoupon && (
              <section className="combination-result combination-result--scorers mt-8 border-t border-gray-800 pt-6" aria-label={text("Combinaison de buteurs générée", "Generated scorer combination")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{scorerCoupon.title}</h3>
                    <p className="mt-1 text-sm text-gray-400">{scorerCoupon.description}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {scorerCoupon.matches.map(match => (
                    <article key={match.fixtureId} className="rounded-lg border border-gray-800 bg-black/30 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-white">{match.homeTeam} — {match.awayTeam}</h4>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        {match.homeScorer ? (
                          <div className="flex items-center gap-3">
                            {match.homeScorer.imageUrl && (
                              <Image src={match.homeScorer.imageUrl} alt={match.homeScorer.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">{match.homeScorer.name}</p>
                              <p className="text-xs text-gray-400">{match.homeTeam} · {match.homeScorer.position ?? ""}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{text("Aucun buteur", "No scorer")}</span>
                            <span>{match.homeTeam}</span>
                          </div>
                        )}
                        {match.awayScorer ? (
                          <div className="flex items-center gap-3">
                            {match.awayScorer.imageUrl && (
                              <Image src={match.awayScorer.imageUrl} alt={match.awayScorer.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">{match.awayScorer.name}</p>
                              <p className="text-xs text-gray-400">{match.awayTeam} · {match.awayScorer.position ?? ""}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{text("Aucun buteur", "No scorer")}</span>
                            <span>{match.awayTeam}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{match.lineupType}</p>
                      <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-3 inline-block text-xs font-semibold text-green-400 hover:text-green-300">
                        {text("Voir le match →", "View fixture →")}
                      </Link>
                    </article>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={saveScorerCombination}
                    className="rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-900/50"
                  >
                    {text("Enregistrer", "Save")}
                  </button>
                  {scorerSaveNotice && (
                    <p role="status" className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2 text-xs text-green-200">
                      {scorerSaveNotice}{" "}
                      <Link href="/basket" className="font-semibold underline hover:text-green-100">
                        {text("Ouvrir le panier →", "Open basket →")}
                      </Link>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void generateScorerCombination(scorerCoupon.matches.map(match => match.fixtureId))}
                  disabled={authLoading || !canGenerateCombination || generating}
                  className="mt-5 rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-950/50 disabled:cursor-wait disabled:opacity-50"
                >
                  {generating ? text("Génération…", "Generating…") : text("Proposer une autre", "Suggest another")}
                </button>
                {!authLoading && !canGenerateCombination && (
                  <p className="mt-2 text-xs text-amber-300">
                    {text(
                      "Quota de combinaisons du jour atteint. Souscrivez à une offre depuis la page Abonnement pour continuer.",
                      "You have reached today's combination quota. Subscribe from the Plans page to continue."
                    )}{" "}
                    <Link href="/payment" className="font-semibold underline hover:text-amber-200">
                      {text("Voir les offres →", "See plans →")}
                    </Link>
                  </p>
                )}
                {!authLoading && canGenerateCombination && generating && (
                  <p className="mt-2 text-xs text-gray-400">
                    {text("Génération en cours, veuillez patienter.", "Generating, please wait.")}
                  </p>
                )}
              </section>
            )}

            {statisticCoupon && (
              <section className="combination-result combination-result--statistics mt-8 border-t border-gray-800 pt-6" aria-label={text("Combinaison statistique générée", "Generated statistics combination")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{statisticCoupon.title}</h3>
                    <p className="mt-1 text-sm text-gray-400">{statisticCoupon.description}</p>
                  </div>
                  <span className="rounded-full border border-green-700 bg-green-950 px-3 py-1 text-sm font-semibold text-green-200">
                    {text("Estimation combinée indicative", "Indicative combined estimate")}: {statisticCoupon.estimatedCombinedRate}%
                    {formatTheoreticalOdds(statisticCoupon.estimatedCombinedRate) !== null && (
                      <> · {text("Cote théorique", "Theoretical odds")} <span className="text-green-400">{formatTheoreticalOdds(statisticCoupon.estimatedCombinedRate)}</span></>
                    )}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {statisticCoupon.matches.map(match => {
                    const market = STATISTIC_MARKETS.find(option => option.id === match.market)!;
                    const direction = match.selection === "over" ? text("Plus de", "Over") : text("Moins de", "Under");
                    const line = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(match.line);
                    return (
                      <article key={match.fixtureId} className="rounded-lg border border-gray-800 bg-black/30 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-white">{match.homeTeam} — {match.awayTeam}</h4>
                          <button
                            type="button"
                            onClick={() => removeStatisticMatch(match.fixtureId)}
                            disabled={statisticCoupon.matches.length <= 1}
                            aria-label={text(`Retirer ${match.homeTeam} contre ${match.awayTeam}`, `Remove ${match.homeTeam} vs ${match.awayTeam}`)}
                            title={text("Retirer cette rencontre", "Remove this fixture")}
                            className="shrink-0 rounded border border-gray-700 px-2 text-xs text-gray-300 hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ×
                          </button>
                        </div>
                        <p className="mt-2 text-sm text-gray-300">{text(market.label, market.labelEn)} : {direction} {line}</p>
                        <p className="mt-1 text-xs text-green-300">
                          {match.historicalRate}% {text("sur", "across")} {match.sampleSize} {text("match(s) historique(s)", "historical match(es)")}
                          {formatTheoreticalOdds(match.historicalRate) !== null && (
                            <> · {text("Cote théorique", "Theoretical odds")} <span className="font-semibold">{formatTheoreticalOdds(match.historicalRate)}</span></>
                          )}
                        </p>
                        <Link href={`/match/${encodeURIComponent(match.fixtureId)}`} className="mt-3 inline-block text-xs font-semibold text-green-400 hover:text-green-300">
                          {text("Voir le match →", "View fixture →")}
                        </Link>
                      </article>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => saveStatisticCombination(statisticCoupon)}
                    className="rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-900/50"
                  >
                    {text("Enregistrer", "Save")}
                  </button>
                  {renderCombinationActions(statisticCoupon.title, formatStatisticCoupon(statisticCoupon))}
                </div>
                <button
                  type="button"
                  onClick={() => void generateStatisticCombination(riskLevel, statisticCoupon.matches.map(match => match.fixtureId))}
                  disabled={authLoading || !canGenerateCombination || generating}
                  className="mt-5 rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-950/50 disabled:cursor-wait disabled:opacity-50"
                >
                  {generating ? text("Génération…", "Generating…") : text("Proposer une autre", "Suggest another")}
                </button>
              </section>
            )}
            {savedStatisticCombinations.length > 0 && (
              <section className="mt-8 border-t border-gray-800 pt-6" aria-label={text("Combinaisons statistiques enregistrées", "Saved statistics combinations")}>
                <h3 className="mb-3 text-lg font-bold text-white">{text("Combinaisons enregistrées sur cet appareil", "Combinations saved on this device")}</h3>
                <ul className="space-y-3">
                  {savedStatisticCombinations.map(saved => (
                    <li key={saved.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-black/30 p-4">
                      <div>
                        <p className="font-semibold text-white">{saved.coupon.title}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(saved.createdAt).toLocaleDateString(locale)}
                          {" · "}
                          {saved.coupon.matches.length} {text("rencontre(s)", "fixture(s)")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => exportCombination(saved.coupon.title, formatStatisticCoupon(saved.coupon))}
                          className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:text-white"
                        >
                          {text("Exporter PDF", "Export PDF")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareCombination(saved.coupon.title, formatStatisticCoupon(saved.coupon))}
                          className="rounded-lg border border-green-700 px-3 py-2 text-xs font-semibold text-green-200 hover:bg-green-950/50"
                        >
                          {text("Partager", "Share")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSavedStatisticCombination(saved.id)}
                          className="rounded-lg border border-red-900 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/40"
                        >
                          {text("Supprimer", "Delete")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
