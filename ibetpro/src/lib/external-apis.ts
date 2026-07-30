// ============================================================================
// iBetPro Real Sports Data API Integration Layer
// Connects to The Odds API and API-Football for live production data
// ============================================================================

// ==================== CONFIGURATION ====================

const ODDS_API_KEY = process.env.ODDS_API_KEY || "";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || "";
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

// Cache configuration
const CACHE_TTL = 60 * 1000; // 1 minute for live data
const CACHE_TTL_LONG = 5 * 60 * 1000; // 5 minutes for non-live data
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const isLive = key.includes("live");
  const ttl = isLive ? CACHE_TTL : CACHE_TTL_LONG;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (cache.size > 500) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 100; i++) cache.delete(oldest[i][0]);
  }
}

// ==================== THE ODDS API ====================

export interface OddsApiMatch {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}

export interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

/**
 * Fetch upcoming matches with odds from The Odds API
 * Supports: soccer, basketball, tennis, football, baseball, hockey, etc.
 */
export async function fetchUpcomingOdds(
  sport: string = "soccer_epl",
  regions: string = "us,uk,eu",
  markets: string = "h2h,totals"
): Promise<OddsApiMatch[]> {
  const cacheKey = `odds_upcoming_${sport}_${regions}_${markets}`;
  const cached = getCached<OddsApiMatch[]>(cacheKey);
  if (cached) return cached;

  if (!ODDS_API_KEY) {
    console.warn("ODDS_API_KEY not configured - returning empty odds");
    return [];
  }

  try {
    const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;
    const response = await fetch(url, { next: { revalidate: 60 } });

    if (!response.ok) {
      console.error(`Odds API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: OddsApiMatch[] = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Failed to fetch odds:", error);
    return [];
  }
}

/**
 * Fetch all available sports from The Odds API
 */
export async function fetchAvailableSports(): Promise<{ key: string; title: string; group: string }[]> {
  const cacheKey = "odds_sports";
  const cached = getCached<{ key: string; title: string; group: string }[]>(cacheKey);
  if (cached) return cached;

  if (!ODDS_API_KEY) {
    return getFallbackSports();
  }

  try {
    const url = `${ODDS_API_BASE}/sports/?apiKey=${ODDS_API_KEY}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });

    if (!response.ok) return getFallbackSports();

    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch {
    return getFallbackSports();
  }
}

function getFallbackSports(): { key: string; title: string; group: string }[] {
  return [
    { key: "soccer_epl", title: "Premier League", group: "Soccer" },
    { key: "soccer_la_liga", title: "La Liga", group: "Soccer" },
    { key: "soccer_serie_a", title: "Serie A", group: "Soccer" },
    { key: "soccer_bundesliga", title: "Bundesliga", group: "Soccer" },
    { key: "soccer_champions_league", title: "Champions League", group: "Soccer" },
    { key: "basketball_nba", title: "NBA", group: "Basketball" },
    { key: "tennis_atp_wimbledon", title: "Wimbledon", group: "Tennis" },
    { key: "americanfootball_nfl", title: "NFL", group: "American Football" },
    { key: "baseball_mlb", title: "MLB", group: "Baseball" },
    { key: "icehockey_nhl", title: "NHL", group: "Ice Hockey" },
  ];
}

/**
 * Get best odds across all bookmakers for a match
 */
export function getBestOdds(match: OddsApiMatch): {
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  bestBookmaker: string;
} {
  let bestHomeOdds = 0;
  let bestDrawOdds = 0;
  let bestAwayOdds = 0;
  let bestOverOdds = 0;
  let bestUnderOdds = 0;
  let overUnderLine: number | null = null;
  let bestBookmaker = "";

  for (const bookmaker of match.bookmakers) {
    for (const market of bookmaker.markets) {
      if (market.key === "h2h") {
        for (const outcome of market.outcomes) {
          if (outcome.name === match.home_team && outcome.price > bestHomeOdds) {
            bestHomeOdds = outcome.price;
            bestBookmaker = bookmaker.title;
          }
          if (outcome.name === "Draw" && outcome.price > bestDrawOdds) {
            bestDrawOdds = outcome.price;
          }
          if (outcome.name === match.away_team && outcome.price > bestAwayOdds) {
            bestAwayOdds = outcome.price;
          }
        }
      }
      if (market.key === "totals") {
        for (const outcome of market.outcomes) {
          if (outcome.name === "Over" && outcome.price > bestOverOdds) {
            bestOverOdds = outcome.price;
            overUnderLine = outcome.point ?? 2.5;
          }
          if (outcome.name === "Under" && outcome.price > bestUnderOdds) {
            bestUnderOdds = outcome.price;
            overUnderLine = outcome.point ?? 2.5;
          }
        }
      }
    }
  }

  return {
    homeOdds: bestHomeOdds || 2.0,
    drawOdds: bestDrawOdds || null,
    awayOdds: bestAwayOdds || 2.0,
    overUnderLine,
    overOdds: bestOverOdds || null,
    underOdds: bestUnderOdds || null,
    bestBookmaker,
  };
}

/**
 * Get odds from all bookmakers for comparison
 */
export function getOddsComparison(match: OddsApiMatch): {
  bookmaker: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
}[] {
  const comparison: { bookmaker: string; homeOdds: number; drawOdds: number | null; awayOdds: number }[] = [];

  for (const bookmaker of match.bookmakers) {
    for (const market of bookmaker.markets) {
      if (market.key === "h2h") {
        let homeOdds = 0;
        let drawOdds: number | null = null;
        let awayOdds = 0;

        for (const outcome of market.outcomes) {
          if (outcome.name === match.home_team) homeOdds = outcome.price;
          if (outcome.name === "Draw") drawOdds = outcome.price;
          if (outcome.name === match.away_team) awayOdds = outcome.price;
        }

        if (homeOdds > 0 && awayOdds > 0) {
          comparison.push({ bookmaker: bookmaker.title, homeOdds, drawOdds, awayOdds });
        }
      }
    }
  }

  return comparison.sort((a, b) => a.homeOdds - b.homeOdds);
}

// ==================== API-FOOTBALL ====================

export interface FootballTeamStats {
  team: { id: number; name: string; logo: string };
  league: { id: number; name: string; season: number };
  fixtures: { played: { total: number; home: number; away: number } };
  goals: {
    for: { total: { total: number; home: number; away: number }; average: { total: string; home: string; away: string } };
    against: { total: { total: number; home: number; away: number }; average: { total: string; home: string; away: string } };
  };
  biggest: { streak: { wins: number; draws: number; losses: number } };
  form: string;
  lineups: { formation: string; played: number }[];
  cards: { red: { total: number }; yellow: { total: number } };
}

export interface FootballMatch {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number; name: string; season: number };
  teams: { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null }; fulltime: { home: number | null; away: number | null } };
}

/**
 * Fetch team statistics from API-Football
 */
export async function fetchTeamStats(
  leagueId: number,
  season: number,
  teamId: number
): Promise<FootballTeamStats | null> {
  const cacheKey = `football_stats_${leagueId}_${season}_${teamId}`;
  const cached = getCached<FootballTeamStats>(cacheKey);
  if (cached) return cached;

  if (!API_FOOTBALL_KEY) {
    console.warn("API_FOOTBALL_KEY not configured");
    return null;
  }

  try {
    const url = `${API_FOOTBALL_BASE}/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`;
    const response = await fetch(url, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
      next: { revalidate: 300 },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.response) {
      setCache(cacheKey, data.response);
      return data.response;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch team stats:", error);
    return null;
  }
}

/**
 * Fetch live/in-progress matches from API-Football
 */
export async function fetchLiveMatches(): Promise<FootballMatch[]> {
  const cacheKey = "football_live";
  const cached = getCached<FootballMatch[]>(cacheKey);
  if (cached) return cached;

  if (!API_FOOTBALL_KEY) return [];

  try {
    const url = `${API_FOOTBALL_BASE}/fixtures?live=all`;
    const response = await fetch(url, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
      next: { revalidate: 30 },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const matches = data.response || [];
    setCache(cacheKey, matches);
    return matches;
  } catch (error) {
    console.error("Failed to fetch live matches:", error);
    return [];
  }
}

/**
 * Fetch upcoming fixtures from API-Football
 */
export async function fetchUpcomingFixtures(
  leagueId: number,
  season: number,
  next: number = 10
): Promise<FootballMatch[]> {
  const cacheKey = `football_fixtures_${leagueId}_${season}_${next}`;
  const cached = getCached<FootballMatch[]>(cacheKey);
  if (cached) return cached;

  if (!API_FOOTBALL_KEY) return [];

  try {
    const url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&next=${next}`;
    const response = await fetch(url, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const matches = data.response || [];
    setCache(cacheKey, matches);
    return matches;
  } catch (error) {
    console.error("Failed to fetch fixtures:", error);
    return [];
  }
}

/**
 * Fetch head-to-head records between two teams
 */
export async function fetchHeadToHead(
  team1Id: number,
  team2Id: number,
  last: number = 10
): Promise<FootballMatch[]> {
  const cacheKey = `football_h2h_${team1Id}_${team2Id}`;
  const cached = getCached<FootballMatch[]>(cacheKey);
  if (cached) return cached;

  if (!API_FOOTBALL_KEY) return [];

  try {
    const url = `${API_FOOTBALL_BASE}/fixtures/headtohead?h2h=${team1Id}-${team2Id}&last=${last}`;
    const response = await fetch(url, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const matches = data.response || [];
    setCache(cacheKey, matches);
    return matches;
  } catch (error) {
    console.error("Failed to fetch H2H:", error);
    return [];
  }
}

// ==================== DATA TRANSFORMERS ====================

/**
 * Transform Odds API match data to our internal match format
 */
export function transformOddsApiMatch(match: OddsApiMatch): {
  externalId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  status: string;
} {
  const bestOdds = getBestOdds(match);

  return {
    externalId: match.id,
    sport: mapSportKey(match.sport_key),
    league: match.sport_title,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    commenceTime: match.commence_time,
    homeOdds: bestOdds.homeOdds,
    drawOdds: bestOdds.drawOdds,
    awayOdds: bestOdds.awayOdds,
    overUnderLine: bestOdds.overUnderLine,
    overOdds: bestOdds.overOdds,
    underOdds: bestOdds.underOdds,
    status: "upcoming",
  };
}

/**
 * Transform API-Football match data to our internal format
 */
export function transformFootballMatch(match: FootballMatch): {
  externalId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
} {
  return {
    externalId: `football_${match.fixture.id}`,
    sport: "football",
    league: match.league.name,
    homeTeam: match.teams.home.name,
    awayTeam: match.teams.away.name,
    commenceTime: match.fixture.date,
    homeScore: match.goals.home,
    awayScore: match.goals.away,
    minute: match.fixture.status.elapsed,
    status: mapFootballStatus(match.fixture.status.short),
  };
}

/**
 * Transform API-Football team stats to our internal format
 */
export function transformTeamStats(stats: FootballTeamStats): {
  teamName: string;
  sport: string;
  league: string;
  season: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string;
  homeRecord: string;
  awayRecord: string;
  attackRating: number;
  defenseRating: number;
  overallRating: number;
  eloRating: number;
  xgFor: number;
  xgAgainst: number;
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
  possessionAvg: number;
  cornersPerGame: number;
  cardsPerGame: number;
} {
  const played = stats.fixtures.played.total;
  const homePlayed = stats.fixtures.played.home;
  const awayPlayed = stats.fixtures.played.away;

  // Parse form string (e.g., "WWDLW")
  const formStr = stats.form || "";

  // Calculate wins/draws/losses from form
  let wins = 0, draws = 0, losses = 0;
  for (const c of formStr) {
    if (c === "W") wins++;
    else if (c === "D") draws++;
    else if (c === "L") losses++;
  }

  // If we have total played, use that for calculations
  const totalGoalsFor = stats.goals.for.total.total || 0;
  const totalGoalsAgainst = stats.goals.against.total.total || 0;

  // Calculate ratings based on actual performance
  const goalDiff = totalGoalsFor - totalGoalsAgainst;
  const goalDiffPerGame = played > 0 ? goalDiff / played : 0;

  const attackRating = Math.round(Math.min(99, Math.max(30,
    60 + (totalGoalsFor / Math.max(1, played)) * 10 + goalDiffPerGame * 3
  )));

  const defenseRating = Math.round(Math.min(99, Math.max(30,
    60 - (totalGoalsAgainst / Math.max(1, played)) * 8 + goalDiffPerGame * 2
  )));

  const overallRating = Math.round((attackRating + defenseRating) / 2 + goalDiffPerGame * 2);
  const eloRating = Math.round(1500 + goalDiffPerGame * 50 + (wins / Math.max(1, played)) * 200);

  // Home and away records
  const homeGoalsFor = stats.goals.for.total.home || 0;
  const homeGoalsAgainst = stats.goals.against.total.home || 0;
  const awayGoalsFor = stats.goals.for.total.away || 0;
  const awayGoalsAgainst = stats.goals.against.total.away || 0;

  // Estimate home/away wins from form (simplified)
  const homeWinRate = homePlayed > 0 ? Math.min(0.9, Math.max(0.1, (homeGoalsFor - homeGoalsAgainst) / Math.max(1, homePlayed) * 0.3 + 0.4)) : 0.5;
  const awayWinRate = awayPlayed > 0 ? Math.min(0.9, Math.max(0.1, (awayGoalsFor - awayGoalsAgainst) / Math.max(1, awayPlayed) * 0.3 + 0.3)) : 0.4;

  const homeWins = Math.round(homePlayed * homeWinRate);
  const homeDraws = Math.round(homePlayed * 0.2);
  const homeLosses = homePlayed - homeWins - homeDraws;

  const awayWins = Math.round(awayPlayed * awayWinRate);
  const awayDraws = Math.round(awayPlayed * 0.2);
  const awayLosses = awayPlayed - awayWins - awayDraws;

  return {
    teamName: stats.team.name,
    sport: "football",
    league: stats.league.name,
    season: String(stats.league.season),
    matchesPlayed: played,
    wins,
    draws,
    losses,
    goalsFor: totalGoalsFor,
    goalsAgainst: totalGoalsAgainst,
    form: formStr,
    homeRecord: `${homeWins}-${homeDraws}-${homeLosses}`,
    awayRecord: `${awayWins}-${awayDraws}-${awayLosses}`,
    attackRating,
    defenseRating,
    overallRating: Math.round(Math.min(99, Math.max(30, overallRating))),
    eloRating,
    xgFor: totalGoalsFor * 0.92, // Approximate xG from actual goals
    xgAgainst: totalGoalsAgainst * 1.05,
    shotsPerGame: 0,
    shotsOnTargetPerGame: 0,
    possessionAvg: 50,
    cornersPerGame: 0,
    cardsPerGame: (stats.cards.red.total + stats.cards.yellow.total) / Math.max(1, played),
  };
}

// ==================== SPORT MAPPING ====================

function mapSportKey(key: string): string {
  if (key.startsWith("soccer")) return "football";
  if (key.startsWith("basketball")) return "basketball";
  if (key.startsWith("tennis")) return "tennis";
  if (key.startsWith("americanfootball")) return "american_football";
  if (key.startsWith("baseball")) return "baseball";
  if (key.startsWith("icehockey")) return "ice_hockey";
  return "other";
}

function mapFootballStatus(status: string): string {
  const liveStatuses = ["1H", "2H", "HT", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
  const finishedStatuses = ["FT", "AET", "PEN", "WO", "AWD"];
  const upcomingStatuses = ["TBD", "NS", "PST", "CANC"];

  if (liveStatuses.includes(status)) return "live";
  if (finishedStatuses.includes(status)) return "finished";
  if (upcomingStatuses.includes(status)) return "upcoming";
  return "upcoming";
}

// ==================== SPORT KEY MAPPINGS ====================

export const SPORT_KEYS: Record<string, string[]> = {
  football: [
    "soccer_epl", "soccer_la_liga", "soccer_serie_a", "soccer_bundesliga",
    "soccer_champions_league", "soccer_europa_league", "soccer_ligue_one",
    "soccer_primeira_liga", "soccer_eredivisie", "soccer_efl_champ",
  ],
  basketball: [
    "basketball_nba", "basketball_euroleague", "basketball_ncaab",
  ],
  tennis: [
    "tennis_atp_wimbledon", "tennis_atp_french_open", "tennis_atp_us_open",
    "tennis_atp_australian_open", "tennis_atp_masters",
  ],
  american_football: [
    "americanfootball_nfl", "americanfootball_ncaaf",
  ],
  baseball: [
    "baseball_mlb",
  ],
  ice_hockey: [
    "icehockey_nhl",
  ],
};

/**
 * Fetch odds for multiple sports
 */
export async function fetchMultiSportOdds(
  sports: string[] = ["soccer_epl", "basketball_nba"],
  regions: string = "us,uk,eu",
  markets: string = "h2h,totals"
): Promise<OddsApiMatch[]> {
  const results = await Promise.allSettled(
    sports.map(sport => fetchUpcomingOdds(sport, regions, markets))
  );

  const allMatches: OddsApiMatch[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allMatches.push(...result.value);
    }
  }

  return allMatches;
}
