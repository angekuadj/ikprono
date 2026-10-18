import type { Fixture } from "@/lib/fixtures";

const PINNED_COMPETITIONS = [
  ["bundesliga"],
  ["premier league"],
  ["laliga", "la liga", "primera division"],
  ["ligue 1"],
  ["ligue 2"],
  ["coupe de france"],
  ["serie a"],
  ["eredivisie", "dutch league"],
  ["euro", "uefa euro", "uefa european championship"],
  ["champions league", "ligue des champions", "uefa champions league"],
  ["europa league", "ligue europa", "uefa europa league"],
  ["conference league", "ligue conference", "ligue conference europa", "uefa conference league"],
  ["nations league", "ligue des nations uefa", "uefa nations league"],
  ["world cup", "championnat du monde", "fifa world cup"],
] as const;

const OTHER_FEATURED_COMPETITIONS = [
  ["caf champions league", "ligue des champions caf"],
] as const;

export function getFixtureCompetitionName(fixture: Fixture): string {
  return fixture.competition?.trim() || fixture.league.trim() || "Autres compétitions";
}

export interface FixtureCompetitionDisplay {
  key: string;
  country: string;
  countryEn: string;
  flag: string;
  competition: string;
}

export function compareFixtureCompetitionDisplays(
  first: FixtureCompetitionDisplay,
  second: FixtureCompetitionDisplay,
  locale: string
): number {
  return getCompetitionRank(first.competition) - getCompetitionRank(second.competition) ||
    first.flag.localeCompare(second.flag) ||
    first.country.localeCompare(second.country, locale) ||
    first.competition.localeCompare(second.competition, locale);
}

export function isPinnedCompetition(competition: string): boolean {
  return findCompetitionRank(competition, PINNED_COMPETITIONS) !== -1;
}

export function getFixtureCompetitionDisplay(
  fixture: Fixture,
  language: "fr" | "en"
): FixtureCompetitionDisplay {
  const competition = getFixtureCompetitionName(fixture);
  const normalizedLocation = normalize(fixture.location ?? "");
  const normalizedCompetition = normalize(competition);
  const normalizedTeams = normalize(`${fixture.homeTeam} ${fixture.awayTeam}`);
  const countries = [
    { aliases: ["england", "angleterre"], country: "Angleterre", countryEn: "England", flag: "🇬🇧" },
    { aliases: ["spain", "espagne", "la liga", "laliga", "primera division"], country: "Espagne", countryEn: "Spain", flag: "🇪🇸" },
    { aliases: ["italy", "italie", "serie a"], country: "Italie", countryEn: "Italy", flag: "🇮🇹" },
    { aliases: ["germany", "allemagne", "bundesliga"], country: "Allemagne", countryEn: "Germany", flag: "🇩🇪" },
    { aliases: ["france", "ligue 1", "ligue 2", "coupe de france"], country: "France", countryEn: "France", flag: "🇫🇷" },
    { aliases: ["netherlands", "pays-bas", "holland", "eredivisie"], country: "Pays-Bas", countryEn: "Netherlands", flag: "🇳🇱" },
    { aliases: ["portugal", "primeira liga"], country: "Portugal", countryEn: "Portugal", flag: "🇵🇹" },
    { aliases: ["turkey", "turquie", "super lig"], country: "Turquie", countryEn: "Turkey", flag: "🇹🇷" },
    { aliases: ["belgium", "belgique", "pro league"], country: "Belgique", countryEn: "Belgium", flag: "🇧🇪" },
    { aliases: ["europe", "uefa", "champions league", "europa league", "ligue europa", "conference league", "ligue conference", "euro", "nations league", "ligue des nations"], country: "Europe", countryEn: "Europe", flag: "🇪🇺" },
    { aliases: ["world cup", "championnat du monde", "fifa world cup"], country: "Monde", countryEn: "World", flag: "🌍" },
    { aliases: ["africa", "afrique", "caf"], country: "Afrique", countryEn: "Africa", flag: "🌍" },
  ];
  const countryFromTeams = normalizedCompetition === "premier league"
    ? [
        {
          aliases: ["polissya zhytomyr", "polissya", "dynamo kyiv", "dynamo kiev", "kryvbas", "kryvbas kryvyi ri", "lnz cherkasy"],
          country: "Ukraine",
          countryEn: "Ukraine",
          flag: "🇺🇦",
        },
        {
          aliases: ["fc altai oskemen", "altai oskemen", "oskemen", "atyrau"],
          country: "Kazakhstan",
          countryEn: "Kazakhstan",
          flag: "🇰🇿",
        },
      ].find(item => item.aliases.some(alias => normalizedTeams.includes(alias)))
    : undefined;
  const region = countryFromTeams ?? countries.find(item =>
    item.aliases.some(alias => normalizedLocation.includes(alias))
  ) ?? countries.find(item =>
    item.aliases.some(alias => normalizedCompetition.includes(alias))
  );
  const country = region?.country ?? fixture.location?.trim() ?? "International";
  const countryEn = region?.countryEn ?? fixture.location?.trim() ?? "International";

  return {
    key: `${normalize(country)}:${normalize(competition)}`,
    country: language === "fr" ? country : countryEn,
    countryEn,
    flag: region?.flag ?? "🌐",
    competition,
  };
}

export function getCompetitionRank(competition: string): number {
  const pinnedRank = findCompetitionRank(competition, PINNED_COMPETITIONS);
  if (pinnedRank !== -1) return pinnedRank;
  const featuredRank = findCompetitionRank(competition, OTHER_FEATURED_COMPETITIONS);
  return featuredRank === -1
    ? PINNED_COMPETITIONS.length + OTHER_FEATURED_COMPETITIONS.length
    : PINNED_COMPETITIONS.length + featuredRank;
}

function findCompetitionRank(
  competition: string,
  competitions: readonly (readonly string[])[]
): number {
  const normalized = normalize(competition);
  return competitions.findIndex(aliases =>
    aliases.some(alias =>
      alias === "euro"
        ? normalized === alias || normalized.startsWith("euro ")
        : normalized.includes(alias)
    )
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en");
}
