export const BET_TYPES = {
  // Football
  MATCH_WINNER: "Victoire",
  OVER_UNDER: "Plus/Moins de buts",
  BOTH_TEAMS_SCORE: "Les deux marquent",
  CORRECT_SCORE: "Score exact",
  FIRST_GOAL: "Premier but",
  LAST_GOAL: "Dernier but",
  TEAM_TO_SCORE_FIRST: "Première équipe à marquer",
  TEAM_TO_SCORE_LAST: "Dernière équipe à marquer",
  DRAW_NO_BET: "Nul annulant",
  CORNERS: "Corners",
  CORNERS_OVER_UNDER: "Corners Plus/Moins",
  TEAM_CORNERS: "Corners par équipe",
  FIRST_HALF_CORNERS: "Corners en première mi-temps",
  SECOND_HALF_CORNERS: "Corners en deuxième mi-temps",
  TOTAL_SHOTS: "Total de tirs",
  SHOTS_ON_TARGET: "Tirs cadrés",
  SHOTS_OFF_TARGET: "Tirs non cadrés", 
  TEAM_SHOTS: "Tirs par équipe",
  TEAM_SHOTS_ON_TARGET: "Tirs cadrés par équipe",
  PLAYER_SHOTS: "Tirs du joueur",
  PLAYER_SHOTS_ON_TARGET: "Tirs cadrés du joueur",
  GOALKEEPER_SAVES: "Arrêts du gardien",
  FOULS: "Fautes",
  TEAM_FOULS: "Fautes par équipe",
  OFFSIDES: "Hors-jeu",
  THROW_INS: "Touches",
  FREE_KICKS: "Coups francs",
  GOAL_KICKS: "Six mètres",
  POSSESSION: "Possession",
  TOTAL_PASSES: "Total de passes",
  PLAYER_GOAL_ASSIST: "Passeur décisif",
  YELLOW_CARDS: "Cartons jaunes",
  RED_CARDS: "Cartons rouges",
  TOTAL_CARDS: "Total de cartons",
  PENALTIES: "Penalties",
  PENALTY_KICK: "Tir penalty",
  HALFTIME_FULLTIME: "Mi-temps/Fin de match",
  DOUBLE_CHANCE: "Double chance",
  ASIAN_HANDICAP: "Handicap asiatique",
  GOAL_SCORER: "Buteur",
  CLEAN_SHEET: "Match sans but encaissé",
  WIN_TO_NIL: "Victoire à zéro",
  AWAY_WIN_TO_NIL: "Victoire extérieure à zéro",
  HOME_WIN_TO_NIL: "Victoire domicile à zéro",
  HALFTIME_RESULT: "Résultat mi-temps",
  WIN_BOTH_HALVES: "Victoire aux deux mi-temps",
  GOAL_IN_FIRST_15: "But dans les 15 premières minutes",
  GOAL_IN_LAST_15: "But dans les 15 dernières minutes",
  
  // Basketball
  MONEYLINE: "Moneyline",
  SPREAD: "Spread",
  TOTAL_POINTS: "Total de points",
  FIRST_HALF_SPREAD: "Spread 1er mi-temps",
  FIRST_HALF_TOTAL: "Total 1er mi-temps",
  QUARTER_SPREAD: "Spread par quart",
  QUARTER_TOTAL: "Total par quart",
  HIGHEST_SCORING_QUARTER: "Quart le plus prolifique",
  PLAYER_POINTS: "Points joueur",
  PLAYER_REBOUNDS: "Rebonds joueur",
  PLAYER_ASSISTS: "Passes décisives joueur",
  WINNING_MARGIN: "Marge de victoire",
  
  // Tennis
  MATCH_WINNER_TENNIS: "Gagnant du match",
  SET_WINNER: "Gagnant du set",
  TOTAL_GAMES: "Total de jeux",
  HANDICAP_GAMES: "Handicap en jeux",
  CORRECT_SET_SCORE: "Score exact des sets",
  FIRST_SET_WINNER: "Gagnant 1er set",
  TOTAL_SETS: "Total de sets",
  BREAK_POINT: "Point de break",
  ACE: "Ace",
  
  // Rugby
  MATCH_WINNER_RUGBY: "Gagnant du match",
  HANDICAP_RUGBY: "Handicap",
  TOTAL_POINTS_RUGBY: "Total de points",
  FIRST_TRY_SCORER: "Premier essai",
  ANYTIME_TRY_SCORER: "Buteur d'essai anytime",
  WINNING_MARGIN_RUGBY: "Marge de victoire",
  
  // Hockey
  MONEYLINE_HOCKEY: "Moneyline",
  PUCK_LINE: "Puck line",
  TOTAL_GOALS: "Total de buts",
  PERIOD_WINNER: "Gagnant de période",
  FIRST_GOAL_HOCKEY: "Premier but",
  LAST_GOAL_HOCKEY: "Dernier but",
  
  // Boxe/MMA
  FIGHT_WINNER: "Gagnant du combat",
  METHOD_OF_VICTORY: "Méthode de victoire",
  ROUND_BETTING: "Paris sur le round",
  KO_SUBMISSION: "KO/Soumission",
  GOES_DISTANCE: "Combat va au bout",
  POINTS_DECISION: "Décision aux points",
  
  // Esports
  MAP_WINNER: "Gagnant de la map",
  TOTAL_MAPS: "Total de maps",
  FIRST_BLOOD: "First blood",
  FIRST_TO_KILLS: "Premier à X kills",
  OBJECTIVE_BET: "Paris sur objectif",
  PLAYER_KILLS: "Kills joueur",
  TEAM_TO_DESTROY_FIRST: "Première destruction",
  RAMPAGE_BET: "Paris rampage",
  ACE_BET: "Paris ace"
};

export const BET_CATEGORIES = {
  FOOTBALL: {
    name: "Football",
    types: [
      "MATCH_WINNER", "OVER_UNDER", "BOTH_TEAMS_SCORE", "CORRECT_SCORE",
      "FIRST_GOAL", "LAST_GOAL", "TEAM_TO_SCORE_FIRST", "TEAM_TO_SCORE_LAST",
      "DRAW_NO_BET", "CORNERS", "CORNERS_OVER_UNDER", "TEAM_CORNERS",
      "FIRST_HALF_CORNERS", "SECOND_HALF_CORNERS", "TOTAL_SHOTS",
      "SHOTS_ON_TARGET", "SHOTS_OFF_TARGET", "TEAM_SHOTS",
      "TEAM_SHOTS_ON_TARGET", "PLAYER_SHOTS", "PLAYER_SHOTS_ON_TARGET",
      "GOALKEEPER_SAVES", "FOULS", "TEAM_FOULS", "OFFSIDES", "THROW_INS",
      "FREE_KICKS", "GOAL_KICKS", "POSSESSION", "TOTAL_PASSES",
      "PLAYER_GOAL_ASSIST", "YELLOW_CARDS", "RED_CARDS", "TOTAL_CARDS", "PENALTIES",
      "PENALTY_KICK", "HALFTIME_FULLTIME", "DOUBLE_CHANCE", "ASIAN_HANDICAP",
      "GOAL_SCORER", "CLEAN_SHEET", "WIN_TO_NIL", "AWAY_WIN_TO_NIL",
      "HOME_WIN_TO_NIL", "HALFTIME_RESULT", "WIN_BOTH_HALVES",
      "GOAL_IN_FIRST_15", "GOAL_IN_LAST_15"
    ]
  },
  BASKETBALL: {
    name: "Basketball",
    types: [
      "MONEYLINE", "SPREAD", "TOTAL_POINTS", "FIRST_HALF_SPREAD",
      "FIRST_HALF_TOTAL", "QUARTER_SPREAD", "QUARTER_TOTAL",
      "HIGHEST_SCORING_QUARTER", "PLAYER_POINTS", "PLAYER_REBOUNDS",
      "PLAYER_ASSISTS", "WINNING_MARGIN"
    ]
  },
  TENNIS: {
    name: "Tennis",
    types: [
      "MATCH_WINNER_TENNIS", "SET_WINNER", "TOTAL_GAMES",
      "HANDICAP_GAMES", "CORRECT_SET_SCORE", "FIRST_SET_WINNER",
      "TOTAL_SETS", "BREAK_POINT", "ACE"
    ]
  },
  RUGBY: {
    name: "Rugby",
    types: [
      "MATCH_WINNER_RUGBY", "HANDICAP_RUGBY", "TOTAL_POINTS_RUGBY",
      "FIRST_TRY_SCORER", "ANYTIME_TRY_SCORER", "WINNING_MARGIN_RUGBY"
    ]
  },
  HOCKEY: {
    name: "Hockey",
    types: [
      "MONEYLINE_HOCKEY", "PUCK_LINE", "TOTAL_GOALS",
      "PERIOD_WINNER", "FIRST_GOAL_HOCKEY", "LAST_GOAL_HOCKEY"
    ]
  },
  COMBAT: {
    name: "Combat (Boxe/MMA)",
    types: [
      "FIGHT_WINNER", "METHOD_OF_VICTORY", "ROUND_BETTING",
      "KO_SUBMISSION", "GOES_DISTANCE", "POINTS_DECISION"
    ]
  },
  ESPORTS: {
    name: "Esports",
    types: [
      "MAP_WINNER", "TOTAL_MAPS", "FIRST_BLOOD", "FIRST_TO_KILLS",
      "OBJECTIVE_BET", "PLAYER_KILLS", "TEAM_TO_DESTROY_FIRST",
      "RAMPAGE_BET", "ACE_BET"
    ]
  }
};
