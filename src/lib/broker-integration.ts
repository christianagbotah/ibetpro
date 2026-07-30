// ============================================================================
// iBetPro Broker Integration Layer
// Handles connections to betting platforms (Sportybet, 1xBet, Bet9ja, etc.)
// Users log in with their broker credentials, the app gets allocation from
// their account and places bets directly on the broker platform.
// ============================================================================

import { config } from "./config";

// ==================== TYPE DEFINITIONS ====================

export interface BrokerPlatform {
  id: string;
  name: string;
  regions: string[];
  authType: "oauth" | "api_key" | "web_session" | "manual";
  supportedSports: string[];
  baseUrl: string;
  features: BrokerFeatures;
  commissionDefault: number;
}

export interface BrokerFeatures {
  liveBetting: boolean;
  cashout: boolean;
  partialCashout: boolean;
  accumulators: boolean;
  maxAccumulatorLegs: number;
  minStake: number;
  maxStake: number;
  supportedMarkets: string[];
  instantSettlement: boolean;
}

export interface BrokerAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  sessionToken?: string;
  sessionExpiry?: Date;
  brokerUserId?: string;
  error?: string;
}

export interface BrokerBalance {
  available: number;
  locked: number;
  total: number;
  currency: string;
  lastUpdated: Date;
}

export interface BrokerBetResult {
  success: boolean;
  brokerBetId?: string;
  placedAt?: Date;
  stake?: number;
  odds?: number;
  potentialWin?: number;
  error?: string;
}

export interface BrokerCashoutResult {
  success: boolean;
  cashoutAmount?: number;
  remainingBetAmount?: number;
  betStatus?: string;
  error?: string;
}

export interface BrokerSession {
  isValid: boolean;
  expiresAt?: Date;
  needsRefresh: boolean;
}

// ==================== SUPPORTED BROKER PLATFORMS ====================

export const BROKER_PLATFORMS: BrokerPlatform[] = [
  {
    id: "sportybet",
    name: "Sportybet",
    regions: ["ng", "ke", "gh", "tz", "ug"],
    authType: "web_session",
    supportedSports: ["football", "basketball", "tennis", "cricket"],
    baseUrl: "https://www.sportybet.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 30,
      minStake: 100,
      maxStake: 10000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "double_chance", "draw_no_bet"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "1xbet",
    name: "1xBet",
    regions: ["ng", "ke", "gh", "global"],
    authType: "api_key",
    supportedSports: ["football", "basketball", "tennis", "hockey", "cricket", "baseball"],
    baseUrl: "https://1xbet.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 20,
      minStake: 50,
      maxStake: 50000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "double_chance", "handicap", "correct_score", "half_time_full_time"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "bet9ja",
    name: "Bet9ja",
    regions: ["ng"],
    authType: "web_session",
    supportedSports: ["football", "basketball", "tennis"],
    baseUrl: "https://www.bet9ja.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: false,
      accumulators: true,
      maxAccumulatorLegs: 25,
      minStake: 100,
      maxStake: 5000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "double_chance"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "betway",
    name: "Betway",
    regions: ["ng", "ke", "gh", "uk", "global"],
    authType: "oauth",
    supportedSports: ["football", "basketball", "tennis", "hockey", "cricket"],
    baseUrl: "https://www.betway.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 15,
      minStake: 50,
      maxStake: 10000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "double_chance", "handicap"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "stake",
    name: "Stake",
    regions: ["global"],
    authType: "api_key",
    supportedSports: ["football", "basketball", "tennis", "hockey", "cricket", "esports"],
    baseUrl: "https://www.stake.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 10,
      minStake: 10,
      maxStake: 1000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "handicap", "correct_score"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "bet365",
    name: "Bet365",
    regions: ["uk", "eu", "global"],
    authType: "web_session",
    supportedSports: ["football", "basketball", "tennis", "hockey", "cricket", "horse_racing"],
    baseUrl: "https://www.bet365.com",
    features: {
      liveBetting: true,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 14,
      minStake: 10,
      maxStake: 5000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score", "double_chance", "handicap", "correct_score", "half_time_full_time", "first_goalscorer"],
      instantSettlement: true,
    },
    commissionDefault: 0.10,
  },
  {
    id: "manual",
    name: "Manual Broker",
    regions: ["global"],
    authType: "manual",
    supportedSports: ["football", "basketball", "tennis"],
    baseUrl: "",
    features: {
      liveBetting: false,
      cashout: true,
      partialCashout: true,
      accumulators: true,
      maxAccumulatorLegs: 10,
      minStake: 10,
      maxStake: 1000000,
      supportedMarkets: ["1x2", "over_under", "both_teams_score"],
      instantSettlement: false,
    },
    commissionDefault: 0.10,
  },
];

// ==================== BROKER CONNECTION MANAGER ====================

/**
 * Get a broker platform by ID
 */
export function getBrokerPlatform(platformId: string): BrokerPlatform | undefined {
  return BROKER_PLATFORMS.find((p) => p.id === platformId);
}

/**
 * Get all available broker platforms
 */
export function getAvailablePlatforms(region?: string): BrokerPlatform[] {
  if (!region) return BROKER_PLATFORMS;
  return BROKER_PLATFORMS.filter((p) => p.regions.includes(region) || p.regions.includes("global"));
}

/**
 * Authenticate with a broker platform
 * In production, this would make real API calls to the broker
 */
export async function authenticateBroker(
  platformId: string,
  credentials: { username?: string; password?: string; apiKey?: string; token?: string }
): Promise<BrokerAuthResult> {
  const platform = getBrokerPlatform(platformId);
  if (!platform) {
    return { success: false, error: `Unknown platform: ${platformId}` };
  }

  // In production, each broker would have its own auth flow
  // For now, we simulate the authentication based on the broker type
  switch (platform.authType) {
    case "oauth": {
      // OAuth flow - redirect to broker's OAuth endpoint
      if (!credentials.token) {
        return { success: false, error: "OAuth token required" };
      }
      return {
        success: true,
        accessToken: credentials.token,
        refreshToken: `refresh_${Date.now()}`,
        sessionExpiry: new Date(Date.now() + 3600000), // 1 hour
        brokerUserId: `oauth_${Date.now()}`,
      };
    }

    case "api_key": {
      // API key auth
      if (!credentials.apiKey) {
        return { success: false, error: "API key required" };
      }
      return {
        success: true,
        accessToken: credentials.apiKey,
        sessionExpiry: new Date(Date.now() + 86400000), // 24 hours
        brokerUserId: `apikey_${Date.now()}`,
      };
    }

    case "web_session": {
      // Web session auth (username/password)
      if (!credentials.username || !credentials.password) {
        return { success: false, error: "Username and password required" };
      }
      // In production, this would POST to the broker's login endpoint
      const sessionToken = `session_${Buffer.from(credentials.username).toString("base64")}_${Date.now()}`;
      return {
        success: true,
        accessToken: sessionToken,
        sessionToken,
        sessionExpiry: new Date(Date.now() + 7200000), // 2 hours
        brokerUserId: credentials.username,
      };
    }

    case "manual": {
      // Manual connection - user provides their own account details
      return {
        success: true,
        sessionExpiry: new Date(Date.now() + 86400000 * 30), // 30 days
        brokerUserId: credentials.username || "manual_user",
      };
    }

    default:
      return { success: false, error: `Unsupported auth type: ${platform.authType}` };
  }
}

/**
 * Validate an existing broker session
 */
export function validateBrokerSession(
  sessionToken: string | null,
  sessionExpiry: Date | null
): BrokerSession {
  if (!sessionToken || !sessionExpiry) {
    return { isValid: false, needsRefresh: true };
  }

  const now = new Date();
  const isValid = sessionExpiry > now;
  const needsRefresh = !isValid || (sessionExpiry.getTime() - now.getTime() < 300000); // 5 min buffer

  return { isValid, expiresAt: sessionExpiry, needsRefresh };
}

/**
 * Fetch balance from broker platform
 * In production, this would make real API calls to the broker
 */
export async function fetchBrokerBalance(
  platformId: string,
  accessToken: string
): Promise<BrokerBalance> {
  const platform = getBrokerPlatform(platformId);

  if (!platform || platform.id === "manual") {
    // For manual brokers, return a simulated balance
    return {
      available: 0,
      locked: 0,
      total: 0,
      currency: "USD",
      lastUpdated: new Date(),
    };
  }

  // In production, this would make real API calls to the broker
  // For now, simulate a response
  return {
    available: 0,
    locked: 0,
    total: 0,
    currency: "USD",
    lastUpdated: new Date(),
  };
}

/**
 * Place a bet directly on the broker platform
 * In production, this would make real API calls to the broker
 */
export async function placeBetOnBroker(
  platformId: string,
  accessToken: string,
  betDetails: {
    matchId: string;
    selection: string;
    odds: number;
    stake: number;
    betType: string;
    market?: string;
  }
): Promise<BrokerBetResult> {
  const platform = getBrokerPlatform(platformId);
  if (!platform) {
    return { success: false, error: `Unknown platform: ${platformId}` };
  }

  // Validate stake limits
  if (betDetails.stake < platform.features.minStake) {
    return { success: false, error: `Stake below minimum (${platform.features.minStake})` };
  }
  if (betDetails.stake > platform.features.maxStake) {
    return { success: false, error: `Stake above maximum (${platform.features.maxStake})` };
  }

  // In production, this would make real API calls to the broker
  // For now, simulate a successful bet placement
  const brokerBetId = `${platformId}_bet_${Date.now()}`;

  return {
    success: true,
    brokerBetId,
    placedAt: new Date(),
    stake: betDetails.stake,
    odds: betDetails.odds,
    potentialWin: Math.round(betDetails.stake * betDetails.odds * 100) / 100,
  };
}

/**
 * Execute a cashout on the broker platform
 * In production, this would make real API calls to the broker
 */
export async function executeCashoutOnBroker(
  platformId: string,
  accessToken: string,
  brokerBetId: string,
  cashoutType: "full" | "partial",
  partialPercent?: number
): Promise<BrokerCashoutResult> {
  const platform = getBrokerPlatform(platformId);
  if (!platform) {
    return { success: false, error: `Unknown platform: ${platformId}` };
  }

  if (cashoutType === "partial" && !platform.features.partialCashout) {
    return { success: false, error: "Partial cashout not supported on this platform" };
  }

  // In production, this would make real API calls to the broker
  return {
    success: true,
    cashoutAmount: 0,
    remainingBetAmount: cashoutType === "partial" ? 0 : 0,
    betStatus: cashoutType === "full" ? "cashed_out" : "partial_cashout",
  };
}

/**
 * Transfer commission to admin's account on the broker
 * This is called automatically when a bet is settled with profit
 */
export async function transferCommissionToAdmin(
  platformId: string,
  accessToken: string,
  amount: number,
  adminWalletAddress: string,
  reference: string
): Promise<{ success: boolean; transferRef?: string; error?: string }> {
  if (!adminWalletAddress) {
    return { success: false, error: "Admin wallet address not configured" };
  }

  if (amount <= 0) {
    return { success: false, error: "Commission amount must be positive" };
  }

  // In production, this would make real API calls to transfer funds
  // to the admin's account on the broker platform
  const transferRef = `comm_${platformId}_${reference}_${Date.now()}`;

  return {
    success: true,
    transferRef,
  };
}

/**
 * Refresh a broker session
 */
export async function refreshBrokerSession(
  platformId: string,
  refreshToken: string
): Promise<BrokerAuthResult> {
  const platform = getBrokerPlatform(platformId);
  if (!platform) {
    return { success: false, error: `Unknown platform: ${platformId}` };
  }

  // In production, this would make real API calls to refresh the token
  return {
    success: true,
    accessToken: `refreshed_${Date.now()}`,
    refreshToken: `new_refresh_${Date.now()}`,
    sessionExpiry: new Date(Date.now() + 3600000),
  };
}

/**
 * Calculate the allocation for a user's broker account
 * The user decides how much of their broker balance to allocate to the auto-bet bot
 */
export function calculateAllocation(
  brokerBalance: number,
  requestedAmount: number,
  activeBetStake: number
): { allocated: number; available: number; locked: number } {
  const availableForAllocation = brokerBalance - activeBetStake;
  const allocated = Math.min(requestedAmount, availableForAllocation);
  const locked = activeBetStake;

  return {
    allocated: Math.round(allocated * 100) / 100,
    available: Math.round((allocated - locked) * 100) / 100,
    locked: Math.round(locked * 100) / 100,
  };
}

/**
 * Calculate commission on a profit
 */
export function calculateCommission(
  grossProfit: number,
  commissionRate: number = config.commission.defaultRate
): { grossProfit: number; commission: number; netProfit: number } {
  const commission = Math.max(0, grossProfit * commissionRate);
  const netProfit = grossProfit - commission;

  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}
