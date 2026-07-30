// ============================================================================
// iBetPro Production Configuration
// All defaults are production-safe. Set environment variables in production.
// ============================================================================

function env(key: string, fallback: string = ""): string {
  return process.env[key] || fallback;
}

export const config = {
  nextauth: {
    url: env("NEXTAUTH_URL", "http://localhost:3001"),
    // MUST set NEXTAUTH_SECRET in production — no insecure fallback
    secret: env("NEXTAUTH_SECRET", ""),
  },
  api: {
    oddsApiKey: env("ODDS_API_KEY", ""),
    apiFootballKey: env("API_FOOTBALL_KEY", ""),
    sportmonksToken: env("SPORTMONKS_API_TOKEN", ""),
  },
  apiUrls: {
    oddsApi: "https://api.the-odds-api.com/v4",
    apiFootball: "https://v3.football.api-sports.io",
    sportmonks: "https://api.sportmonks.com/v3",
  },
  admin: {
    email: env("ADMIN_EMAIL", "admin@ibetpro.com"),
    // MUST set ADMIN_PASSWORD in production — no insecure fallback
    password: env("ADMIN_PASSWORD", ""),
  },
  commission: {
    defaultRate: parseFloat(env("DEFAULT_COMMISSION_RATE", "0.10")),
    minRate: parseFloat(env("MIN_COMMISSION_RATE", "0.05")),
    maxRate: parseFloat(env("MAX_COMMISSION_RATE", "0.25")),
  },
  platform: {
    name: env("PLATFORM_NAME", "iBetPro"),
    url: env("APP_URL", "http://localhost:3001"),
  },
  ai: {
    // AI engine configurable defaults — replace hardcoded values
    leagueAvgGoals: parseFloat(env("AI_LEAGUE_AVG_GOALS", "1.35")),
    homeAdvantageMultiplier: parseFloat(env("AI_HOME_ADV_MULT", "1.15")),
    awayPenaltyMultiplier: parseFloat(env("AI_AWAY_PEN_MULT", "0.90")),
    eloHomeAdvantage: parseFloat(env("AI_ELO_HOME_ADV", "65")),
    baseDrawProb: parseFloat(env("AI_BASE_DRAW_PROB", "0.26")),
    overUnderExpected: parseFloat(env("AI_OVER_UNDER_EXPECTED", "2.5")),
    defaultElo: parseFloat(env("AI_DEFAULT_ELO", "1500")),
    kellyFraction: parseFloat(env("AI_KELLY_FRACTION", "0.25")),
    cashoutBookmakerMargin: parseFloat(env("AI_CASHOUT_BK_MARGIN", "0.85")),
    cashoutDrawStakeRatio: parseFloat(env("AI_CASHOUT_DRAW_RATIO", "0.50")),
    cashoutLosingStakeRatio: parseFloat(env("AI_CASHOUT_LOSING_RATIO", "0.15")),
    goalRatePerMatch: parseFloat(env("AI_GOAL_RATE_PER_MATCH", "2.7")),
    monteCarloIterations: parseInt(env("AI_MC_ITERATIONS", "10000"), 10),
  },
  security: {
    bcryptSaltRounds: 12,
    sessionMaxAgeHours: 24,
  },
};

/**
 * Determine which data source to use based on configured API keys
 */
export function getPrimaryDataSource(): "odds-api" | "api-football" | "sportmonks" | "none" {
  if (config.api.oddsApiKey) return "odds-api";
  if (config.api.apiFootballKey) return "api-football";
  if (config.api.sportmonksToken) return "sportmonks";
  return "none";
}
