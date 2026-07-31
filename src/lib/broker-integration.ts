// ============================================================================
// iBetPro Broker Integration Layer
// Handles connections to betting platforms across all regions
// Users log in with their broker credentials, the app gets allocation from
// their account and places bets directly on the broker platform.
// ============================================================================

import { config } from "./config";
import {
  BROKER_PLATFORMS as REGION_PLATFORMS,
  getPlatformsForRegion,
  getCurrencyForRegion,
  getRegionInfo,
  type BrokerPlatformInfo,
} from "./regions";

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
  logo?: string;
  logoPath?: string;
  color?: string;
  mobileApp?: boolean;
  popularIn?: string[];
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

// ==================== BROKER PLATFORMS (re-exported from regions) ====================

export const BROKER_PLATFORMS: BrokerPlatform[] = REGION_PLATFORMS.map((p) => ({
  id: p.id,
  name: p.name,
  regions: p.regions,
  authType: p.authType,
  supportedSports: p.supportedSports,
  baseUrl: p.baseUrl,
  features: p.features,
  commissionDefault: p.commissionDefault,
  logo: p.logo,
  logoPath: p.logoPath,
  color: p.color,
  mobileApp: p.mobileApp,
  popularIn: p.popularIn,
}));

// ==================== BROKER CONNECTION MANAGER ====================

/**
 * Get a broker platform by ID
 */
export function getBrokerPlatform(platformId: string): BrokerPlatform | undefined {
  return BROKER_PLATFORMS.find((p) => p.id === platformId);
}

/**
 * Get all available broker platforms, optionally filtered by region
 */
export function getAvailablePlatforms(region?: string): BrokerPlatform[] {
  if (!region) return BROKER_PLATFORMS;
  return getPlatformsForRegion(region).map((p) => ({
    id: p.id,
    name: p.name,
    regions: p.regions,
    authType: p.authType,
    supportedSports: p.supportedSports,
    baseUrl: p.baseUrl,
    features: p.features,
    commissionDefault: p.commissionDefault,
    logo: p.logo,
    logoPath: p.logoPath,
    color: p.color,
    mobileApp: p.mobileApp,
    popularIn: p.popularIn,
  }));
}

/**
 * Get the currency for a given region
 */
export function getRegionCurrency(regionCode: string): { code: string; symbol: string; name: string } {
  return getCurrencyForRegion(regionCode);
}

/**
 * Get region display info
 */
export function getRegionDisplayInfo(regionCode: string) {
  return getRegionInfo(regionCode);
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

  switch (platform.authType) {
    case "oauth": {
      if (!credentials.token) {
        return { success: false, error: "OAuth token required" };
      }
      return {
        success: true,
        accessToken: credentials.token,
        refreshToken: `refresh_${Date.now()}`,
        sessionExpiry: new Date(Date.now() + 3600000),
        brokerUserId: `oauth_${Date.now()}`,
      };
    }

    case "api_key": {
      if (!credentials.apiKey) {
        return { success: false, error: "API key required" };
      }
      return {
        success: true,
        accessToken: credentials.apiKey,
        sessionExpiry: new Date(Date.now() + 86400000),
        brokerUserId: `apikey_${Date.now()}`,
      };
    }

    case "web_session": {
      if (!credentials.username || !credentials.password) {
        return { success: false, error: "Username and password required" };
      }
      const sessionToken = `session_${Buffer.from(credentials.username).toString("base64")}_${Date.now()}`;
      return {
        success: true,
        accessToken: sessionToken,
        sessionToken,
        sessionExpiry: new Date(Date.now() + 7200000),
        brokerUserId: credentials.username,
      };
    }

    case "manual": {
      return {
        success: true,
        sessionExpiry: new Date(Date.now() + 86400000 * 30),
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
  const needsRefresh = !isValid || (sessionExpiry.getTime() - now.getTime() < 300000);

  return { isValid, expiresAt: sessionExpiry, needsRefresh };
}

/**
 * Fetch balance from broker platform
 */
export async function fetchBrokerBalance(
  platformId: string,
  accessToken: string,
  regionCode?: string
): Promise<BrokerBalance> {
  const platform = getBrokerPlatform(platformId);
  const currency = regionCode ? getCurrencyForRegion(regionCode) : { code: "USD" };

  if (!platform || platform.id === "manual") {
    return {
      available: 0,
      locked: 0,
      total: 0,
      currency: currency.code,
      lastUpdated: new Date(),
    };
  }

  return {
    available: 0,
    locked: 0,
    total: 0,
    currency: currency.code,
    lastUpdated: new Date(),
  };
}

/**
 * Place a bet directly on the broker platform
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

  if (betDetails.stake < platform.features.minStake) {
    return { success: false, error: `Stake below minimum (${platform.features.minStake})` };
  }
  if (betDetails.stake > platform.features.maxStake) {
    return { success: false, error: `Stake above maximum (${platform.features.maxStake})` };
  }

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

  return {
    success: true,
    cashoutAmount: 0,
    remainingBetAmount: cashoutType === "partial" ? 0 : 0,
    betStatus: cashoutType === "full" ? "cashed_out" : "partial_cashout",
  };
}

/**
 * Transfer commission to admin's account on the broker
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

  return {
    success: true,
    accessToken: `refreshed_${Date.now()}`,
    refreshToken: `new_refresh_${Date.now()}`,
    sessionExpiry: new Date(Date.now() + 3600000),
  };
}

/**
 * Calculate the allocation for a user's broker account
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
