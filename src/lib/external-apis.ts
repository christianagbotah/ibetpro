// ============================================================================
// iBetPro External API Integration Layer
// Real API integration with The Odds API, API-Football, and SportMonks
// ============================================================================

import { config, getPrimaryDataSource } from "./config";

// ==================== TYPE DEFINITIONS ====================

export interface ExternalOdds {
  id: string;
  sportKey: string;
  sportTitle: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookmakers: ExternalBookmaker[];
}

export interface ExternalBookmaker {
  key: string;
  title: string;
  markets: ExternalMarket[];
}

export interface ExternalMarket {
  key: string;
  outcomes: ExternalOutcome[];
}

export interface ExternalOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface ExternalTeamStats {
  teamId: number;
  teamName: string;
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
  xgFor: number;
  xgAgainst: number;
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
  possessionAvg: number;
  cornersPerGame: number;
  cardsPerGame: number;
  eloRating: number;
}

export interface ExternalFixture {
  fixtureId: number;
  league: string;
  leagueId: number;
  season: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  commenceTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
}

export interface SyncResult {
  matchesSynced: number;
  teamStatsSynced: number;
  errors: string[];
  source: string;
  timestamp: Date;
}

// ==================== THE ODDS API ====================

export async function fetchOddsApiUpcoming(
  sport: string = "soccer_epl",
  regions: string = "uk,eu,us",
  markets: string = "h2h,totals"
): Promise<ExternalOdds[]> {
  const apiKey = config.api.oddsApiKey;
  if (!apiKey) {
    throw new Error("The Odds API key not configured. Set ODDS_API_KEY in .env.local");
  }

  const url = `${config.apiUrls.oddsApi}/sports/${sport}/odds/?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;

  const response = await fetch(url, { next: { revalidate: 300 } });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`The Odds API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchOddsApiSports(): Promise<Array<{ key: string; title: string; group: string }>> {
  const apiKey = config.api.oddsApiKey;
  if (!apiKey) {
    throw new Error("The Odds API key not configured");
  }

  const url = `${config.apiUrls.oddsApi}/sports/?apiKey=${apiKey}`;
  const response = await fetch(url, { next: { revalidate: 3600 } });

  if (!response.ok) {
    throw new Error(`The Odds API error (${response.status})`);
  }

  return response.json();
}

export function convertOddsApiToMatch(odds: ExternalOdds): {
  externalId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  commenceTime: string;
  apiSource: string;
} {
  let homeOdds = 0;
  let drawOdds: number | null = null;
  let awayOdds = 0;
  let overOdds: number | null = null;
  let underOdds: number | null = null;
  let overUnderLine: number | null = null;

  for (const bookmaker of odds.bookmakers) {
    for (const market of bookmaker.markets) {
      if (market.key === "h2h") {
        for (const outcome of market.outcomes) {
          if (outcome.name === odds.homeTeam) {
            if (!homeOdds || outcome.price > homeOdds) homeOdds = outcome.price;
          } else if (outcome.name === odds.awayTeam) {
            if (!awayOdds || outcome.price > awayOdds) awayOdds = outcome.price;
          } else if (outcome.name === "Draw") {
            if (!drawOdds || outcome.price > drawOdds) drawOdds = outcome.price;
          }
        }
      }
      if (market.key === "totals") {
        for (const outcome of market.outcomes) {
          if (outcome.name === "Over") {
            if (!overOdds || outcome.price > overOdds) overOdds = outcome.price;
            if (outcome.point) overUnderLine = outcome.point;
          }
          if (outcome.name === "Under") {
            if (!underOdds || outcome.price > underOdds) underOdds = outcome.price;
          }
        }
      }
    }
  }

  if (!homeOdds || !awayOdds) {
    homeOdds = homeOdds || 2.0;
    awayOdds = awayOdds || 2.0;
  }

  return {
    externalId: odds.id,
    sport: odds.sportKey,
    league: odds.sportTitle,
    homeTeam: odds.homeTeam,
    awayTeam: odds.awayTeam,
    homeOdds,
    drawOdds,
    awayOdds,
    overUnderLine,
    overOdds,
    underOdds,
    commenceTime: odds.commenceTime,
    apiSource: "odds-api",
  };
}

// ==================== API-FOOTBALL ====================

export async function fetchApiFootballFixtures(
  league: number = 39,
  season: number = 2024
): Promise<ExternalFixture[]> {
  const apiKey = config.api.apiFootballKey;
  if (!apiKey) {
    throw new Error("API-Football key not configured. Set API_FOOTBALL_KEY in .env.local");
  }

  const url = `${config.apiUrls.apiFootball}/fixtures?league=${league}&season=${season}`;
  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`API-Football error (${response.status})`);
  }

  const data = await response.json();
  return (data.response || []).map((item: Record<string, unknown>) => {
    const fixture = item.fixture as Record<string, unknown>;
    const teams = item.teams as Record<string, Record<string, unknown>>;
    const goals = item.goals as Record<string, number | null>;
    const leagueInfo = item.league as Record<string, unknown>;

    return {
      fixtureId: fixture.id as number,
      league: (leagueInfo.name as string) || "Unknown",
      leagueId: leagueInfo.id as number,
      season: leagueInfo.season as number,
      homeTeam: (teams.home?.name as string) || "Unknown",
      awayTeam: (teams.away?.name as string) || "Unknown",
      homeTeamId: (teams.home?.id as number) || 0,
      awayTeamId: (teams.away?.id as number) || 0,
      commenceTime: (fixture.date as string) || new Date().toISOString(),
      status: convertApiFootballStatus((fixture.status as Record<string, unknown>)?.short as string),
      homeScore: goals?.home,
      awayScore: goals?.away,
      minute: ((fixture.status as Record<string, unknown>)?.elapsed as number) || null,
    };
  });
}

export async function fetchApiFootballTeamStats(
  teamId: number,
  league: number = 39,
  season: number = 2024
): Promise<ExternalTeamStats | null> {
  const apiKey = config.api.apiFootballKey;
  if (!apiKey) {
    throw new Error("API-Football key not configured");
  }

  const url = `${config.apiUrls.apiFootball}/teams/statistics?league=${league}&season=${season}&team=${teamId}`;
  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 1800 },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const stats = data.response;
  if (!stats) return null;

  const form = stats.form || "";
  const homeRecord = stats.home ? `${stats.home.wins}-${stats.home.draws}-${stats.home.loses}` : "0-0-0";
  const awayRecord = stats.away ? `${stats.away.wins}-${stats.away.draws}-${stats.away.loses}` : "0-0-0";
  const matchesPlayed = stats.fixtures?.played || 0;
  const wins = stats.fixtures?.wins?.total || 0;
  const draws = stats.fixtures?.draws?.total || 0;
  const losses = stats.fixtures?.loses?.total || 0;

  const attackRating = matchesPlayed > 0
    ? Math.min(100, ((stats.goals?.for?.total?.total || 0) / matchesPlayed) * 20)
    : 50;
  const defenseRating = matchesPlayed > 0
    ? Math.min(100, 100 - ((stats.goals?.against?.total?.total || 0) / matchesPlayed) * 20)
    : 50;
  const overallRating = (attackRating + defenseRating) / 2;

  return {
    teamId,
    teamName: stats.team?.name || "Unknown",
    league: stats.league?.name || "Unknown",
    season: `${season}`,
    matchesPlayed,
    wins,
    draws,
    losses,
    goalsFor: stats.goals?.for?.total?.total || 0,
    goalsAgainst: stats.goals?.against?.total?.total || 0,
    form,
    homeRecord,
    awayRecord,
    attackRating: Math.round(attackRating * 10) / 10,
    defenseRating: Math.round(defenseRating * 10) / 10,
    overallRating: Math.round(overallRating * 10) / 10,
    xgFor: stats.goals?.for?.total?.total || 0,
    xgAgainst: stats.goals?.against?.total?.total || 0,
    shotsPerGame: matchesPlayed > 0 ? Math.round(((stats.shots?.total || 0) / matchesPlayed) * 10) / 10 : 0,
    shotsOnTargetPerGame: matchesPlayed > 0 ? Math.round(((stats.shots?.on || 0) / matchesPlayed) * 10) / 10 : 0,
    possessionAvg: stats.possession ? parseFloat(stats.possession as unknown as string) || 50 : 50,
    cornersPerGame: matchesPlayed > 0 ? Math.round(((stats.corners || 0) / matchesPlayed) * 10) / 10 : 0,
    cardsPerGame: matchesPlayed > 0
      ? Math.round((((stats.cards?.yellow?.total || 0) + (stats.cards?.red?.total || 0)) / matchesPlayed) * 10) / 10
      : 0,
    eloRating: 1500 + (wins - losses) * 15,
  };
}

export async function fetchApiFootballLiveFixtures(): Promise<ExternalFixture[]> {
  const apiKey = config.api.apiFootballKey;
  if (!apiKey) {
    throw new Error("API-Football key not configured");
  }

  const url = `${config.apiUrls.apiFootball}/fixtures?live=all`;
  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`API-Football live error (${response.status})`);
  }

  const data = await response.json();
  return (data.response || []).map((item: Record<string, unknown>) => {
    const fixture = item.fixture as Record<string, unknown>;
    const teams = item.teams as Record<string, Record<string, unknown>>;
    const goals = item.goals as Record<string, number | null>;
    const leagueInfo = item.league as Record<string, unknown>;

    return {
      fixtureId: fixture.id as number,
      league: (leagueInfo.name as string) || "Unknown",
      leagueId: leagueInfo.id as number,
      season: leagueInfo.season as number,
      homeTeam: (teams.home?.name as string) || "Unknown",
      awayTeam: (teams.away?.name as string) || "Unknown",
      homeTeamId: (teams.home?.id as number) || 0,
      awayTeamId: (teams.away?.id as number) || 0,
      commenceTime: (fixture.date as string) || new Date().toISOString(),
      status: "live",
      homeScore: goals?.home,
      awayScore: goals?.away,
      minute: ((fixture.status as Record<string, unknown>)?.elapsed as number) || null,
    };
  });
}

function convertApiFootballStatus(short: string): string {
  switch (short) {
    case "1H": case "2H": case "HT": case "ET": case "BT": case "P":
      return "live";
    case "FT": case "AET": case "PEN": case "AWD": case "WO":
      return "finished";
    case "SUSP": case "INT": case "PST": case "CANC": case "ABD":
      return "postponed";
    case "TBD": case "NS":
    default:
      return "upcoming";
  }
}

// ==================== API HEALTH CHECK ====================

export interface ApiHealthStatus {
  oddsApi: { connected: boolean; remainingRequests?: number; error?: string };
  apiFootball: { connected: boolean; remainingRequests?: number; error?: string };
  sportmonks: { connected: boolean; error?: string };
  primarySource: string;
}

export async function checkApiHealth(): Promise<ApiHealthStatus> {
  const health: ApiHealthStatus = {
    oddsApi: { connected: false },
    apiFootball: { connected: false },
    sportmonks: { connected: false },
    primarySource: getPrimaryDataSource(),
  };

  if (config.api.oddsApiKey) {
    try {
      const res = await fetch(
        `${config.apiUrls.oddsApi}/sports/?apiKey=${config.api.oddsApiKey}`,
        { next: { revalidate: 0 } }
      );
      health.oddsApi.connected = res.ok;
      health.oddsApi.remainingRequests = res.headers.get("x-requests-remaining")
        ? parseInt(res.headers.get("x-requests-remaining")!)
        : undefined;
      if (!res.ok) health.oddsApi.error = `HTTP ${res.status}`;
    } catch (error) {
      health.oddsApi.error = error instanceof Error ? error.message : "Connection failed";
    }
  }

  if (config.api.apiFootballKey) {
    try {
      const res = await fetch(`${config.apiUrls.apiFootball}/status`, {
        headers: { "x-apisports-key": config.api.apiFootballKey },
        next: { revalidate: 0 },
      });
      health.apiFootball.connected = res.ok;
      if (res.ok) {
        const data = await res.json();
        health.apiFootball.remainingRequests = data.response?.requests?.current;
      }
      if (!res.ok) health.apiFootball.error = `HTTP ${res.status}`;
    } catch (error) {
      health.apiFootball.error = error instanceof Error ? error.message : "Connection failed";
    }
  }

  return health;
}
