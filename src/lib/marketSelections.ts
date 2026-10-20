import {
  MARKET_ESTIMATES,
  type MarketEstimateId,
  type MarketEstimate,
  type MarketSelection,
} from "@/lib/marketEstimates";
import type { Fixture } from "@/lib/fixtures";
import { readFixtureBasket, writeFixtureBasket } from "@/lib/fixtureBasket";

const MARKET_SELECTIONS_KEY = "ikprono_market_selections";
const MARKET_SELECTIONS_UPDATED_EVENT = "ikprono:market-selections-updated";
const MARKET_IDS = new Set<string>(MARKET_ESTIMATES.map(market => market.id));
const CONFLICTING_MARKETS: Partial<Record<MarketEstimateId, MarketEstimateId[]>> = {
  "home-win": ["draw", "away-win"],
  draw: ["home-win", "away-win", "either-win"],
  "away-win": ["home-win", "draw"],
  "either-win": ["draw"],
  "over-1.5": ["under-1.5"],
  "under-1.5": ["over-1.5"],
  "over-2.5": ["under-2.5"],
  "under-2.5": ["over-2.5"],
  "both-score-yes": ["both-score-no"],
  "both-score-no": ["both-score-yes"],
};

export type MarketSelectionsByFixture = Record<string, MarketSelection[]>;

export function isMarketSelection(value: unknown): value is MarketSelection {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "market" in value &&
    typeof value.market === "string" &&
    MARKET_IDS.has(value.market) &&
    "estimatedRate" in value &&
    typeof value.estimatedRate === "number" &&
    Number.isFinite(value.estimatedRate) &&
    value.estimatedRate > 0 &&
    value.estimatedRate <= 100 &&
    "sampleSize" in value &&
    typeof value.sampleSize === "number" &&
    Number.isSafeInteger(value.sampleSize) &&
    value.sampleSize >= 1 &&
    "estimatedOdds" in value &&
    typeof value.estimatedOdds === "number" &&
    Number.isFinite(value.estimatedOdds) &&
    value.estimatedOdds >= 1;
}

export function readMarketSelections(): MarketSelectionsByFixture {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {};
  }
  const stored = localStorage.getItem(MARKET_SELECTIONS_KEY);
  if (!stored) return {};

  const parsed: unknown = JSON.parse(stored);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Les estimations de marchés enregistrées sont invalides.");
  }

  const result: MarketSelectionsByFixture = {};
  for (const [fixtureId, selections] of Object.entries(parsed)) {
    if (
      fixtureId.length === 0 ||
      !Array.isArray(selections) ||
      !selections.every(isMarketSelection)
    ) {
      throw new Error("Les estimations de marchés enregistrées sont invalides.");
    }
    result[fixtureId] = selections;
  }
  return result;
}

export function writeMarketSelections(selections: MarketSelectionsByFixture): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(MARKET_SELECTIONS_KEY, JSON.stringify(selections));
  window.dispatchEvent(new Event(MARKET_SELECTIONS_UPDATED_EVENT));
}

export function toggleFixtureMarketSelection(
  fixture: Fixture,
  estimate: MarketEstimate
): boolean {
  const basket = readFixtureBasket();
  const alreadyInBasket = basket.some(item => item.id === fixture.id);
  if (!alreadyInBasket && basket.length >= 20) {
    throw new Error("Le panier est limité à 20 matchs.");
  }

  const selections = readMarketSelections();
  const current = selections[fixture.id] ?? [];
  const alreadySelected = current.some(selection => selection.market === estimate.market);
  const next: MarketSelection[] = alreadySelected
    ? current.filter(selection => selection.market !== estimate.market)
    : [
      ...current.filter(selection =>
        selection.market !== estimate.market &&
        !CONFLICTING_MARKETS[estimate.market]?.includes(selection.market)
      ),
      {
        ...estimate,
        estimatedOdds: Number((100 / estimate.estimatedRate).toFixed(2)),
      },
    ];

  if (!alreadyInBasket && !alreadySelected) writeFixtureBasket([...basket, fixture]);
  if (next.length > 0) selections[fixture.id] = next;
  else delete selections[fixture.id];
  writeMarketSelections(selections);
  return !alreadySelected;
}

export function subscribeToMarketSelections(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(MARKET_SELECTIONS_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(MARKET_SELECTIONS_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function isMarketEstimateId(value: string): value is MarketEstimateId {
  return MARKET_IDS.has(value);
}
