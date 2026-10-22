import type { Fixture } from "@/lib/fixtures";
import { resolveCountryCode } from "@/lib/countryCodes";

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

interface CountryRule {
  aliases: readonly string[];
  country: string;
  countryEn: string;
  flag: string;
}

/**
 * Choisit la règle dont l'alias correspondant est le plus long.
 *
 * Un simple « premier alias trouvé » est fragile : « pro league » matchait
 * « saudi pro league », ou « mali » matchait « malaysia ». En privilégiant
 * l'alias le plus long, les correspondances spécifiques gagnent toujours.
 */
function findLongestAliasMatch(rules: readonly CountryRule[], haystack: string): CountryRule | undefined {
  if (!haystack) return undefined;
  let best: CountryRule | undefined;
  let bestLength = 0;
  for (const rule of rules) {
    for (const alias of rule.aliases) {
      if (alias.length > bestLength && haystack.includes(alias)) {
        best = rule;
        bestLength = alias.length;
      }
    }
  }
  return best;
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
  const countries = [
    { aliases: ["england", "angleterre", "premier league", "championship", "fa cup", "efl cup", "carabao cup"], country: "Angleterre", countryEn: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { aliases: ["scotland", "écosse", "ecosse", "scottish premiership", "scottish championship"], country: "Écosse", countryEn: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
    { aliases: ["wales", "pays de galles", "cymru"], country: "Pays de Galles", countryEn: "Wales", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
    { aliases: ["ireland", "irlande", "league of ireland"], country: "Irlande", countryEn: "Ireland", flag: "🇮🇪" },
    { aliases: ["spain", "espagne", "la liga", "laliga", "primera division", "copa del rey", "supercopa de espana"], country: "Espagne", countryEn: "Spain", flag: "🇪🇸" },
    { aliases: ["italy", "italie", "serie a", "serie b", "coppa italia", "supercoppa italiana"], country: "Italie", countryEn: "Italy", flag: "🇮🇹" },
    { aliases: ["germany", "allemagne", "bundesliga", "2. bundesliga", "3. liga", "dfb pokal"], country: "Allemagne", countryEn: "Germany", flag: "🇩🇪" },
    { aliases: ["france", "ligue 1", "ligue 2", "championnat national", "coupe de france", "coupe de la ligue", "trophee des champions"], country: "France", countryEn: "France", flag: "🇫🇷" },
    { aliases: ["netherlands", "pays-bas", "holland", "eredivisie", "eerste divisie", "knvb"], country: "Pays-Bas", countryEn: "Netherlands", flag: "🇳🇱" },
    { aliases: ["portugal", "primeira liga", "liga portugal", "taca de portugal", "campeonato de portugal"], country: "Portugal", countryEn: "Portugal", flag: "🇵🇹" },
    { aliases: ["turkey", "turquie", "super lig", "turkish cup", "turkish 1. lig"], country: "Turquie", countryEn: "Turkey", flag: "🇹🇷" },
    { aliases: ["belgium", "belgique", "jupiler pro league", "belgian pro league", "pro league belgium", "first division a", "challenger pro league"], country: "Belgique", countryEn: "Belgium", flag: "🇧🇪" },
    { aliases: ["austria", "autriche", "aut bundesliga", "austrian bundesliga", "austrian 2. liga"], country: "Autriche", countryEn: "Austria", flag: "🇦🇹" },
    { aliases: ["switzerland", "suisse", "swiss super league", "swiss challenge league"], country: "Suisse", countryEn: "Switzerland", flag: "🇨🇭" },
    { aliases: ["greece", "grèce", "grece", "super league 1", "super league greece", "greek super league"], country: "Grèce", countryEn: "Greece", flag: "🇬🇷" },
    { aliases: ["russia", "russie", "russian premier league", "rpl", "russian cup"], country: "Russie", countryEn: "Russia", flag: "🇷🇺" },
    { aliases: ["ukraine", "premier league ukraine", "ukrainian premier league", "ukrainian cup"], country: "Ukraine", countryEn: "Ukraine", flag: "🇺🇦" },
    { aliases: ["poland", "pologne", "ekstraklasa", "i liga"], country: "Pologne", countryEn: "Poland", flag: "🇵🇱" },
    { aliases: ["czech", "tchequie", "tchéquie", "fortuna liga", "chance liga"], country: "Tchéquie", countryEn: "Czechia", flag: "🇨🇿" },
    { aliases: ["slovakia", "slovaquie", "slovak super liga", "fortuna liga slovakia"], country: "Slovaquie", countryEn: "Slovakia", flag: "🇸🇰" },
    { aliases: ["hungary", "hongrie", "nb i"], country: "Hongrie", countryEn: "Hungary", flag: "🇭🇺" },
    { aliases: ["romania", "roumanie", "liga i romania", "liga ii romania", "cupa romaniei", "superliga romania"], country: "Roumanie", countryEn: "Romania", flag: "🇷🇴" },
    { aliases: ["bulgaria", "bulgarie", "parva liga", "bulgarian first league"], country: "Bulgarie", countryEn: "Bulgaria", flag: "🇧🇬" },
    { aliases: ["croatia", "croatie", "1. hnl", "hnl croatia"], country: "Croatie", countryEn: "Croatia", flag: "🇭🇷" },
    { aliases: ["serbia", "serbie", "super liga srbije"], country: "Serbie", countryEn: "Serbia", flag: "🇷🇸" },
    { aliases: ["slovenia", "slovénie", "slovenie", "prva liga"], country: "Slovénie", countryEn: "Slovenia", flag: "🇸🇮" },
    { aliases: ["bosnia", "bosnie", "premier liga bih"], country: "Bosnie-Herzégovine", countryEn: "Bosnia and Herzegovina", flag: "🇧🇦" },
    { aliases: ["montenegro", "monténégro", "1. cfl"], country: "Monténégro", countryEn: "Montenegro", flag: "🇲🇪" },
    { aliases: ["macedonia", "macédoine", "macedoine"], country: "Macédoine du Nord", countryEn: "North Macedonia", flag: "🇲🇰" },
    { aliases: ["albania", "albanie", "kategoria superiore"], country: "Albanie", countryEn: "Albania", flag: "🇦🇱" },
    { aliases: ["georgia", "géorgie", "georgie", "erovnuli liga"], country: "Géorgie", countryEn: "Georgia", flag: "🇬🇪" },
    { aliases: ["armenia", "arménie", "armenian premier league"], country: "Arménie", countryEn: "Armenia", flag: "🇦🇲" },
    { aliases: ["azerbaijan", "azerbaïdjan", "premier league azerbaijan"], country: "Azerbaïdjan", countryEn: "Azerbaijan", flag: "🇦🇿" },
    { aliases: ["kazakhstan", "premier league kazakhstan", "kazakhstan premier league"], country: "Kazakhstan", countryEn: "Kazakhstan", flag: "🇰🇿" },
    { aliases: ["cyprus", "chypre", "cyta championship"], country: "Chypre", countryEn: "Cyprus", flag: "🇨🇾" },
    { aliases: ["malta", "malte", "maltese premier league"], country: "Malte", countryEn: "Malta", flag: "🇲🇹" },
    { aliases: ["iceland", "islande", "besta deild"], country: "Islande", countryEn: "Iceland", flag: "🇮🇸" },
    { aliases: ["norway", "norvège", "norvege", "eliteserien", "obos ligaen"], country: "Norvège", countryEn: "Norway", flag: "🇳🇴" },
    { aliases: ["sweden", "suède", "suede", "allsvenskan", "superettan"], country: "Suède", countryEn: "Sweden", flag: "🇸🇪" },
    { aliases: ["denmark", "danemark", "danish superliga", "superliga denmark"], country: "Danemark", countryEn: "Denmark", flag: "🇩🇰" },
    { aliases: ["finland", "finlande", "veikkausliiga", "ykkosliiga"], country: "Finlande", countryEn: "Finland", flag: "🇫🇮" },
    { aliases: ["estonia", "estonie", "meistriliiga"], country: "Estonie", countryEn: "Estonia", flag: "🇪🇪" },
    { aliases: ["latvia", "lettonie", "virsliga"], country: "Lettonie", countryEn: "Latvia", flag: "🇱🇻" },
    { aliases: ["lithuania", "lituanie", "lithuanian a lyga"], country: "Lituanie", countryEn: "Lithuania", flag: "🇱🇹" },
    { aliases: ["belarus", "biélorussie", "bielorussie", "vysheyshaya liga"], country: "Biélorussie", countryEn: "Belarus", flag: "🇧🇾" },
    { aliases: ["moldova", "moldavie", "super liga moldova"], country: "Moldavie", countryEn: "Moldova", flag: "🇲🇩" },
    { aliases: ["kosovo", "superliga kosovo"], country: "Kosovo", countryEn: "Kosovo", flag: "🇽🇰" },
    { aliases: ["united states", "états-unis", "etats-unis", "usa", "mls", "usl", "us open cup", "nwsl"], country: "États-Unis", countryEn: "United States", flag: "🇺🇸" },
    { aliases: ["canada", "canadian premier league", "canpl"], country: "Canada", countryEn: "Canada", flag: "🇨🇦" },
    { aliases: ["mexico", "mexique", "liga mx", "ascenso mx", "copa mx"], country: "Mexique", countryEn: "Mexico", flag: "🇲🇽" },
    { aliases: ["costa rica", "cr liga"], country: "Costa Rica", countryEn: "Costa Rica", flag: "🇨🇷" },
    { aliases: ["panama", "panamá", "liga panamena"], country: "Panama", countryEn: "Panama", flag: "🇵🇦" },
    { aliases: ["honduras", "liga nacional honduras"], country: "Honduras", countryEn: "Honduras", flag: "🇭🇳" },
    { aliases: ["guatemala", "liga nacional guatemala"], country: "Guatemala", countryEn: "Guatemala", flag: "🇬🇹" },
    { aliases: ["el salvador", "salvador", "primera division - apertura"], country: "Salvador", countryEn: "El Salvador", flag: "🇸🇻" },
    { aliases: ["jamaica", "jamaica premier league"], country: "Jamaïque", countryEn: "Jamaica", flag: "🇯🇲" },
    { aliases: ["dominican", "république dominicaine", "liga dominicana"], country: "République dominicaine", countryEn: "Dominican Republic", flag: "🇩🇴" },
    { aliases: ["trinidad", "trinité-et-tobago"], country: "Trinité-et-Tobago", countryEn: "Trinidad and Tobago", flag: "🇹🇹" },
    { aliases: ["haiti", "haïti", "ligue haitienne"], country: "Haïti", countryEn: "Haiti", flag: "🇭🇹" },
    { aliases: ["brazil", "brésil", "bresil", "brasileirao", "brasileirão", "serie a brazil", "serie b brazil", "copa do brasil", "paulista", "carioca", "gaucho", "mineiro"], country: "Brésil", countryEn: "Brazil", flag: "🇧🇷" },
    { aliases: ["argentina", "argentine", "liga profesional argentina", "primera division argentina", "copa argentina", "torneo argentino"], country: "Argentine", countryEn: "Argentina", flag: "🇦🇷" },
    { aliases: ["colombia", "colombie", "primera a colombia", "categoria primera a", "copa colombia", "liga betplay"], country: "Colombie", countryEn: "Colombia", flag: "🇨🇴" },
    { aliases: ["chile", "chili", "primera division chile", "copa chile"], country: "Chili", countryEn: "Chile", flag: "🇨🇱" },
    { aliases: ["peru", "pérou", "perou", "liga 1 peru"], country: "Pérou", countryEn: "Peru", flag: "🇵🇪" },
    { aliases: ["uruguay", "primera division uruguay"], country: "Uruguay", countryEn: "Uruguay", flag: "🇺🇾" },
    { aliases: ["paraguay", "primera division paraguay"], country: "Paraguay", countryEn: "Paraguay", flag: "🇵🇾" },
    { aliases: ["ecuador", "equateur", "ligapro", "serie a ecuador"], country: "Équateur", countryEn: "Ecuador", flag: "🇪🇨" },
    { aliases: ["venezuela", "primera division venezuela"], country: "Venezuela", countryEn: "Venezuela", flag: "🇻🇪" },
    { aliases: ["bolivia", "bolivie", "division profesional bolivia"], country: "Bolivie", countryEn: "Bolivia", flag: "🇧🇴" },
    { aliases: ["morocco", "maroc", "botola"], country: "Maroc", countryEn: "Morocco", flag: "🇲🇦" },
    { aliases: ["egypt", "égypte", "egypte", "egyptian premier league"], country: "Égypte", countryEn: "Egypt", flag: "🇪🇬" },
    { aliases: ["algeria", "algérie", "algerie", "ligue 1 algerie", "ligue 1 algérie"], country: "Algérie", countryEn: "Algeria", flag: "🇩🇿" },
    { aliases: ["tunisia", "tunisie", "ligue 1 tunisie", "ligue professionnelle 1"], country: "Tunisie", countryEn: "Tunisia", flag: "🇹🇳" },
    { aliases: ["senegal", "sénégal", "ligue 1 senegal"], country: "Sénégal", countryEn: "Senegal", flag: "🇸🇳" },
    { aliases: ["ivory coast", "côte d'ivoire", "cote d'ivoire", "ligue 1 cote d'ivoire"], country: "Côte d'Ivoire", countryEn: "Ivory Coast", flag: "🇨🇮" },
    { aliases: ["cameroon", "cameroun", "elite one"], country: "Cameroun", countryEn: "Cameroon", flag: "🇨🇲" },
    { aliases: ["nigeria", "npfl", "nigeria premier football league"], country: "Nigeria", countryEn: "Nigeria", flag: "🇳🇬" },
    { aliases: ["ghana", "ghana premier league"], country: "Ghana", countryEn: "Ghana", flag: "🇬🇭" },
    { aliases: ["south africa", "afrique du sud", "dstv premiership", "premiership south africa"], country: "Afrique du Sud", countryEn: "South Africa", flag: "🇿🇦" },
    { aliases: ["kenya", "fkf premier league", "kenyan premier league"], country: "Kenya", countryEn: "Kenya", flag: "🇰🇪" },
    { aliases: ["tanzania", "ligi kuu"], country: "Tanzanie", countryEn: "Tanzania", flag: "🇹🇿" },
    { aliases: ["uganda", "uganda premier league"], country: "Ouganda", countryEn: "Uganda", flag: "🇺🇬" },
    { aliases: ["ethiopia", "éthiopie", "ethiopian premier league"], country: "Éthiopie", countryEn: "Ethiopia", flag: "🇪🇹" },
    { aliases: ["dr congo", "rd congo", "linafoot"], country: "RD Congo", countryEn: "DR Congo", flag: "🇨🇩" },
    { aliases: ["congo", "championnat national congo"], country: "Congo", countryEn: "Congo", flag: "🇨🇬" },
    { aliases: ["mali", "championnat national mali", "ligue 1 mali", "mali premier"], country: "Mali", countryEn: "Mali", flag: "🇲🇱" },
    { aliases: ["burkina", "faso", "burkina faso"], country: "Burkina Faso", countryEn: "Burkina Faso", flag: "🇧🇫" },
    { aliases: ["guinea", "guinée", "ligue 1 guinee", "guinee"], country: "Guinée", countryEn: "Guinea", flag: "🇬🇳" },
    { aliases: ["gabon", "championnat gabon"], country: "Gabon", countryEn: "Gabon", flag: "🇬🇦" },
    { aliases: ["libya", "libye", "libyan premier league"], country: "Libye", countryEn: "Libya", flag: "🇱🇾" },
    { aliases: ["sudan", "soudan", "sudan premier league"], country: "Soudan", countryEn: "Sudan", flag: "🇸🇩" },
    { aliases: ["zambia", "zambie", "super league zambia"], country: "Zambie", countryEn: "Zambia", flag: "🇿🇲" },
    { aliases: ["zimbabwe", "castle lager premier soccer league"], country: "Zimbabwe", countryEn: "Zimbabwe", flag: "🇿🇼" },
    { aliases: ["mozambique", "mocambola"], country: "Mozambique", countryEn: "Mozambique", flag: "🇲🇿" },
    { aliases: ["angola", "girabola"], country: "Angola", countryEn: "Angola", flag: "🇦🇴" },
    { aliases: ["benin", "bénin", "ligue pro benin"], country: "Bénin", countryEn: "Benin", flag: "🇧🇯" },
    { aliases: ["togo", "championnat national togo"], country: "Togo", countryEn: "Togo", flag: "🇹🇬" },
    { aliases: ["niger", "championnat national niger"], country: "Niger", countryEn: "Niger", flag: "🇳🇪" },
    { aliases: ["chad", "tchad"], country: "Tchad", countryEn: "Chad", flag: "🇹🇩" },
    { aliases: ["saudi arabia", "arabie saoudite", "saudi pro league", "saudi league", "saudi super cup"], country: "Arabie saoudite", countryEn: "Saudi Arabia", flag: "🇸🇦" },
    { aliases: ["qatar", "qatar stars league", "qsl"], country: "Qatar", countryEn: "Qatar", flag: "🇶🇦" },
    { aliases: ["united arab emirates", "émirats", "emirats", "uae pro league", "president's cup"], country: "Émirats arabes unis", countryEn: "United Arab Emirates", flag: "🇦🇪" },
    { aliases: ["kuwait", "koweït", "koweit", "kuwait premier league"], country: "Koweït", countryEn: "Kuwait", flag: "🇰🇼" },
    { aliases: ["bahrain", "bahreïn", "bahrein", "bahraini premier league"], country: "Bahreïn", countryEn: "Bahrain", flag: "🇧🇭" },
    { aliases: ["oman", "omani league"], country: "Oman", countryEn: "Oman", flag: "🇴🇲" },
    { aliases: ["jordan", "jordanie", "jordanian pro league"], country: "Jordanie", countryEn: "Jordan", flag: "🇯🇴" },
    { aliases: ["lebanon", "liban", "lebanese premier league"], country: "Liban", countryEn: "Lebanon", flag: "🇱🇧" },
    { aliases: ["syria", "syrie", "syrian premier league"], country: "Syrie", countryEn: "Syria", flag: "🇸🇾" },
    { aliases: ["iraq", "irak", "stars league", "iraqi premier league"], country: "Irak", countryEn: "Iraq", flag: "🇮🇶" },
    { aliases: ["iran", "persian gulf", "persian gulf pro league"], country: "Iran", countryEn: "Iran", flag: "🇮🇷" },
    { aliases: ["israel", "israël", "israeli premier league", "ligat ha'al"], country: "Israël", countryEn: "Israel", flag: "🇮🇱" },
    { aliases: ["japan", "japon", "j1 league", "j2 league", "j3 league", "jleague", "j. league"], country: "Japon", countryEn: "Japan", flag: "🇯🇵" },
    { aliases: ["south korea", "corée du sud", "korea", "k league", "kleague"], country: "Corée du Sud", countryEn: "South Korea", flag: "🇰🇷" },
    { aliases: ["north korea", "corée du nord"], country: "Corée du Nord", countryEn: "North Korea", flag: "🇰🇵" },
    { aliases: ["china", "chine", "chinese super league", "csl"], country: "Chine", countryEn: "China", flag: "🇨🇳" },
    { aliases: ["hong kong", "hong kong premier league"], country: "Hong Kong", countryEn: "Hong Kong", flag: "🇭🇰" },
    { aliases: ["taiwan", "taïwan", "taiwan football premier league"], country: "Taïwan", countryEn: "Taiwan", flag: "🇹🇼" },
    { aliases: ["india", "inde", "indian super league", "isl", "i-league"], country: "Inde", countryEn: "India", flag: "🇮🇳" },
    { aliases: ["indonesia", "indonésie", "liga 1 indonesia", "super league indonesia"], country: "Indonésie", countryEn: "Indonesia", flag: "🇮🇩" },
    { aliases: ["malaysia", "malaisie", "liga super malaysia", "malaysia super league"], country: "Malaisie", countryEn: "Malaysia", flag: "🇲🇾" },
    { aliases: ["singapore", "singapour", "singapore premier league"], country: "Singapour", countryEn: "Singapore", flag: "🇸🇬" },
    { aliases: ["thailand", "thaïlande", "thailande", "thai league", "fa cup - 2nd round"], country: "Thaïlande", countryEn: "Thailand", flag: "🇹🇭" },
    { aliases: ["vietnam", "viêt nam", "viet nam", "v-league", "v.league"], country: "Viêt Nam", countryEn: "Vietnam", flag: "🇻🇳" },
    { aliases: ["philippines", "pfl", "philippines football league"], country: "Philippines", countryEn: "Philippines", flag: "🇵🇭" },
    { aliases: ["uzbekistan", "ouzbékistan", "superliga uzbekistan", "uzbekistan super league"], country: "Ouzbékistan", countryEn: "Uzbekistan", flag: "🇺🇿" },
    { aliases: ["kyrgyzstan", "kirghizistan", "kyrgyz premier league"], country: "Kirghizistan", countryEn: "Kyrgyzstan", flag: "🇰🇬" },
    { aliases: ["tajikistan", "tadjikistan", "tajikistan higher league"], country: "Tadjikistan", countryEn: "Tajikistan", flag: "🇹🇯" },
    { aliases: ["turkmenistan", "turkménistan", "yokary liga"], country: "Turkménistan", countryEn: "Turkmenistan", flag: "🇹🇲" },
    { aliases: ["afghanistan", "afghan premier league"], country: "Afghanistan", countryEn: "Afghanistan", flag: "🇦🇫" },
    { aliases: ["pakistan", "pakistan premier league"], country: "Pakistan", countryEn: "Pakistan", flag: "🇵🇰" },
    { aliases: ["bangladesh", "bangladesh premier league"], country: "Bangladesh", countryEn: "Bangladesh", flag: "🇧🇩" },
    { aliases: ["sri lanka", "sri lanka champions league"], country: "Sri Lanka", countryEn: "Sri Lanka", flag: "🇱🇰" },
    { aliases: ["nepal", "népal", "nepal a division"], country: "Népal", countryEn: "Nepal", flag: "🇳🇵" },
    { aliases: ["australia", "australie", "a-league", "a league", "australian championship"], country: "Australie", countryEn: "Australia", flag: "🇦🇺" },
    { aliases: ["new zealand", "nouvelle-zélande", "nouvelle-zelande", "new zealand national league"], country: "Nouvelle-Zélande", countryEn: "New Zealand", flag: "🇳🇿" },
    { aliases: ["europe", "uefa", "champions league", "europa league", "ligue europa", "conference league", "ligue conference", "euro", "euro qualifiers", "nations league", "ligue des nations", "super cup uefa", "uefa super cup"], country: "Europe", countryEn: "Europe", flag: "🇪🇺" },
    { aliases: ["world cup", "championnat du monde", "fifa world cup", "club world cup", "coupe du monde"], country: "Monde", countryEn: "World", flag: "🌍" },
    { aliases: ["africa", "afrique", "caf", "caf champions league", "coupe d'afrique", "can "], country: "Afrique", countryEn: "Africa", flag: "🌍" },
    { aliases: ["afc", "asian cup", "coupe d'asie", "afc champions league"], country: "Asie", countryEn: "Asia", flag: "🌏" },
    { aliases: ["concacaf", "gold cup", "central american cup", "caribbean cup"], country: "Amérique du Nord", countryEn: "North America", flag: "🌎" },
    { aliases: ["conmebol", "copa libertadores", "copa sudamericana", "libertadores", "sudamericana"], country: "Amérique du Sud", countryEn: "South America", flag: "🌎" },
    { aliases: ["nba", "wnba", "ncaa", "euroleague", "eurobasket", "basketball"], country: "Basketball", countryEn: "Basketball", flag: "🏀" },
  ];
  // 1) Code pays fourni par la source de données (le plus fiable).
  const fromCountryCode = fixture.countryCode
    ? resolveCountryCode(fixture.countryCode)
    : undefined;
  // 2) Repli par pays/équipes déduits, puis par alias de compétition.
  const region = fromCountryCode
    ?? countryFromTeams
    ?? findLongestAliasMatch(countries, normalizedLocation)
    ?? findLongestAliasMatch(countries, normalizedCompetition);
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
