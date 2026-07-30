// ============================================================================
// iBetPro Production Configuration
// Centralized environment variable access with validation
// ============================================================================

const env = process.env;

export const config = {
  // NextAuth
  nextauth: {
    url: env.NEXTAUTH_URL || "http://localhost:3001",
    secret: env.NEXTAUTH_SECRET || "ibetpro-dev-secret",
  },

  // API Keys
  apis: {
    oddsApiKey: env.ODDS_API_KEY || "",
    apiFootballKey: env.API_FOOTBALL_KEY || "",
    sportmonksToken: env.SPORTMONKS_API_TOKEN || "",
  },

  // Admin
  admin: {
    email: env.ADMIN_EMAIL || "admin@ibetpro.com",
    password: env.ADMIN_PASSWORD || "changeme-admin-2024",
  },

  // Commission
  commission: {
    defaultRate: parseFloat(env.DEFAULT_COMMISSION_RATE || "0.10"),
    minRate: parseFloat(env.MIN_COMMISSION_RATE || "0.05"),
    maxRate: parseFloat(env.MAX_COMMISSION_RATE || "0.25"),
  },

  // Platform
  platform: {
    name: env.PLATFORM_NAME || "iBetPro",
    url: env.APP_URL || "http://localhost:3001",
  },

  // API Base URLs
  apiUrls: {
    oddsApi: "https://api.the-odds-api.com/v4",
    apiFootball: "https://v3.football.api-sports.io",
    sportmonks: "https://api.sportmonks.com/v3",
  },
} as const;

// Check if any real API key is configured
export function hasApiKeys(): boolean {
  return !!(config.apis.oddsApiKey || config.apis.apiFootballKey || config.apis.sportmonksToken);
}

// Get the primary data source based on available keys
export function getPrimaryDataSource(): "odds-api" | "api-football" | "sportmonks" | "none" {
  if (config.apis.oddsApiKey) return "odds-api";
  if (config.apis.apiFootballKey) return "api-football";
  if (config.apis.sportmonksToken) return "sportmonks";
  return "none";
}
