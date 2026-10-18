"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import { readFixtureBasket, writeFixtureBasket } from "@/lib/fixtureBasket";
import { readGeneratedCombinations, writeGeneratedCombinations } from "@/lib/generatedCombinations";
import { uniqueGeneratedCoupons, type GeneratedCoupon, type GeneratedStatisticCoupon, type CouponPick, type StatisticMarket } from "@/lib/coupons";
import type { Fixture, FixtureResponse } from "@/lib/fixtures";
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
const GUEST_COMBINATION_LIMIT = 20;
const GUEST_COMBINATION_COUNT_KEY = "ikprono_guest_combination_count";
const DEFAULT_LOOKAHEAD_DAYS = 7;
const PAGE_SIZE = 12;

type RiskLevel = "very-safe" | "safe" | "medium" | "bold" | "very-risky";
type CombinationsTab = "fixtures" | "ai";

const STATISTIC_MARKETS: { id: StatisticMarket; label: string; labelEn: string; description: string; descriptionEn: string }[] = [
  { id: "shots", label: "Tirs dans le match", labelEn: "Total shots", description: "Total des tirs des deux équipes", descriptionEn: "Combined shots from both teams" },
  { id: "cards", label: "Cartons dans le match", labelEn: "Match cards", description: "Total des cartons jaunes et rouges", descriptionEn: "Combined yellow and red cards" },
  { id: "corners", label: "Corners dans le match", labelEn: "Match corners", description: "Total des corners des deux équipes", descriptionEn: "Combined corners from both teams" },
  { id: "shots-on-target", label: "Tirs cadrés dans le match", labelEn: "Shots on target", description: "Total des tirs cadrés des deux équipes", descriptionEn: "Combined shots on target from both teams" },
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
    description: "Résultat le plus fréquent et au moins 2 buts",
    descriptionEn: "Most frequent result and at least 2 goals",
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language, text } = useLanguage();
  const [activeTab, setActiveTab] = useState<CombinationsTab>("fixtures");
  const [startDate, setStartDate] = useState(getLocalDate);
  const [endDate, setEndDate] = useState(() => addDays(getLocalDate(), DEFAULT_LOOKAHEAD_DAYS - 1));
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const [savedStatisticCombinations, setSavedStatisticCombinations] = useState<SavedStatisticCombination[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [guestCombinationsUsed, setGuestCombinationsUsed] = useState(0);
  const [refreshKey, refreshNow] = useAutoRefresh();
  const guestCombinationsRemaining = Math.max(0, GUEST_COMBINATION_LIMIT - guestCombinationsUsed);
  const canGenerateCombination = isAuthenticated || guestCombinationsRemaining > 0;
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

  const recordGuestCombinations = (count: number) => {
    if (isAuthenticated || count <= 0) return;
    const stored = localStorage.getItem(GUEST_COMBINATION_COUNT_KEY);
    const currentCount = stored === null ? 0 : Number(stored);
    if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
      throw new Error(text(
        "Impossible de lire votre quota de combinaisons gratuites.",
        "Unable to read your free combination quota."
      ));
    }
    const nextCount = currentCount + count;
    localStorage.setItem(GUEST_COMBINATION_COUNT_KEY, String(nextCount));
    setGuestCombinationsUsed(nextCount);
  };

  const requireGuestCombinationQuota = () => {
    if (authLoading) {
      setActionError(text("Vérification de votre session…", "Checking your session…"));
      return 0;
    }
    if (isAuthenticated) return Number.POSITIVE_INFINITY;
    let currentCount: number;
    try {
      const stored = localStorage.getItem(GUEST_COMBINATION_COUNT_KEY);
      currentCount = stored === null ? 0 : Number(stored);
      if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
        throw new Error("The stored guest combination count is invalid.");
      }
    } catch (error) {
      console.error("Could not read the guest combination count.", error);
      setActionError(text(
        "Impossible de lire votre quota de combinaisons gratuites.",
        "Unable to read your free combination quota."
      ));
      return 0;
    }
    setGuestCombinationsUsed(currentCount);
    const remaining = Math.max(0, GUEST_COMBINATION_LIMIT - currentCount);
    if (remaining === 0) {
      setActionError(text(
        `Vous avez utilisé vos ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous pour continuer.`,
        `You have used your ${GUEST_COMBINATION_LIMIT} free combinations. Sign in to continue.`
      ));
    }
    return remaining;
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
          .filter(fixture =>
            ["en live", "mi-temps"].includes(fixture.status?.trim().toLocaleLowerCase("fr-FR") ?? "")
          )
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
  const totalPages = Math.max(1, Math.ceil(fixtures.length / PAGE_SIZE));
  const visibleFixtures = fixtures.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const relevantFixtures = liveOnly ? fixtures.filter(fixture => ["en live", "mi-temps"].includes(fixture.status?.trim().toLocaleLowerCase("fr-FR") ?? "")) : fixtures;
  const fixturesForCombination = selectedFixtures.length > 0
    ? selectedFixtures
    : relevantFixtures.slice(0, requestedCount);

  const toggleFixture = (fixtureId: string) => {
    setActionError("");
    setCoupons([]);
    setSafeCoupon(null);
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
      const response = await fetch("/api/coupons/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureIds: fixturesForCombination.map(fixture => fixture.id),
          riskLevel: selectedRiskLevel,
          regenerate,
          couponCount: requestedCoupons,
        }),
      });
      const payload = await response.json() as { coupons?: GeneratedCoupon[]; error?: string };
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
      setActionNotice("");
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de proposer les combinaisons.", "Unable to suggest combinations."));
    } finally {
      setGenerating(false);
    }
  };

  const generateAutoCombination = async (selectedRiskLevel = riskLevel, excludeFixtureIds: string[] = []) => {
    const remaining = requireGuestCombinationQuota();
    if (remaining === 0) return;
    setGenerating(true);
    setActionError("");
    setCoupons([]);
    try {
      const response = await fetch("/api/coupons/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "auto",
          from: startDate,
          to: endDate,
          count: requestedCount,
          riskLevel: selectedRiskLevel,
          excludeFixtureIds,
          includeLive: liveOnly,
          randomSelection,
        }),
      });
      const payload = await response.json() as { coupon?: GeneratedCoupon; error?: string };
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
      saveCouponsForTracking([payload.coupon]);
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
      const response = await fetch("/api/coupons/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "statistic",
          from: startDate,
          to: endDate,
          count: statisticCount,
          riskLevel: selectedRiskLevel,
          market: statisticMarket,
          excludeFixtureIds,
          includeLive: liveOnly,
          randomSelection,
        }),
      });
      const payload = await response.json() as { coupon?: GeneratedStatisticCoupon; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de générer cette combinaison statistique.", "Unable to generate this statistics combination."));
      }
      if (!payload.coupon || !Array.isArray(payload.coupon.matches) || payload.coupon.matches.length !== statisticCount) {
        throw new Error(text("Le service a renvoyé une combinaison invalide.", "The service returned an invalid combination."));
      }
      setRiskLevel(selectedRiskLevel);
      setStatisticCoupon(payload.coupon);
      recordGuestCombinations(1);
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible de générer cette combinaison statistique.", "Unable to generate this statistics combination."));
    } finally {
      setGenerating(false);
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

  const saveCouponsForTracking = (couponsToSave: GeneratedCoupon[]): boolean => {
    try {
      const stored = readGeneratedCombinations();
      const additions = couponsToSave
        .map(coupon => {
          const matchedFixtures = coupon.matches
            .map(match => fixtures.find(fixture => fixture.id === match.fixtureId))
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
        .filter(candidate =>
          !stored.some(combination =>
            JSON.stringify(combination.coupon) === JSON.stringify(candidate.coupon)
          )
        );

      if (additions.length > 0) {
        writeGeneratedCombinations([...stored, ...additions]);
      }
      return true;
    } catch (error) {
      setActionError(error instanceof Error
        ? error.message
        : text("Impossible d’enregistrer le suivi des coupons.", "Unable to save coupon tracking."));
      return false;
    }
  };

  const addGeneratedCombinationToBasket = (coupon: GeneratedCoupon) => {
    setActionError("");
    setActionNotice("");
    if (saveCouponsForTracking([coupon])) {
      setActionNotice(text("Cette combinaison est enregistrée et son résultat est suivi dans le panier.", "This combination is saved and its result is tracked in your basket."));
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
    if (!score) return isFixtureFinished(fixture) ? "unavailable" : "pending";
    const result = settleCouponPick(pick, score);
    return result === null ? "unavailable" : result ? "won" : "lost";
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
    };
    return labels[pick.selection];
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
    <main className="min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {(actionError || actionNotice) && (
          <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            actionError ? "border-red-800 bg-red-950/40 text-red-200" : "border-green-800 bg-green-950/30 text-green-200"
          }`} role={actionError ? "alert" : "status"}>
            {actionError || actionNotice}
          </p>
        )}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {activeTab === "ai" ? text("Combinaisons IA", "AI combinations") : text("Combinaisons à venir", "Upcoming combinations")}
          </h1>
          <p className="mt-2 max-w-3xl text-gray-400">
            {activeTab === "ai"
              ? text(
                "Choisissez une statistique, le nombre de rencontres et un niveau de risque pour créer une combinaison à partir des historiques disponibles.",
                "Choose a statistic, number of fixtures, and risk level to create a combination from available history."
              )
              : text(
                `Choisissez des rencontres programmées pour recevoir ${isAuthenticated ? 3 : Math.min(3, guestCombinationsRemaining)} proposition(s) de combinaison, établies selon les historiques disponibles.`,
                `Choose scheduled fixtures to get ${isAuthenticated ? 3 : Math.min(3, guestCombinationsRemaining)} suggested combination(s) based on available match history.`
              )}
          </p>
          <p className="mt-2 text-xs text-green-400">
            {text("Les rencontres, scores et statuts sont actualisés automatiquement.", "Fixtures, scores, and statuses refresh automatically.")}
          </p>
        </header>

        {!authLoading && !isAuthenticated && (
          <section className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
            guestCombinationsRemaining === 0
              ? "border-amber-700 bg-amber-950/30"
              : "border-green-800 bg-green-950/20"
          }`}>
            <p className="text-sm text-green-100">
              {guestCombinationsRemaining === 0
                ? text(
                  `Vous avez atteint la limite de ${GUEST_COMBINATION_LIMIT} combinaisons gratuites. Connectez-vous pour continuer.`,
                  `You have reached the limit of ${GUEST_COMBINATION_LIMIT} free combinations. Sign in to continue.`
                )
                : text(
                  `Générez jusqu’à ${GUEST_COMBINATION_LIMIT} combinaisons gratuitement sans compte (${guestCombinationsUsed}/${GUEST_COMBINATION_LIMIT} utilisées).`,
                  `Generate up to ${GUEST_COMBINATION_LIMIT} combinations for free without an account (${guestCombinationsUsed}/${GUEST_COMBINATION_LIMIT} used).`
                )}
            </p>
            {guestCombinationsRemaining === 0 && (
              <Link href="/login?next=%2Fcombinations" className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900/40">
                {text("Se connecter pour continuer", "Sign in to continue")}
              </Link>
            )}
          </section>
        )}

        <section className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-200">{text("Période des rencontres", "Fixture date range")}</p>
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

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-gray-800 bg-gray-900 p-1" role="tablist" aria-label={text("Mode de combinaison", "Combination mode")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "fixtures"}
            onClick={() => setActiveTab("fixtures")}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition ${activeTab === "fixtures" ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            {text("Rencontres", "Fixtures")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ai"}
            onClick={() => setActiveTab("ai")}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition ${activeTab === "ai" ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            IA
          </button>
        </div>

        {loadError && (
          <p role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</p>
        )}
        {actionError && (
          <p role="status" className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{actionError}</p>
        )}

        {activeTab === "fixtures" && (
          <>
        <section aria-label={text("Rencontres à venir", "Upcoming fixtures")}>
          {loading && fixtures.length === 0 ? (
            <p role="status" className="py-12 text-center text-gray-400">{text("Chargement des rencontres…", "Loading fixtures…")}</p>
          ) : fixtures.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
              <p className="text-gray-300">{text("Aucune rencontre programmée sur cette période.", "No scheduled fixtures in this period.")}</p>
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
          {fixtures.length > PAGE_SIZE && (
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

        <div className="mt-6 grid gap-4 rounded-xl border border-green-900 bg-green-950/20 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm font-medium text-gray-200">
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
                  ? liveOnly
                    ? "L’IA choisira au hasard parmi les matchs actuellement en direct."
                    : `L’IA choisira au hasard parmi les matchs du ${startDate} au ${endDate}.`
                  : liveOnly
                    ? "L’IA choisira les matchs en direct les mieux notés."
                    : `L’IA choisira les événements les mieux notés entre le ${startDate} et le ${endDate}.`,
                randomSelection
                  ? liveOnly
                    ? "AI will choose randomly from currently live matches."
                    : `AI will choose randomly from matches between ${startDate} and ${endDate}.`
                  : liveOnly
                    ? "AI will select the highest-rated live matches."
                    : `AI will select the highest-rated events between ${startDate} and ${endDate}.`
              )}
            </span>
          </label>
          <div className="flex flex-col gap-3 sm:items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={randomSelection}
                onChange={event => setRandomSelection(event.target.checked)}
                className="h-4 w-4 accent-green-500"
              />
              {text("Sélection aléatoire", "Random selection")}
            </label>
            <button
              type="button"
              onClick={() => setLiveOnly(current => !current)}
              className="rounded-lg border border-green-700 bg-green-950/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-green-300 hover:border-green-500"
            >
              {liveOnly ? text("Matchs en live", "Live matches") : text("Matchs à venir", "Upcoming matches")}
            </button>
            <button
              type="button"
              onClick={() => setShowAutoRiskOptions(current => !current)}
              disabled={authLoading || !canGenerateCombination || loading || relevantFixtures.length === 0 || generating}
              className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating
                ? text("Recherche de la combinaison…", "Finding a combination…")
                : text("Trouver ma combinaison", "Find my combination")}
            </button>
          </div>
        </div>

        {showAutoRiskOptions && (
          <section className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4" aria-label={text("Choisir un niveau de risque automatique", "Choose an automatic risk level")}>
            <h2 className="text-sm font-semibold text-white">{text("Choisissez le risque de votre combinaison", "Choose your combination's risk level")}</h2>
            <p className="mt-1 text-xs text-gray-400">
              {text(
                randomSelection
                  ? liveOnly
                    ? `L’IA choisira au hasard ${requestedCount} rencontre(s) parmi les matchs en direct.`
                    : `L’IA choisira au hasard ${requestedCount} rencontre(s) entre le ${startDate} et le ${endDate}.`
                  : liveOnly
                    ? `L’IA choisira les ${requestedCount} rencontre(s) les mieux notées parmi les matchs en direct.`
                    : `L’IA choisira les ${requestedCount} rencontre(s) les mieux notées entre le ${startDate} et le ${endDate}.`,
                randomSelection
                  ? liveOnly
                    ? `AI will randomly choose ${requestedCount} fixture(s) from live matches.`
                    : `AI will randomly choose ${requestedCount} fixture(s) between ${startDate} and ${endDate}.`
                  : liveOnly
                    ? `AI will choose the ${requestedCount} highest-rated fixtures from live matches.`
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
                    <span className="mt-1 block text-xs text-gray-400">{text(option.description, option.descriptionEn)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowRiskOptions(current => !current)}
            disabled={authLoading || !canGenerateCombination || fixtures.length === 0 || generating}
            className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating
              ? text("Préparation des combinaisons…", "Preparing combinations…")
              : !isAuthenticated && guestCombinationsRemaining < 3
                ? text(`Proposer ${guestCombinationsRemaining} combinaison(s)`, `Suggest ${guestCombinationsRemaining} combination(s)`)
                : text("Proposer 3 combinaisons", "Suggest 3 combinations")}
          </button>
          <button
            type="button"
            onClick={() => addFixturesToBasket(selectedFixtures)}
            disabled={selectedIds.length === 0}
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
                      void generateCombinations(true, 3, level);
                    }}
                    className={`rounded-lg border p-3 text-left transition hover:border-green-600 ${
                      riskLevel === level ? "border-green-700 bg-green-950/30" : "border-gray-700 bg-gray-950"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{text(option.label, option.labelEn)}</span>
                    <span className="mt-1 block text-xs text-gray-400">{text(option.description, option.descriptionEn)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {safeCoupon && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-green-900/70 bg-gradient-to-br from-gray-900 to-gray-950 shadow-lg shadow-black/20" aria-label={text("Combinaison proposée par l’IA", "AI suggested combination")}>
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
                    {match.picks.map(pick => (
                      <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          {renderPickOutcome(safeCoupon, match.fixtureId, pick)}
                          <span className="text-gray-300">{pickLabel(pick)}</span>
                        </span>
                        <span className="rounded-full border border-green-900/80 bg-green-950/40 px-2 py-0.5 font-medium text-green-300">
                          {pick.historicalRate === null
                            ? text("Pas de données", "No data")
                            : `${pick.historicalRate}% (${pick.sampleSize} ${text("match(s)", "matches")})`}
                        </span>
                      </li>
                    ))}
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

        {coupons.length > 0 && (
          <section className="mt-10" aria-label={text("Combinaisons proposées", "Suggested combinations")}>
            <h2 className="mb-4 text-2xl font-bold text-white">{text("Vos combinaisons", "Your combinations")}</h2>
            <p className="mb-4 text-sm text-green-300">
              {text("Retirez les rencontres que vous ne souhaitez pas garder, puis enregistrez chaque combinaison pour suivre son résultat dans le panier.", "Remove any fixtures you do not want, then save each combination to track its result in your basket.")}
              {" "}
              <Link href="/basket" className="font-semibold underline hover:text-green-200">
                {text("Voir le suivi", "View tracking")}
              </Link>
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {coupons.map((coupon, index) => (
                <article key={`${coupon.level}-${index}`} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <h3 className="text-lg font-bold text-white">{coupon.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{coupon.description}</p>
                  <ul className="mt-4 space-y-3">
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
                                <span className="text-gray-300">{pickLabel(pick)}</span>
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
                      if (saveCouponsForTracking([coupon])) {
                        setActionNotice(text(
                          "La combinaison a été enregistrée et son résultat sera suivi dans le panier.",
                          "Combination saved and its result will be tracked in your basket."
                        ));
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
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6" aria-label={text("Générateur IA statistique", "AI statistics generator")}>
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

            {statisticCoupon && (
              <section className="mt-8 border-t border-gray-800 pt-6" aria-label={text("Combinaison statistique générée", "Generated statistics combination")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{statisticCoupon.title}</h3>
                    <p className="mt-1 text-sm text-gray-400">{statisticCoupon.description}</p>
                  </div>
                  <span className="rounded-full border border-green-700 bg-green-950 px-3 py-1 text-sm font-semibold text-green-200">
                    {text("Estimation combinée indicative", "Indicative combined estimate")}: {statisticCoupon.estimatedCombinedRate}%
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
