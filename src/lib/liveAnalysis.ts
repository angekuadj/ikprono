import type { CouponPick } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";
import {
  evaluateLivePick,
  expectedRemaining,
  livePickProbability,
  PRIOR_GOALS_PER_90,
  PRIOR_STATS_PER_90,
  type LiveMatchState,
} from "@/lib/liveCoupons";

/**
 * « IA » d'analyse des matchs EN DIRECT — moteur expert 100 % local (sans clé API).
 *
 * Croise le score, la durée restante, le rythme observé (tirs, tirs cadrés,
 * corners, cartons) et les moyennes historiques pour produire :
 *  - des constats (phase du match, pression, tendance) en français et anglais ;
 *  - une sélection d'événements **encore ouverts** (ni gagnés, ni perdus),
 *    classés par probabilité de réalisation d'ici le coup de sifflet final,
 *    chacun avec une justification.
 */

export interface BilingualText {
  fr: string;
  en: string;
}

export interface LiveEventRecommendation {
  market: CouponPick["market"];
  selection: string;
  /** Libellé lisible de l'événement, en français et en anglais. */
  label: BilingualText;
  /** Probabilité estimée (0 à 1) que l'événement se réalise d'ici la fin. */
  probability: number;
  rationale: BilingualText;
}

export interface LiveMatchAnalysis {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  /** Score en direct (« 2 - 1 »). */
  score: string;
  minute: number;
  remainingMinutes: number;
  tempo: "offensive" | "balanced" | "closed";
  /** Nombre de buts attendu dans le temps restant. */
  expectedGoalsRemaining: number;
  insights: BilingualText[];
  recommendations: LiveEventRecommendation[];
}

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

/** Décimal FR avec virgule (« 2,5 »), EN avec point (« 2.5 »). */
const lineFr = (line: string | number): string => String(line).replace(".", ",");
const lineEn = (line: string | number): string => String(line);

const butsFr = (count: number): string => (count < 2 ? "but" : "buts");
const butsEn = (count: number): string => (count < 2 ? "goal" : "goals");

const RESULT_LABELS: Record<string, BilingualText> = {
  home: { fr: "Victoire à domicile", en: "Home win" },
  draw: { fr: "Match nul", en: "Draw" },
  away: { fr: "Victoire à l'extérieur", en: "Away win" },
  "home-or-draw": { fr: "Domicile ou nul (1N)", en: "Home or draw (1X)" },
  "away-or-draw": { fr: "Extérieur ou nul (N2)", en: "Away or draw (X2)" },
  "either-win": { fr: "Il y aura un vainqueur", en: "Either team to win" },
};

/** Libellé lisible et traduit d'une sélection (marché + sélection → texte FR/EN). */
function recommendationLabel(market: CouponPick["market"], selection: string): BilingualText {
  if (market === "result") {
    return RESULT_LABELS[selection] ?? { fr: selection, en: selection };
  }

  if (market === "corners") {
    const match = selection.match(/^(over|under)-(\d+(?:\.\d+)?)$/);
    if (match) {
      return match[1] === "over"
        ? { fr: `Plus de ${lineFr(match[2])} corners`, en: `Over ${lineEn(match[2])} corners` }
        : { fr: `Moins de ${lineFr(match[2])} corners`, en: `Under ${lineEn(match[2])} corners` };
    }
  }

  if (market === "goals") {
    const team = selection.match(/^(home|away)-(over|under)-(\d+(?:\.\d+)?)$/);
    if (team) {
      const side = team[1] === "home" ? { fr: "Domicile", en: "Home" } : { fr: "Extérieur", en: "Away" };
      const line = Number(team[3]);
      return team[2] === "over"
        ? { fr: `${side.fr} : plus de ${lineFr(line)} ${butsFr(line)}`, en: `${side.en}: over ${lineEn(line)} ${butsEn(line)}` }
        : { fr: `${side.fr} : moins de ${lineFr(line)} ${butsFr(line)}`, en: `${side.en}: under ${lineEn(line)} ${butsEn(line)}` };
    }
    const total = selection.match(/^(over|under)-(\d+(?:\.\d+)?)$/);
    if (total) {
      const line = Number(total[2]);
      return total[1] === "over"
        ? { fr: `Plus de ${lineFr(line)} ${butsFr(line)}`, en: `Over ${lineEn(line)} ${butsEn(line)}` }
        : { fr: `Moins de ${lineFr(line)} ${butsFr(line)}`, en: `Under ${lineEn(line)} ${butsEn(line)}` };
    }
  }

  return { fr: selection.replace(/-/g, " "), en: selection.replace(/-/g, " ") };
}

/**
 * Famille d'un événement : au plus une recommandation par famille évite
 * d'enchaîner trois variantes de la même ligne (ex. « moins de corners »).
 */
function recommendationFamily(market: CouponPick["market"], selection: string): string {
  if (market === "corners") return `corners:${selection.split("-")[0]}`;
  if (market === "goals") {
    const team = selection.match(/^(home|away)-(over|under)-/);
    if (team) return `goals:${team[1]}:${team[2]}`;
    return `goals:total:${selection.split("-")[0]}`;
  }
  return `${market}:${selection}`;
}

/** Candidates générées pour l'analyse : marchés évaluables sur une live. */
function candidatePicks(state: LiveMatchState): CouponPick[] {
  const pick = (market: CouponPick["market"], selection: string): CouponPick =>
    ({ market, selection, historicalRate: null, sampleSize: 0 }) as CouponPick;

  const picks: CouponPick[] = [
    pick("result", "home"),
    pick("result", "draw"),
    pick("result", "away"),
    pick("result", "home-or-draw"),
    pick("result", "away-or-draw"),
    pick("result", "either-win"),
    ...[0.5, 1.5, 2.5, 3.5].flatMap(line => [
      pick("goals", `over-${line}`),
      pick("goals", `under-${line}`),
    ]),
    ...[0.5, 1.5, 2.5].flatMap(line => [
      pick("goals", `home-over-${line}`),
      pick("goals", `home-under-${line}`),
      pick("goals", `away-over-${line}`),
      pick("goals", `away-under-${line}`),
    ]),
  ];

  if (state.stats.corners !== undefined) {
    for (const line of [4.5, 6.5, 8.5, 10.5]) {
      picks.push(pick("corners", `over-${line}`));
      picks.push(pick("corners", `under-${line}`));
    }
  }

  return picks;
}

function rationaleFor(
  pick: CouponPick,
  state: LiveMatchState,
  fixture: Fixture
): BilingualText {
  const selection = String(pick.selection);
  const totalGoals = state.homeGoals + state.awayGoals;
  const minutes = state.remainingMinutes;

  if (pick.market === "result") {
    const label = RESULT_LABELS[selection] ?? { fr: selection, en: selection };
    return {
      fr: `${label.fr} : score actuel ${state.homeGoals}-${state.awayGoals}, ${minutes} min de jeu restantes. La probabilité intègre les buts attendus d'ici la fin.`,
      en: `${label.en}: current score ${state.homeGoals}-${state.awayGoals}, ${minutes} min remaining. Probability accounts for the goals expected until full time.`,
    };
  }

  if (pick.market === "corners") {
    const line = Number(selection.split("-")[1]);
    const current = state.stats.corners ?? 0;
    const expected = expectedRemaining(PRIOR_STATS_PER_90.corners, current, state);
    return {
      fr: `${current} corner${current > 1 ? "s" : ""} sifflé${current > 1 ? "s" : ""}, environ ${expected.toFixed(1).replace(".", ",")} attendu${expected < 2 ? "" : "s"} dans les ${minutes} min restantes (ligne de ${lineFr(Math.floor(line))},5).`,
      en: `${current} corner${current > 1 ? "s" : ""} so far, about ${expected.toFixed(1)} expected in the remaining ${minutes} min (line of ${Math.floor(line)}.5).`,
    };
  }

  if (pick.market === "goals") {
    const teamMatch = selection.match(/^(home|away)-(over|under)-(\d+(?:\.\d+)?)$/);
    const totalMatch = selection.match(/^(over|under)-(\d+(?:\.\d+)?)$/);
    if (teamMatch) {
      const teamName = teamMatch[1] === "home" ? fixture.homeTeam : fixture.awayTeam;
      const scored = teamMatch[1] === "home" ? state.homeGoals : state.awayGoals;
      const line = Number(teamMatch[3]);
      return {
        fr: `${teamName} : ${scored} ${butsFr(scored)} marqué${scored > 1 ? "s" : ""} pour une ligne de ${lineFr(Math.floor(line))},5, avec ${minutes} min restantes.`,
        en: `${teamName}: ${scored} ${butsEn(scored)} scored against a ${Math.floor(line)}.5 line, with ${minutes} min remaining.`,
      };
    }
    if (totalMatch) {
      const expected = expectedRemaining(PRIOR_GOALS_PER_90, totalGoals, state);
      return {
        fr: `${totalGoals} ${butsFr(totalGoals)} déjà marqué${totalGoals > 1 ? "s" : ""}, environ ${expected.toFixed(1).replace(".", ",")} attendu${expected < 2 ? "" : "s"} dans les ${minutes} min restantes.`,
        en: `${totalGoals} ${butsEn(totalGoals)} so far, about ${expected.toFixed(1)} expected in the remaining ${minutes} min.`,
      };
    }
  }

  return {
    fr: `Événement encore ouvert sur le match ${fixture.homeTeam} - ${fixture.awayTeam}.`,
    en: `Event still open in ${fixture.homeTeam} - ${fixture.awayTeam}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Constats (règles expertes)                                                 */
/* -------------------------------------------------------------------------- */

function buildInsights(
  fixture: Fixture,
  state: LiveMatchState,
  tempo: "offensive" | "balanced" | "closed"
): BilingualText[] {
  const insights: BilingualText[] = [];
  const totalGoals = state.homeGoals + state.awayGoals;
  const margin = Math.abs(state.homeGoals - state.awayGoals);

  if (tempo === "offensive") {
    insights.push({
      fr: "Match offensif : le rythme de but observé dépasse la moyenne — les lignes « plus de buts » restent dangereuses mais réalistes.",
      en: "Open, attacking match: the observed goal pace is above average — «more goals» lines stay risky but realistic.",
    });
  } else if (tempo === "closed") {
    insights.push({
      fr: "Match fermé : peu d'occasions nettes — les lignes « moins de buts » et « pas de but » sont bien placées.",
      en: "Cage-closed match: few clear chances — «under» and «no goal» lines are well positioned.",
    });
  } else {
    insights.push({
      fr: "Match équilibré : le rythme est conforme à la moyenne, aucun marché n'a l'avantage.",
      en: "Balanced match: pace is in line with the average, no market has the edge.",
    });
  }

  const shots = state.stats.shots;
  if (shots !== undefined && state.minute > 0) {
    const shotsPer90 = (shots / state.minute) * 90;
    if (shotsPer90 >= PRIOR_STATS_PER_90.shots * 1.3) {
      insights.push({
        fr: `Pression offensive élevée : ${shots} tirs déjà tentés (soit environ ${Math.round(shotsPer90)} par 90 min).`,
        en: `Heavy attacking pressure: ${shots} shots attempted already (about ${Math.round(shotsPer90)} per 90 min).`,
      });
    } else if (shotsPer90 <= PRIOR_STATS_PER_90.shots * 0.6) {
      insights.push({
        fr: `Faible creation : seulement ${shots} tirs tentés — le match manque d'occasions.`,
        en: `Little creation: only ${shots} shots attempted — the match lacks chances.`,
      });
    }
  }

  const corners = state.stats.corners;
  if (corners !== undefined) {
    const expected = expectedRemaining(PRIOR_STATS_PER_90.corners, corners, state);
    insights.push({
      fr: `${corners} corner${corners > 1 ? "s" : ""} sifflé${corners > 1 ? "s" : ""}, environ ${expected.toFixed(1).replace(".", ",")} attendu${expected < 2 ? "" : "s"} d'ici la fin.`,
      en: `${corners} corner${corners > 1 ? "s" : ""} so far, about ${expected.toFixed(1)} expected before full time.`,
    });
  }

  const cards = state.stats.cards;
  if (cards !== undefined && state.minute > 0) {
    const cardsPer90 = (cards / state.minute) * 90;
    if (cardsPer90 >= PRIOR_STATS_PER_90.cards * 1.5) {
      insights.push({
        fr: `Match tendu : ${cards} cartons déjà distribués — prudence sur les marchés disciplinaires.`,
        en: `Fiery match: ${cards} cards already shown — beware of discipline-related markets.`,
      });
    }
  }

  if (state.remainingMinutes <= 15) {
    insights.push({
      fr: `Fin de match (${state.remainingMinutes} min restantes) : tout événement déjà franchi est définitif, seuls les lignes basses ou un but immédiat restent jouables.`,
      en: `Closing stages (${state.remainingMinutes} min left): anything already crossed is final; only low lines or an immediate goal remain playable.`,
    });
  } else if (state.minute <= 15) {
    insights.push({
      fr: "Début de match : trop tôt pour les lignes hautes — attendez le rythme du match avant de vous engager.",
      en: "Early stage: too soon for high lines — wait for the match rhythm before committing.",
    });
  }

  if (margin >= 2) {
    const leader = state.homeGoals > state.awayGoals ? fixture.homeTeam : fixture.awayTeam;
    insights.push({
      fr: `${leader} mène de ${margin} but(s) : la hiérarchie du match est installée, les remontées sont peu probables.`,
      en: `${leader} lead by ${margin} goal(s): the match hierarchy is set, comebacks are unlikely.`,
    });
  } else if (totalGoals === 0) {
    insights.push({
      fr: "Aucun but pour l'instant : chaque ligne « plus de 0,5 » reste entièrement ouverte.",
      en: "No goals yet: every «over 0.5» line remains fully open.",
    });
  }

  return insights;
}

/* -------------------------------------------------------------------------- */
/* Analyse principale                                                         */
/* -------------------------------------------------------------------------- */

export function analyzeLiveMatch(fixture: Fixture, state: LiveMatchState): LiveMatchAnalysis {
  const totalGoals = state.homeGoals + state.awayGoals;
  const goalsPace = state.minute > 0 ? (totalGoals / state.minute) * 90 : PRIOR_GOALS_PER_90;
  const tempo: LiveMatchAnalysis["tempo"] =
    goalsPace >= PRIOR_GOALS_PER_90 * 1.4
      ? "offensive"
      : goalsPace <= PRIOR_GOALS_PER_90 * 0.6
        ? "closed"
        : "balanced";

  const scored = candidatePicks(state)
    .map(pick => ({ pick, status: evaluateLivePick(pick, state, 0) }))
    .filter(candidate => candidate.status === "open")
    .map(candidate => ({
      pick: candidate.pick,
      probability: livePickProbability(candidate.pick, state),
    }))
    .filter((candidate): candidate is { pick: CouponPick; probability: number } =>
      candidate.probability !== null && candidate.probability > 0)
    .sort((first, second) => second.probability - first.probability);

  // Diversification : au plus un événement par famille (pas trois lignes « moins » identiques).
  const bestByFamily = new Map<string, { pick: CouponPick; probability: number }>();
  for (const candidate of scored) {
    const family = recommendationFamily(candidate.pick.market, String(candidate.pick.selection));
    if (!bestByFamily.has(family)) bestByFamily.set(family, candidate);
  }

  const recommendations = [...bestByFamily.values()].slice(0, 5).map(({ pick, probability }): LiveEventRecommendation => {
    const selection = String(pick.selection);
    return {
      market: pick.market,
      selection,
      label: recommendationLabel(pick.market, selection),
      probability,
      rationale: rationaleFor(pick, state, fixture),
    };
  });

  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    score: fixture.score ?? `${state.homeGoals} - ${state.awayGoals}`,
    minute: state.minute,
    remainingMinutes: state.remainingMinutes,
    tempo,
    expectedGoalsRemaining: expectedRemaining(PRIOR_GOALS_PER_90, totalGoals, state),
    insights: buildInsights(fixture, state, tempo),
    recommendations,
  };
}
