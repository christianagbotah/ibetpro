// ============================================================================
// iBetPro Smart Demo Data Generator
// When no external API keys are configured, generates realistic match data
// so the app is fully functional for demonstration and testing
// ============================================================================

export interface DemoMatch {
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
  status: "upcoming" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  apiSource: string;
}

export interface DemoTeamStats {
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

// ==================== REALISTIC MATCH DATA ====================

const EPL_TEAMS = [
  { name: "Arsenal", elo: 1780, attack: 82, defense: 78 },
  { name: "Aston Villa", elo: 1650, attack: 72, defense: 70 },
  { name: "Bournemouth", elo: 1580, attack: 65, defense: 62 },
  { name: "Brentford", elo: 1600, attack: 68, defense: 64 },
  { name: "Brighton", elo: 1640, attack: 70, defense: 68 },
  { name: "Chelsea", elo: 1720, attack: 78, defense: 74 },
  { name: "Crystal Palace", elo: 1560, attack: 62, defense: 66 },
  { name: "Everton", elo: 1540, attack: 58, defense: 64 },
  { name: "Fulham", elo: 1590, attack: 64, defense: 66 },
  { name: "Liverpool", elo: 1820, attack: 86, defense: 80 },
  { name: "Man City", elo: 1840, attack: 88, defense: 82 },
  { name: "Man United", elo: 1680, attack: 74, defense: 68 },
  { name: "Newcastle", elo: 1700, attack: 76, defense: 74 },
  { name: "Nottm Forest", elo: 1570, attack: 63, defense: 65 },
  { name: "Tottenham", elo: 1690, attack: 76, defense: 66 },
  { name: "West Ham", elo: 1610, attack: 66, defense: 68 },
  { name: "Wolves", elo: 1550, attack: 60, defense: 64 },
  { name: "Leicester", elo: 1560, attack: 62, defense: 60 },
  { name: "Ipswich", elo: 1500, attack: 55, defense: 58 },
  { name: "Southampton", elo: 1490, attack: 52, defense: 56 },
];

const LA_LIGA_TEAMS = [
  { name: "Real Madrid", elo: 1850, attack: 90, defense: 82 },
  { name: "Barcelona", elo: 1830, attack: 88, defense: 78 },
  { name: "Atletico Madrid", elo: 1750, attack: 74, defense: 82 },
  { name: "Real Sociedad", elo: 1660, attack: 70, defense: 72 },
  { name: "Athletic Bilbao", elo: 1640, attack: 68, defense: 74 },
  { name: "Villarreal", elo: 1650, attack: 72, defense: 68 },
  { name: "Betis", elo: 1620, attack: 66, defense: 66 },
  { name: "Sevilla", elo: 1600, attack: 64, defense: 68 },
  { name: "Girona", elo: 1630, attack: 70, defense: 64 },
  { name: "Mallorca", elo: 1550, attack: 58, defense: 62 },
];

const BUNDESLIGA_TEAMS = [
  { name: "Bayern Munich", elo: 1840, attack: 88, defense: 80 },
  { name: "Bayer Leverkusen", elo: 1800, attack: 84, defense: 78 },
  { name: "Borussia Dortmund", elo: 1740, attack: 78, defense: 72 },
  { name: "RB Leipzig", elo: 1700, attack: 76, defense: 72 },
  { name: "Stuttgart", elo: 1660, attack: 72, defense: 68 },
  { name: "Eintracht Frankfurt", elo: 1640, attack: 70, defense: 66 },
  { name: "Freiburg", elo: 1620, attack: 66, defense: 70 },
  { name: "Wolfsburg", elo: 1590, attack: 64, defense: 66 },
  { name: "Hoffenheim", elo: 1580, attack: 64, defense: 62 },
  { name: "Union Berlin", elo: 1570, attack: 60, defense: 68 },
];

const SERIE_A_TEAMS = [
  { name: "Inter Milan", elo: 1780, attack: 80, defense: 82 },
  { name: "AC Milan", elo: 1720, attack: 76, defense: 70 },
  { name: "Juventus", elo: 1740, attack: 72, defense: 78 },
  { name: "Napoli", elo: 1760, attack: 78, defense: 74 },
  { name: "Atalanta", elo: 1700, attack: 76, defense: 68 },
  { name: "Roma", elo: 1660, attack: 70, defense: 70 },
  { name: "Lazio", elo: 1650, attack: 68, defense: 68 },
  { name: "Fiorentina", elo: 1630, attack: 66, defense: 66 },
  { name: "Bologna", elo: 1640, attack: 68, defense: 68 },
  { name: "Torino", elo: 1580, attack: 60, defense: 64 },
];

const LIGUE_1_TEAMS = [
  { name: "PSG", elo: 1820, attack: 86, defense: 78 },
  { name: "Marseille", elo: 1680, attack: 72, defense: 68 },
  { name: "Monaco", elo: 1700, attack: 74, defense: 70 },
  { name: "Lille", elo: 1660, attack: 68, defense: 72 },
  { name: "Lyon", elo: 1640, attack: 70, defense: 64 },
  { name: "Nice", elo: 1620, attack: 66, defense: 68 },
  { name: "Rennes", elo: 1600, attack: 64, defense: 66 },
  { name: "Lens", elo: 1630, attack: 68, defense: 70 },
];

const NBA_TEAMS = [
  { name: "Boston Celtics", elo: 1760, attack: 84, defense: 78 },
  { name: "Denver Nuggets", elo: 1740, attack: 82, defense: 76 },
  { name: "Milwaukee Bucks", elo: 1720, attack: 80, defense: 74 },
  { name: "Minnesota Timberwolves", elo: 1700, attack: 76, defense: 78 },
  { name: "OKC Thunder", elo: 1740, attack: 80, defense: 76 },
  { name: "Dallas Mavericks", elo: 1700, attack: 78, defense: 72 },
  { name: "Cleveland Cavaliers", elo: 1720, attack: 78, defense: 76 },
  { name: "NY Knicks", elo: 1680, attack: 74, defense: 72 },
  { name: "LA Clippers", elo: 1660, attack: 72, defense: 70 },
  { name: "Philadelphia 76ers", elo: 1680, attack: 74, defense: 72 },
  { name: "Phoenix Suns", elo: 1660, attack: 76, defense: 66 },
  { name: "Miami Heat", elo: 1640, attack: 70, defense: 72 },
];

const ALL_LEAGUES = [
  { sport: "soccer_epl", name: "Premier League", teams: EPL_TEAMS, hasDraw: true },
  { sport: "soccer_spain_la_liga", name: "La Liga", teams: LA_LIGA_TEAMS, hasDraw: true },
  { sport: "soccer_germany_bundesliga", name: "Bundesliga", teams: BUNDESLIGA_TEAMS, hasDraw: true },
  { sport: "soccer_italy_serie_a", name: "Serie A", teams: SERIE_A_TEAMS, hasDraw: true },
  { sport: "soccer_france_ligue_one", name: "Ligue 1", teams: LIGUE_1_TEAMS, hasDraw: true },
  { sport: "basketball_nba", name: "NBA", teams: NBA_TEAMS, hasDraw: false },
];

// ==================== ODDS CALCULATION ====================

function calculateOddsFromElo(homeElo: number, awayElo: number, hasDraw: boolean): {
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
} {
  const eloDiff = homeElo - awayElo;
  // Home advantage ~+65 Elo
  const adjustedDiff = eloDiff + 65;

  // Convert Elo diff to win probability
  const homeProb = 1 / (1 + Math.pow(10, -adjustedDiff / 400));
  const awayProb = 1 - homeProb;

  if (hasDraw) {
    // Draw probability based on how close teams are
    const drawProb = Math.max(0.18, 0.32 - Math.abs(eloDiff) * 0.0005);
    const adjHomeProb = homeProb * (1 - drawProb);
    const adjAwayProb = awayProb * (1 - drawProb);

    // Add bookmaker margin (~5%)
    const margin = 1.05;
    return {
      homeOdds: Math.round((margin / adjHomeProb) * 100) / 100,
      drawOdds: Math.round((margin / drawProb) * 100) / 100,
      awayOdds: Math.round((margin / adjAwayProb) * 100) / 100,
    };
  } else {
    const margin = 1.05;
    return {
      homeOdds: Math.round((margin / homeProb) * 100) / 100,
      drawOdds: null,
      awayOdds: Math.round((margin / awayProb) * 100) / 100,
    };
  }
}

// ==================== MATCH GENERATION ====================

function generateMatchesForLeague(
  league: typeof ALL_LEAGUES[0],
  count: number,
  now: Date
): DemoMatch[] {
  const matches: DemoMatch[] = [];
  const teams = [...league.teams];

  // Shuffle teams for random matchups
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }

  const numMatches = Math.min(count, Math.floor(teams.length / 2));

  for (let i = 0; i < numMatches; i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1];
    if (!home || !away) continue;

    const odds = calculateOddsFromElo(home.elo, away.elo, league.hasDraw);

    // Determine match status: mostly upcoming, some live, few finished
    const rand = Math.random();
    let status: "upcoming" | "live" | "finished";
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    let minute: number | null = null;
    let commenceTime: Date;

    if (rand < 0.6) {
      // Upcoming (within next 24 hours)
      status = "upcoming";
      commenceTime = new Date(now.getTime() + (Math.random() * 24 + 1) * 3600000);
    } else if (rand < 0.85) {
      // Live
      status = "live";
      minute = Math.floor(Math.random() * 85) + 5;
      commenceTime = new Date(now.getTime() - minute * 60000);
      // Generate realistic scores based on minute
      const expectedGoals = (minute / 90) * 2.7;
      homeScore = Math.floor(Math.random() * (expectedGoals + 1));
      awayScore = Math.floor(Math.random() * (expectedGoals + 1));
    } else {
      // Finished
      status = "finished";
      commenceTime = new Date(now.getTime() - (Math.random() * 48 + 2) * 3600000);
      homeScore = Math.floor(Math.random() * 4);
      awayScore = Math.floor(Math.random() * 4);
    }

    // Over/Under line for football
    let overUnderLine: number | null = null;
    let overOdds: number | null = null;
    let underOdds: number | null = null;

    if (league.hasDraw) {
      overUnderLine = 2.5;
      overOdds = Math.round((1.85 + Math.random() * 0.2) * 100) / 100;
      underOdds = Math.round((1.90 + Math.random() * 0.2) * 100) / 100;
    }

    matches.push({
      externalId: `demo_${league.sport}_${home.name.replace(/\s/g, "")}_vs_${away.name.replace(/\s/g, "")}`,
      sport: league.sport,
      league: league.name,
      homeTeam: home.name,
      awayTeam: away.name,
      homeOdds: odds.homeOdds,
      drawOdds: odds.drawOdds,
      awayOdds: odds.awayOdds,
      overUnderLine,
      overOdds,
      underOdds,
      commenceTime: commenceTime.toISOString(),
      status,
      homeScore,
      awayScore,
      minute,
      apiSource: "demo",
    });
  }

  return matches;
}

// ==================== TEAM STATS GENERATION ====================

function generateTeamStats(team: { name: string; elo: number; attack: number; defense: number }, league: string): DemoTeamStats {
  const matchesPlayed = Math.floor(Math.random() * 10) + 25;
  const wins = Math.floor(matchesPlayed * (team.attack / 200));
  const draws = Math.floor(matchesPlayed * 0.25);
  const losses = matchesPlayed - wins - draws;
  const goalsFor = Math.floor(wins * 1.5 + draws * 0.8 + Math.random() * 5);
  const goalsAgainst = Math.floor(losses * 1.2 + draws * 0.7 + Math.random() * 3);

  const formChars = ["W", "D", "L"];
  const form = Array.from({ length: 5 }, () => formChars[Math.floor(Math.random() * 3)]).join("");

  return {
    teamId: Math.floor(Math.random() * 1000) + 1,
    teamName: team.name,
    league,
    season: "2024/25",
    matchesPlayed,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    form,
    homeRecord: `${Math.floor(wins * 0.6)}-${Math.floor(draws * 0.4)}-${Math.floor(losses * 0.4)}`,
    awayRecord: `${Math.floor(wins * 0.4)}-${Math.floor(draws * 0.6)}-${Math.floor(losses * 0.6)}`,
    attackRating: team.attack,
    defenseRating: team.defense,
    overallRating: Math.round((team.attack + team.defense) / 2),
    xgFor: Math.round((goalsFor * (0.9 + Math.random() * 0.2)) * 10) / 10,
    xgAgainst: Math.round((goalsAgainst * (0.9 + Math.random() * 0.2)) * 10) / 10,
    shotsPerGame: Math.round((10 + Math.random() * 8) * 10) / 10,
    shotsOnTargetPerGame: Math.round((3 + Math.random() * 5) * 10) / 10,
    possessionAvg: Math.round((45 + Math.random() * 15) * 10) / 10,
    cornersPerGame: Math.round((4 + Math.random() * 4) * 10) / 10,
    cardsPerGame: Math.round((1 + Math.random() * 2) * 10) / 10,
    eloRating: team.elo,
  };
}

// ==================== PUBLIC API ====================

/**
 * Generate realistic demo matches for all leagues
 * Called when no external API keys are configured
 */
export function generateDemoMatches(): DemoMatch[] {
  const now = new Date();
  const allMatches: DemoMatch[] = [];

  for (const league of ALL_LEAGUES) {
    const matches = generateMatchesForLeague(league, 4, now);
    allMatches.push(...matches);
  }

  return allMatches;
}

/**
 * Generate demo team stats for all teams in a league
 */
export function generateDemoTeamStats(leagueName: string): DemoTeamStats[] {
  const league = ALL_LEAGUES.find((l) => l.name === leagueName);
  if (!league) return [];

  return league.teams.map((team) => generateTeamStats(team, leagueName));
}

/**
 * Get all available demo leagues
 */
export function getDemoLeagues() {
  return ALL_LEAGUES.map((l) => ({
    sport: l.sport,
    name: l.name,
    teamCount: l.teams.length,
    hasDraw: l.hasDraw,
  }));
}

/**
 * Update live demo matches with realistic score progression
 * Call this periodically to simulate live match updates
 */
export function updateLiveDemoMatches(matches: DemoMatch[]): DemoMatch[] {
  return matches.map((match) => {
    if (match.status !== "live") return match;

    let minute = (match.minute || 0) + 1;
    let homeScore = match.homeScore || 0;
    let awayScore = match.awayScore || 0;

    // Goal probability: ~2.7 goals per 90 minutes
    const goalProb = 2.7 / 90;
    if (Math.random() < goalProb) {
      if (Math.random() < 0.55) {
        homeScore++;
      } else {
        awayScore++;
      }
    }

    // Half time break
    if (minute === 45) {
      minute = 45; // stays at 45 until second half
    } else if (minute === 46) {
      minute = 46; // second half starts
    }

    // Match ends at 90+
    if (minute >= 90 + Math.floor(Math.random() * 5)) {
      return {
        ...match,
        status: "finished" as const,
        homeScore,
        awayScore,
        minute: 90,
      };
    }

    return {
      ...match,
      homeScore,
      awayScore,
      minute,
    };
  });
}

/**
 * Generate a unique set of matches with seeded randomness for consistency
 */
export function generateSeededDemoMatches(seed: number = 42): DemoMatch[] {
  // Simple seeded random for consistent demo data
  const originalRandom = Math.random;
  let s = seed;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const matches = generateDemoMatches();

  Math.random = originalRandom;
  return matches;
}
