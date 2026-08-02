// ============================================================================
// iBetPro Sport & League Name Mapping
// Converts raw API sport keys (e.g. "soccer_epl") to human-readable names
// ============================================================================

/** Map of The Odds API sport keys → human-readable names */
export const SPORT_NAMES: Record<string, string> = {
  // Soccer
  soccer_epl: "English Premier League",
  soccer_spain_la_liga: "La Liga",
  soccer_germany_bundesliga: "Bundesliga",
  soccer_italy_serie_a: "Serie A",
  soccer_france_ligue_one: "Ligue 1",
  soccer_portugal_primeira_liga: "Portuguese Primeira Liga",
  soccer_netherlands_eredivisie: "Eredivisie",
  soccer_turkey_super_league: "Turkish Super League",
  soccer_belgium_first_div: "Belgian Pro League",
  soccer_scotland_prem: "Scottish Premiership",
  soccer_championship: "EFL Championship",
  soccer_league_one: "EFL League One",
  soccer_league_two: "EFL League Two",
  soccer_efa_champions_league: "Champions League",
  soccer_efa_europa_league: "Europa League",
  soccer_efa_conference_league: "Conference League",
  soccer_mls: "MLS",
  soccer_br_serie_a: "Brasileirão",
  soccer_argentina_primera: "Argentine Primera",
  soccer_a_league: "A-League",
  soccer_j_league: "J-League",
  soccer_k_league: "K-League",
  soccer_china_super: "Chinese Super League",
  soccer_sa_aa: "South African PSL",
  soccer_kenya_prem: "Kenyan Premier League",
  soccer_ghana_prem: "Ghana Premier League",
  soccer_nigeria_npfl: "Nigerian NPFL",
  // Basketball
  basketball_nba: "NBA",
  basketball_ncaab: "NCAA Basketball",
  basketball_euroleague: "EuroLeague",
  basketball_nbl: "NBL (Australia)",
  // Tennis
  tennis_atp_australian_open: "Australian Open",
  tennis_atp_french_open: "French Open",
  tennis_atp_wimbledon: "Wimbledon",
  tennis_atp_us_open: "US Open",
  tennis_atp_masters: "ATP Masters",
  tennis_wta_masters: "WTA Masters",
  // American Football
  americanfootball_nfl: "NFL",
  americanfootball_ncaaf: "NCAA Football",
  // Cricket
  cricket_ipl: "IPL",
  cricket_big_bash: "Big Bash League",
  cricket_caribbean_prem: "Caribbean Premier League",
  // Rugby
  rugby_union_six_nations: "Six Nations",
  rugby_union_prem: "Premiership Rugby",
  // Hockey
  icehockey_nhl: "NHL",
  icehockey_sweden_hockey_league: "Swedish Hockey League",
  // MMA / Boxing
  mma_mixed_martial_arts: "MMA",
  boxing_boxing: "Boxing",
  // F1
  motorsport_f1: "Formula 1",
};

/** Map of sport category keys → short display names */
export const SPORT_CATEGORY: Record<string, string> = {
  soccer: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  americanfootball: "American Football",
  cricket: "Cricket",
  rugby_union: "Rugby",
  icehockey: "Ice Hockey",
  mma: "MMA",
  boxing: "Boxing",
  motorsport: "Motorsport",
};

/**
 * Convert a raw sport key (e.g. "soccer_epl") to a human-readable name.
 * Falls back to prettifying the key if not found in the map.
 */
export function getSportName(sportKey: string): string {
  if (SPORT_NAMES[sportKey]) return SPORT_NAMES[sportKey];

  // Fallback: prettify the key (e.g. "soccer_epl" → "Soccer Epl")
  return sportKey
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get the sport category from a sport key (e.g. "soccer_epl" → "Football")
 */
export function getSportCategory(sportKey: string): string {
  const category = sportKey.split("_")[0];
  return SPORT_CATEGORY[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Get a short display name for the sport (e.g. "soccer_epl" → "EPL")
 * Useful for compact badges and labels
 */
export function getSportShortName(sportKey: string): string {
  const shortNames: Record<string, string> = {
    soccer_epl: "EPL",
    soccer_spain_la_liga: "La Liga",
    soccer_germany_bundesliga: "Buli",
    soccer_italy_serie_a: "Serie A",
    soccer_france_ligue_one: "Ligue 1",
    soccer_efa_champions_league: "UCL",
    soccer_efa_europa_league: "UEL",
    basketball_nba: "NBA",
    americanfootball_nfl: "NFL",
    icehockey_nhl: "NHL",
  };
  return shortNames[sportKey] || getSportName(sportKey);
}
