// ============================================================================
// iBetPro Betting Platform Integration Layer
// Connects to Bet365, Betway, 1xBet, Sportybet, Stake, Pinnacle
// ============================================================================

import { config } from "@/lib/config";

// ==================== TYPES ====================

export interface PlatformConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: "api_key" | "oauth2" | "session";
  supportedSports: string[];
  supportedBetTypes: string[];
  cashoutSupported: boolean;
  liveBettingSupported: boolean;
  maxStake: number;
  minStake: number;
}

export interface PlatformBetResult {
  success: boolean;
  betId: string;
  platformBetId: string;
  placedAt: Date;
  odds: number;
  stake: number;
  potentialWin: number;
  error?: string;
}

export interface PlatformCashoutResult {
  success: boolean;
  cashoutAmount: number;
  cashoutId: string;
  error?: string;
}

export interface PlatformBalanceResult {
  success: boolean;
  balance: number;
  currency: string;
  error?: string;
}

// ==================== PLATFORM CONFIGURATIONS ====================

export const PLATFORMS: Record<string, PlatformConfig> = {
  bet365: {
    id: "bet365",
    name: "Bet365",
    baseUrl: "https://api.bet365.com/v1",
    authType: "session",
    supportedSports: ["football", "basketball", "tennis", "cricket", "hockey"],
    supportedBetTypes: ["match_winner", "over_under", "both_teams_score", "handicap", "double_chance"],
    cashoutSupported: true,
    liveBettingSupported: true,
    maxStake: 100000,
    minStake: 1,
  },
  betway: {
    id: "betway",
    name: "Betway",
    baseUrl: "https://api.betway.com/v2",
    authType: "oauth2",
    supportedSports: ["football", "basketball", "tennis", "esports"],
    supportedBetTypes: ["match_winner", "over_under", "both_teams_score"],
    cashoutSupported: true,
    liveBettingSupported: true,
    maxStake: 50000,
    minStake: 1,
  },
  "1xbet": {
    id: "1xbet",
    name: "1xBet",
    baseUrl: "https://api.1xbet.com/v3",
    authType: "api_key",
    supportedSports: ["football", "basketball", "tennis", "cricket", "hockey", "volleyball"],
    supportedBetTypes: ["match_winner", "over_under", "both_teams_score", "handicap", "double_chance", "draw_no_bet"],
    cashoutSupported: true,
    liveBettingSupported: true,
    maxStake: 200000,
    minStake: 0.5,
  },
  sportybet: {
    id: "sportybet",
    name: "Sportybet",
    baseUrl: "https://api.sportybet.com/v1",
    authType: "session",
    supportedSports: ["football", "basketball"],
    supportedBetTypes: ["match_winner", "over_under", "handicap"],
    cashoutSupported: true,
    liveBettingSupported: false,
    maxStake: 10000,
    minStake: 1,
  },
  stake: {
    id: "stake",
    name: "Stake",
    baseUrl: "https://api.stake.com/v2",
    authType: "api_key",
    supportedSports: ["football", "basketball", "tennis", "esports", "mma"],
    supportedBetTypes: ["match_winner", "over_under", "both_teams_score", "handicap"],
    cashoutSupported: false,
    liveBettingSupported: true,
    maxStake: 500000,
    minStake: 0.01,
  },
  pinnacle: {
    id: "pinnacle",
    name: "Pinnacle",
    baseUrl: "https://api.pinnacle.com/v1",
    authType: "api_key",
    supportedSports: ["football", "basketball", "tennis", "baseball", "hockey", "mma"],
    supportedBetTypes: ["match_winner", "over_under", "both_teams_score", "handicap", "double_chance", "draw_no_bet"],
    cashoutSupported: false,
    liveBettingSupported: true,
    maxStake: 1000000,
    minStake: 1,
  },
};

// ==================== PLATFORM API CLIENT ====================

/**
 * Place a bet on a specific platform
 */
export async function placeBetOnPlatform(
  platform: string,
  accessToken: string,
  bet: {
    matchId: string;
    selection: string;
    odds: number;
    stake: number;
    betType: string;
  }
): Promise<PlatformBetResult> {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    return {
      success: false,
      betId: "",
      platformBetId: "",
      placedAt: new Date(),
      odds: bet.odds,
      stake: bet.stake,
      potentialWin: bet.odds * bet.stake,
      error: `Unsupported platform: ${platform}`,
    };
  }

  // Validate bet against platform limits
  if (bet.stake < platformConfig.minStake) {
    return {
      success: false,
      betId: "",
      platformBetId: "",
      placedAt: new Date(),
      odds: bet.odds,
      stake: bet.stake,
      potentialWin: bet.odds * bet.stake,
      error: `Stake below minimum (${platformConfig.minStake}) for ${platformConfig.name}`,
    };
  }

  if (bet.stake > platformConfig.maxStake) {
    return {
      success: false,
      betId: "",
      platformBetId: "",
      placedAt: new Date(),
      odds: bet.odds,
      stake: bet.stake,
      potentialWin: bet.odds * bet.stake,
      error: `Stake exceeds maximum (${platformConfig.maxStake}) for ${platformConfig.name}`,
    };
  }

  try {
    // In production, this would make the actual API call to the platform
    // For now, we simulate the platform API call with proper error handling
    const result = await simulatePlatformCall(platformConfig, accessToken, bet);
    return result;
  } catch (error) {
    return {
      success: false,
      betId: "",
      platformBetId: "",
      placedAt: new Date(),
      odds: bet.odds,
      stake: bet.stake,
      potentialWin: bet.odds * bet.stake,
      error: `Platform API error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Request a cashout from a platform
 */
export async function requestCashoutFromPlatform(
  platform: string,
  accessToken: string,
  platformBetId: string,
  cashoutAmount: number
): Promise<PlatformCashoutResult> {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    return { success: false, cashoutAmount: 0, cashoutId: "", error: `Unsupported platform: ${platform}` };
  }

  if (!platformConfig.cashoutSupported) {
    return { success: false, cashoutAmount: 0, cashoutId: "", error: `${platformConfig.name} does not support cashout` };
  }

  try {
    // In production, this would make the actual API call
    return {
      success: true,
      cashoutAmount,
      cashoutId: `co-${platform}-${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      cashoutAmount: 0,
      cashoutId: "",
      error: `Cashout failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Fetch balance from a platform
 */
export async function fetchPlatformBalance(
  platform: string,
  accessToken: string
): Promise<PlatformBalanceResult> {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    return { success: false, balance: 0, currency: "USD", error: `Unsupported platform: ${platform}` };
  }

  try {
    // In production, this would make the actual API call
    return {
      success: true,
      balance: 0, // Will be populated from actual API
      currency: "USD",
    };
  } catch (error) {
    return {
      success: false,
      balance: 0,
      currency: "USD",
      error: `Balance check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Verify a platform connection is valid
 */
export async function verifyPlatformConnection(
  platform: string,
  accessToken: string
): Promise<{ connected: boolean; error?: string }> {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    return { connected: false, error: `Unsupported platform: ${platform}` };
  }

  if (!accessToken) {
    return { connected: false, error: "No access token provided" };
  }

  // In production, this would verify the token with the platform API
  return { connected: true };
}

/**
 * Get supported bet types for a platform and sport
 */
export function getSupportedBetTypes(platform: string, sport: string): string[] {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) return [];
  return platformConfig.supportedBetTypes.filter(() =>
    platformConfig.supportedSports.includes(sport)
  );
}

// ==================== SIMULATED PLATFORM CALL ====================

/**
 * Simulates a platform API call for development/testing
 * In production, replace with real HTTP calls to each platform's API
 */
async function simulatePlatformCall(
  platformConfig: PlatformConfig,
  _accessToken: string,
  bet: { matchId: string; selection: string; odds: number; stake: number; betType: string }
): Promise<PlatformBetResult> {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

  // In production, this would be a real HTTP call like:
  // const response = await fetch(`${platformConfig.baseUrl}/bets/place`, {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${accessToken}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     eventId: bet.matchId,
  //     selection: bet.selection,
  //     odds: bet.odds,
  //     stake: bet.stake,
  //     type: bet.betType,
  //   }),
  // });

  return {
    success: true,
    betId: `bet-${platformConfig.id}-${Date.now()}`,
    platformBetId: `pb-${platformConfig.id}-${Date.now()}`,
    placedAt: new Date(),
    odds: bet.odds,
    stake: bet.stake,
    potentialWin: bet.odds * bet.stake,
  };
}

/**
 * Get all supported platforms
 */
export function getSupportedPlatforms(): PlatformConfig[] {
  return Object.values(PLATFORMS);
}
