// ============================================================================
// iBetPro Broker API Integration Framework
// Production-grade abstraction layer for connecting to real betting platforms
//
// Architecture:
// - BrokerAdapter interface: Common contract for all broker integrations
// - BrokerAdapterFactory: Creates the right adapter for each platform
// - Real implementations per platform (OAuth, API key, web session)
// - Retry logic, session management, error handling
// - Transaction safety with idempotency keys
// ============================================================================

import { config } from "./config";
import {
  getBrokerPlatform,
  validateBrokerSession,
  getRegionCurrency,
  type BrokerPlatform,
  type BrokerAuthResult,
  type BrokerBalance,
  type BrokerBetResult,
  type BrokerCashoutResult,
  type BrokerSession,
} from "./broker-integration";

// ==================== TYPES ====================

export interface BrokerAdapter {
  platformId: string;
  platform: BrokerPlatform;

  // Authentication
  authenticate(credentials: BrokerCredentials): Promise<BrokerAuthResult>;
  refreshSession(refreshToken: string): Promise<BrokerAuthResult>;
  validateSession(sessionToken: string, sessionExpiry: Date): BrokerSession;

  // Account
  getBalance(accessToken: string, regionCode?: string): Promise<BrokerBalance>;
  getProfile(accessToken: string): Promise<BrokerUserProfile>;

  // Betting
  placeBet(accessToken: string, bet: BrokerBetRequest): Promise<BrokerBetResult>;
  getBetStatus(accessToken: string, brokerBetId: string): Promise<BrokerBetStatus>;

  // Cashout
  cashout(accessToken: string, brokerBetId: string, type: "full" | "partial", partialPercent?: number): Promise<BrokerCashoutResult>;

  // Transfer
  transferToWallet(accessToken: string, amount: number, walletAddress: string, reference: string): Promise<BrokerTransferResult>;

  // Utility
  getAvailableMarkets(accessToken: string, matchId: string): Promise<BrokerMarket[]>;
  getLiveEvents(accessToken: string): Promise<BrokerLiveEvent[]>;
}

export interface BrokerCredentials {
  username?: string;
  password?: string;
  apiKey?: string;
  token?: string;
  otp?: string;
}

export interface BrokerUserProfile {
  userId: string;
  username: string;
  email?: string;
  phone?: string;
  currency: string;
  region: string;
  verified: boolean;
  kycLevel: string;
}

export interface BrokerBetRequest {
  matchId: string;
  selection: string;
  odds: number;
  stake: number;
  betType: string;
  market?: string;
  idempotencyKey?: string;
}

export interface BrokerBetStatus {
  brokerBetId: string;
  status: "pending" | "accepted" | "rejected" | "settled" | "cashed_out" | "void";
  stake: number;
  odds: number;
  potentialWin: number;
  cashoutAvailable: boolean;
  cashoutAmount?: number;
  settlementAmount?: number;
  settlementReason?: string;
}

export interface BrokerTransferResult {
  success: boolean;
  transferRef?: string;
  status?: "pending" | "completed" | "failed";
  error?: string;
}

export interface BrokerMarket {
  id: string;
  name: string;
  type: string;
  selections: Array<{
    name: string;
    odds: number;
  }>;
}

export interface BrokerLiveEvent {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  status: string;
  markets: BrokerMarket[];
}

// ==================== RETRY LOGIC ====================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: [
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "rate_limit",
    "server_error",
    "session_expired",
    "temporarily_unavailable",
  ],
};

async function withRetry<T>(
  fn: () => Promise<T>,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = cfg.retryableErrors.some(
        (err) => lastError!.message.toLowerCase().includes(err.toLowerCase())
      );

      if (!isRetryable || attempt === cfg.maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        cfg.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        cfg.maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ==================== IDEMPOTENCY ====================

// In-memory idempotency store (use Redis in production)
const idempotencyStore = new Map<string, { result: unknown; timestamp: number }>();
const IDEMPOTENCY_TTL = 3600000; // 1 hour

function checkIdempotency<T>(key: string): T | null {
  const entry = idempotencyStore.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL) {
    idempotencyStore.delete(key);
    return null;
  }

  return entry.result as T;
}

function setIdempotencyResult(key: string, result: unknown): void {
  idempotencyStore.set(key, { result, timestamp: Date.now() });

  // Clean up old entries periodically
  if (idempotencyStore.size > 10000) {
    const now = Date.now();
    for (const [k, v] of idempotencyStore) {
      if (now - v.timestamp > IDEMPOTENCY_TTL) {
        idempotencyStore.delete(k);
      }
    }
  }
}

// ==================== BASE ADAPTER ====================

abstract class BaseBrokerAdapter implements BrokerAdapter {
  abstract platformId: string;
  abstract platform: BrokerPlatform;

  // Per-instance demo mode override (set by getBrokerAdapter)
  _demoMode?: boolean;

  /**
   * Check if this adapter should operate in demo mode.
   * Per-instance override takes priority over global config.
   */
  protected isDemoMode(): boolean {
    if (this._demoMode !== undefined) return this._demoMode;
    return config.broker.demoMode;
  }

  abstract authenticate(credentials: BrokerCredentials): Promise<BrokerAuthResult>;
  abstract refreshSession(refreshToken: string): Promise<BrokerAuthResult>;
  abstract getBalance(accessToken: string, regionCode?: string): Promise<BrokerBalance>;
  abstract getProfile(accessToken: string): Promise<BrokerUserProfile>;
  abstract placeBet(accessToken: string, bet: BrokerBetRequest): Promise<BrokerBetResult>;
  abstract getBetStatus(accessToken: string, brokerBetId: string): Promise<BrokerBetStatus>;
  abstract cashout(accessToken: string, brokerBetId: string, type: "full" | "partial", partialPercent?: number): Promise<BrokerCashoutResult>;
  abstract transferToWallet(accessToken: string, amount: number, walletAddress: string, reference: string): Promise<BrokerTransferResult>;
  abstract getAvailableMarkets(accessToken: string, matchId: string): Promise<BrokerMarket[]>;
  abstract getLiveEvents(accessToken: string): Promise<BrokerLiveEvent[]>;

  validateSession(sessionToken: string, sessionExpiry: Date): BrokerSession {
    return validateBrokerSession(sessionToken, sessionExpiry);
  }

  // Common helper: make authenticated API call with retry
  protected async apiCall<T>(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<T> {
    const url = `${this.platform.baseUrl}${path}`;

    // Check idempotency
    if (options?.idempotencyKey) {
      const cached = checkIdempotency<T>(options.idempotencyKey);
      if (cached) return cached;
    }

    const result = await withRetry(async () => {
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": options?.idempotencyKey || "",
          "X-Platform": this.platformId,
          "X-App-Version": "1.0.0",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorCode = errorData.code || errorData.error || `HTTP_${response.status}`;
        const errorMessage = errorData.message || errorData.error || `API error: ${response.status}`;

        // Map common error codes
        if (response.status === 401) {
          throw new Error(`session_expired: ${errorMessage}`);
        }
        if (response.status === 429) {
          throw new Error(`rate_limit: ${errorMessage}`);
        }
        if (response.status >= 500) {
          throw new Error(`server_error: ${errorMessage}`);
        }

        throw new Error(`${errorCode}: ${errorMessage}`);
      }

      return response.json() as Promise<T>;
    });

    // Store idempotency result
    if (options?.idempotencyKey) {
      setIdempotencyResult(options.idempotencyKey, result);
    }

    return result;
  }
}

// ==================== OAUTH ADAPTER ====================

class OAuthBrokerAdapter extends BaseBrokerAdapter {
  platformId: string;
  platform: BrokerPlatform;

  constructor(platform: BrokerPlatform) {
    super();
    this.platformId = platform.id;
    this.platform = platform;
  }

  async authenticate(credentials: BrokerCredentials): Promise<BrokerAuthResult> {
    if (!credentials.token) {
      return { success: false, error: "OAuth authorization code required" };
    }

    // Demo/Sandbox mode: simulate successful authentication without real API calls
    if (this.isDemoMode()) {
      return {
        success: true,
        accessToken: `demo_oauth_${this.platformId}_${Date.now()}`,
        refreshToken: `demo_refresh_${this.platformId}_${Date.now()}`,
        sessionExpiry: new Date(Date.now() + 3600000),
        brokerUserId: `demo_oauth_${credentials.token.substring(0, 8)}_${Date.now()}`,
      };
    }

    try {
      // In production, exchange authorization code for access token
      // POST /oauth/token with client_id, client_secret, code, redirect_uri
      const result = await withRetry(async () => {
        const response = await fetch(`${this.platform.baseUrl}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code: credentials.token,
            client_id: process.env[`${this.platformId.toUpperCase()}_CLIENT_ID`],
            client_secret: process.env[`${this.platformId.toUpperCase()}_CLIENT_SECRET`],
            redirect_uri: `${config.platform.url}/api/broker/callback/${this.platformId}`,
          }),
        });

        if (!response.ok) {
          throw new Error(`OAuth token exchange failed: ${response.status}`);
        }

        return response.json();
      });

      return {
        success: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        sessionExpiry: new Date(Date.now() + (result.expires_in || 3600) * 1000),
        brokerUserId: result.user_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "OAuth authentication failed",
      };
    }
  }

  async refreshSession(refreshToken: string): Promise<BrokerAuthResult> {
    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.platform.baseUrl}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: process.env[`${this.platformId.toUpperCase()}_CLIENT_ID`],
            client_secret: process.env[`${this.platformId.toUpperCase()}_CLIENT_SECRET`],
          }),
        });

        if (!response.ok) {
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        return response.json();
      });

      return {
        success: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || refreshToken,
        sessionExpiry: new Date(Date.now() + (result.expires_in || 3600) * 1000),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Session refresh failed",
      };
    }
  }

  async getBalance(accessToken: string, regionCode?: string): Promise<BrokerBalance> {
    const currency = regionCode ? getRegionCurrency(regionCode) : { code: "USD" };

    // Demo/Sandbox mode: return simulated balance
    if (this.isDemoMode()) {
      const demoBalance = config.broker.demoBalance;
      return {
        available: demoBalance,
        locked: 0,
        total: demoBalance,
        currency: currency.code,
        lastUpdated: new Date(),
      };
    }

    try {
      const result = await this.apiCall<BrokerBalance>(accessToken, "GET", "/api/v1/balance");
      return result;
    } catch {
      // Fallback: return zero balance if API not available
      return {
        available: 0,
        locked: 0,
        total: 0,
        currency: currency.code,
        lastUpdated: new Date(),
      };
    }
  }

  async getProfile(accessToken: string): Promise<BrokerUserProfile> {
    if (this.isDemoMode()) {
      return {
        userId: "demo_user",
        username: "Demo User",
        currency: "USD",
        region: "global",
        verified: true,
        kycLevel: "full",
      };
    }
    return this.apiCall<BrokerUserProfile>(accessToken, "GET", "/api/v1/profile");
  }

  async placeBet(accessToken: string, bet: BrokerBetRequest): Promise<BrokerBetResult> {
    const idempotencyKey = bet.idempotencyKey || `${this.platformId}_${bet.matchId}_${bet.selection}_${Date.now()}`;

    try {
      const result = await this.apiCall<BrokerBetResult>(
        accessToken,
        "POST",
        "/api/v1/bets",
        {
          match_id: bet.matchId,
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          bet_type: bet.betType,
          market: bet.market,
          idempotency_key: idempotencyKey,
        },
        { idempotencyKey }
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Bet placement failed",
      };
    }
  }

  async getBetStatus(accessToken: string, brokerBetId: string): Promise<BrokerBetStatus> {
    return this.apiCall<BrokerBetStatus>(accessToken, "GET", `/api/v1/bets/${brokerBetId}`);
  }

  async cashout(accessToken: string, brokerBetId: string, type: "full" | "partial", partialPercent?: number): Promise<BrokerCashoutResult> {
    try {
      const result = await this.apiCall<BrokerCashoutResult>(
        accessToken,
        "POST",
        `/api/v1/bets/${brokerBetId}/cashout`,
        { type, partial_percent: partialPercent }
      );
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cashout failed",
      };
    }
  }

  async transferToWallet(accessToken: string, amount: number, walletAddress: string, reference: string): Promise<BrokerTransferResult> {
    try {
      const result = await this.apiCall<BrokerTransferResult>(
        accessToken,
        "POST",
        "/api/v1/transfers",
        {
          amount,
          wallet_address: walletAddress,
          reference,
          currency: "USD",
        }
      );
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Transfer failed",
      };
    }
  }

  async getAvailableMarkets(accessToken: string, matchId: string): Promise<BrokerMarket[]> {
    return this.apiCall<BrokerMarket[]>(accessToken, "GET", `/api/v1/matches/${matchId}/markets`);
  }

  async getLiveEvents(accessToken: string): Promise<BrokerLiveEvent[]> {
    return this.apiCall<BrokerLiveEvent[]>(accessToken, "GET", "/api/v1/events/live");
  }
}

// ==================== API KEY ADAPTER ====================

class ApiKeyBrokerAdapter extends BaseBrokerAdapter {
  platformId: string;
  platform: BrokerPlatform;

  constructor(platform: BrokerPlatform) {
    super();
    this.platformId = platform.id;
    this.platform = platform;
  }

  async authenticate(credentials: BrokerCredentials): Promise<BrokerAuthResult> {
    if (!credentials.apiKey) {
      return { success: false, error: "API key required" };
    }

    // Demo/Sandbox mode: simulate successful authentication without real API calls
    if (this.isDemoMode()) {
      return {
        success: true,
        accessToken: `demo_apikey_${this.platformId}_${Date.now()}`,
        sessionExpiry: new Date(Date.now() + 86400000 * 30),
        brokerUserId: `demo_apikey_${credentials.apiKey.substring(0, 8)}_${Date.now()}`,
      };
    }

    // Validate API key by making a test call
    try {
      const response = await fetch(`${this.platform.baseUrl}/api/v1/verify`, {
        headers: { "X-API-Key": credentials.apiKey },
      });

      if (!response.ok) {
        return { success: false, error: "Invalid API key" };
      }

      const data = await response.json();

      return {
        success: true,
        accessToken: credentials.apiKey,
        sessionExpiry: new Date(Date.now() + 86400000 * 30), // API keys are long-lived
        brokerUserId: data.user_id || `apikey_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "API key validation failed",
      };
    }
  }

  async refreshSession(refreshToken: string): Promise<BrokerAuthResult> {
    // API keys don't need refresh
    return {
      success: true,
      accessToken: refreshToken,
      sessionExpiry: new Date(Date.now() + 86400000 * 30),
    };
  }

  async getBalance(accessToken: string, regionCode?: string): Promise<BrokerBalance> {
    const currency = regionCode ? getRegionCurrency(regionCode) : { code: "USD" };

    if (this.isDemoMode()) {
      const demoBalance = config.broker.demoBalance;
      return { available: demoBalance, locked: 0, total: demoBalance, currency: currency.code, lastUpdated: new Date() };
    }

    try {
      const result = await this.apiCall<BrokerBalance>(accessToken, "GET", "/api/v1/balance");
      return result;
    } catch {
      return { available: 0, locked: 0, total: 0, currency: currency.code, lastUpdated: new Date() };
    }
  }

  async getProfile(accessToken: string): Promise<BrokerUserProfile> {
    if (this.isDemoMode()) {
      return { userId: "demo_user", username: "Demo User", currency: "USD", region: "global", verified: true, kycLevel: "full" };
    }
    return this.apiCall<BrokerUserProfile>(accessToken, "GET", "/api/v1/profile");
  }

  async placeBet(accessToken: string, bet: BrokerBetRequest): Promise<BrokerBetResult> {
    const idempotencyKey = bet.idempotencyKey || `${this.platformId}_${bet.matchId}_${bet.selection}_${Date.now()}`;

    try {
      return await this.apiCall<BrokerBetResult>(
        accessToken, "POST", "/api/v1/bets",
        {
          match_id: bet.matchId,
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          bet_type: bet.betType,
          market: bet.market,
          idempotency_key: idempotencyKey,
        },
        { idempotencyKey }
      );
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Bet placement failed" };
    }
  }

  async getBetStatus(accessToken: string, brokerBetId: string): Promise<BrokerBetStatus> {
    return this.apiCall<BrokerBetStatus>(accessToken, "GET", `/api/v1/bets/${brokerBetId}`);
  }

  async cashout(accessToken: string, brokerBetId: string, type: "full" | "partial", partialPercent?: number): Promise<BrokerCashoutResult> {
    try {
      return await this.apiCall<BrokerCashoutResult>(accessToken, "POST", `/api/v1/bets/${brokerBetId}/cashout`, { type, partial_percent: partialPercent });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Cashout failed" };
    }
  }

  async transferToWallet(accessToken: string, amount: number, walletAddress: string, reference: string): Promise<BrokerTransferResult> {
    try {
      return await this.apiCall<BrokerTransferResult>(accessToken, "POST", "/api/v1/transfers", { amount, wallet_address: walletAddress, reference });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Transfer failed" };
    }
  }

  async getAvailableMarkets(accessToken: string, matchId: string): Promise<BrokerMarket[]> {
    return this.apiCall<BrokerMarket[]>(accessToken, "GET", `/api/v1/matches/${matchId}/markets`);
  }

  async getLiveEvents(accessToken: string): Promise<BrokerLiveEvent[]> {
    return this.apiCall<BrokerLiveEvent[]>(accessToken, "GET", "/api/v1/events/live");
  }
}

// ==================== WEB SESSION ADAPTER ====================

class WebSessionBrokerAdapter extends BaseBrokerAdapter {
  platformId: string;
  platform: BrokerPlatform;

  constructor(platform: BrokerPlatform) {
    super();
    this.platformId = platform.id;
    this.platform = platform;
  }

  async authenticate(credentials: BrokerCredentials): Promise<BrokerAuthResult> {
    if (!credentials.username || !credentials.password) {
      return { success: false, error: "Username and password required" };
    }

    // Demo/Sandbox mode: simulate successful authentication without real API calls
    // This prevents 403 errors from real broker platforms that don't have public APIs
    if (this.isDemoMode()) {
      const sessionToken = `demo_session_${Buffer.from(credentials.username).toString("base64")}_${Date.now()}`;
      return {
        success: true,
        accessToken: sessionToken,
        sessionToken,
        refreshToken: `demo_refresh_${this.platformId}_${Date.now()}`,
        sessionExpiry: new Date(Date.now() + 7200000),
        brokerUserId: credentials.username,
      };
    }

    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.platform.baseUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: credentials.username,
            password: credentials.password,
            otp: credentials.otp,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || `Login failed: ${response.status}`);
        }

        return response.json();
      });

      return {
        success: true,
        accessToken: result.access_token || result.token,
        sessionToken: result.session_token || result.access_token,
        refreshToken: result.refresh_token,
        sessionExpiry: new Date(Date.now() + (result.expires_in || 7200) * 1000),
        brokerUserId: result.user_id || credentials.username,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  async refreshSession(refreshToken: string): Promise<BrokerAuthResult> {
    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.platform.baseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          throw new Error(`Session refresh failed: ${response.status}`);
        }

        return response.json();
      });

      return {
        success: true,
        accessToken: result.access_token || result.token,
        sessionToken: result.session_token,
        refreshToken: result.refresh_token || refreshToken,
        sessionExpiry: new Date(Date.now() + (result.expires_in || 7200) * 1000),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Session refresh failed",
      };
    }
  }

  async getBalance(accessToken: string, regionCode?: string): Promise<BrokerBalance> {
    const currency = regionCode ? getRegionCurrency(regionCode) : { code: "USD" };

    if (this.isDemoMode()) {
      const demoBalance = config.broker.demoBalance;
      return { available: demoBalance, locked: 0, total: demoBalance, currency: currency.code, lastUpdated: new Date() };
    }

    try {
      return await this.apiCall<BrokerBalance>(accessToken, "GET", "/api/v1/balance");
    } catch {
      return { available: 0, locked: 0, total: 0, currency: currency.code, lastUpdated: new Date() };
    }
  }

  async getProfile(accessToken: string): Promise<BrokerUserProfile> {
    if (this.isDemoMode()) {
      return { userId: "demo_user", username: "Demo User", currency: "USD", region: "global", verified: true, kycLevel: "full" };
    }
    return this.apiCall<BrokerUserProfile>(accessToken, "GET", "/api/v1/profile");
  }

  async placeBet(accessToken: string, bet: BrokerBetRequest): Promise<BrokerBetResult> {
    const idempotencyKey = bet.idempotencyKey || `${this.platformId}_${bet.matchId}_${bet.selection}_${Date.now()}`;

    try {
      return await this.apiCall<BrokerBetResult>(
        accessToken, "POST", "/api/v1/bets",
        {
          match_id: bet.matchId,
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          bet_type: bet.betType,
          market: bet.market,
          idempotency_key: idempotencyKey,
        },
        { idempotencyKey }
      );
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Bet placement failed" };
    }
  }

  async getBetStatus(accessToken: string, brokerBetId: string): Promise<BrokerBetStatus> {
    return this.apiCall<BrokerBetStatus>(accessToken, "GET", `/api/v1/bets/${brokerBetId}`);
  }

  async cashout(accessToken: string, brokerBetId: string, type: "full" | "partial", partialPercent?: number): Promise<BrokerCashoutResult> {
    try {
      return await this.apiCall<BrokerCashoutResult>(accessToken, "POST", `/api/v1/bets/${brokerBetId}/cashout`, { type, partial_percent: partialPercent });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Cashout failed" };
    }
  }

  async transferToWallet(accessToken: string, amount: number, walletAddress: string, reference: string): Promise<BrokerTransferResult> {
    try {
      return await this.apiCall<BrokerTransferResult>(accessToken, "POST", "/api/v1/transfers", { amount, wallet_address: walletAddress, reference });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Transfer failed" };
    }
  }

  async getAvailableMarkets(accessToken: string, matchId: string): Promise<BrokerMarket[]> {
    return this.apiCall<BrokerMarket[]>(accessToken, "GET", `/api/v1/matches/${matchId}/markets`);
  }

  async getLiveEvents(accessToken: string): Promise<BrokerLiveEvent[]> {
    return this.apiCall<BrokerLiveEvent[]>(accessToken, "GET", "/api/v1/events/live");
  }
}

// ==================== MANUAL ADAPTER (Demo / Manual Tracking) ====================

class ManualBrokerAdapter extends BaseBrokerAdapter {
  platformId = "manual";
  platform: BrokerPlatform;

  constructor() {
    super();
    this.platform = {
      id: "manual",
      name: "Manual Tracking",
      regions: [],
      authType: "manual",
      supportedSports: [],
      baseUrl: "",
      features: {
        liveBetting: false,
        cashout: false,
        partialCashout: false,
        accumulators: true,
        maxAccumulatorLegs: 20,
        minStake: 0,
        maxStake: Infinity,
        supportedMarkets: [],
        instantSettlement: false,
      },
      commissionDefault: 0.10,
    };
  }

  async authenticate(): Promise<BrokerAuthResult> {
    return {
      success: true,
      sessionExpiry: new Date(Date.now() + 86400000 * 365),
      brokerUserId: "manual_user",
    };
  }

  async refreshSession(): Promise<BrokerAuthResult> {
    return { success: true, sessionExpiry: new Date(Date.now() + 86400000 * 365) };
  }

  async getBalance(_accessToken: string, regionCode?: string): Promise<BrokerBalance> {
    const currency = regionCode ? getRegionCurrency(regionCode) : { code: "USD" };
    return { available: 0, locked: 0, total: 0, currency: currency.code, lastUpdated: new Date() };
  }

  async getProfile(): Promise<BrokerUserProfile> {
    return {
      userId: "manual",
      username: "Manual Tracking",
      currency: "USD",
      region: "global",
      verified: false,
      kycLevel: "none",
    };
  }

  async placeBet(): Promise<BrokerBetResult> {
    return { success: false, error: "Manual tracking does not support automatic bet placement" };
  }

  async getBetStatus(): Promise<BrokerBetStatus> {
    return {
      brokerBetId: "manual",
      status: "pending",
      stake: 0,
      odds: 0,
      potentialWin: 0,
      cashoutAvailable: false,
    };
  }

  async cashout(): Promise<BrokerCashoutResult> {
    return { success: false, error: "Manual tracking does not support cashout" };
  }

  async transferToWallet(): Promise<BrokerTransferResult> {
    return { success: false, error: "Manual tracking does not support transfers" };
  }

  async getAvailableMarkets(): Promise<BrokerMarket[]> {
    return [];
  }

  async getLiveEvents(): Promise<BrokerLiveEvent[]> {
    return [];
  }
}

// ==================== ADAPTER FACTORY ====================

const adapterCache = new Map<string, BrokerAdapter>();

/**
 * Get or create a broker adapter for the given platform
 * @param platformId - The platform ID
 * @param demoMode - If true, the adapter will use demo/sandbox mode (no real API calls)
 */
export function getBrokerAdapter(platformId: string, demoMode?: boolean): BrokerAdapter | null {
  // Check cache (but demo mode changes per-user, so we need a keyed cache)
  const cacheKey = demoMode !== undefined ? `${platformId}_${demoMode ? "demo" : "real"}` : platformId;
  if (adapterCache.has(cacheKey)) {
    return adapterCache.get(cacheKey)!;
  }

  // Manual adapter
  if (platformId === "manual") {
    const adapter = new ManualBrokerAdapter();
    adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  // Get platform config
  const platform = getBrokerPlatform(platformId);
  if (!platform) {
    console.error(`Unknown broker platform: ${platformId}`);
    return null;
  }

  // Create appropriate adapter based on auth type
  let adapter: BrokerAdapter;

  switch (platform.authType) {
    case "oauth":
      adapter = new OAuthBrokerAdapter(platform);
      break;
    case "api_key":
      adapter = new ApiKeyBrokerAdapter(platform);
      break;
    case "web_session":
      adapter = new WebSessionBrokerAdapter(platform);
      break;
    case "manual":
      adapter = new ManualBrokerAdapter();
      break;
    default:
      console.error(`Unsupported auth type: ${platform.authType}`);
      return null;
  }

  // Override demo mode if specified
  if (demoMode !== undefined) {
    (adapter as any)._demoMode = demoMode;
  }

  adapterCache.set(cacheKey, adapter);
  return adapter;
}

/**
 * Get all available broker adapters
 * Uses lazy import to avoid circular dependency at module load time
 */
export function getAvailableAdapters(): BrokerAdapter[] {
  const adapters: BrokerAdapter[] = [new ManualBrokerAdapter()];

  // Lazy import to avoid circular dependency at module load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BROKER_PLATFORMS } = require("./regions") as { BROKER_PLATFORMS: Array<{ id: string }> };

  const seen = new Set<string>();
  for (const platform of BROKER_PLATFORMS) {
    if (seen.has(platform.id)) continue;
    seen.add(platform.id);
    const adapter = getBrokerAdapter(platform.id);
    if (adapter) {
      adapters.push(adapter);
    }
  }

  return adapters;
}

// ==================== PRODUCTION API HELPERS ====================

/**
 * Place a bet on a broker with full safety checks
 */
export async function safePlaceBet(
  platformId: string,
  accessToken: string,
  bet: BrokerBetRequest,
  maxStake: number
): Promise<BrokerBetResult> {
  // Validate stake limits
  if (bet.stake <= 0) {
    return { success: false, error: "Stake must be positive" };
  }
  if (bet.stake > maxStake) {
    return { success: false, error: `Stake exceeds maximum allowed (${maxStake})` };
  }

  // Validate odds
  if (bet.odds < 1.01) {
    return { success: false, error: "Invalid odds" };
  }

  const adapter = getBrokerAdapter(platformId);
  if (!adapter) {
    return { success: false, error: `No adapter for platform: ${platformId}` };
  }

  // Generate idempotency key
  const idempotencyKey = `${platformId}_${bet.matchId}_${bet.selection}_${bet.stake}_${Date.now()}`;

  return adapter.placeBet(accessToken, {
    ...bet,
    idempotencyKey,
  });
}

/**
 * Execute cashout with safety checks
 */
export async function safeCashout(
  platformId: string,
  accessToken: string,
  brokerBetId: string,
  type: "full" | "partial",
  partialPercent?: number
): Promise<BrokerCashoutResult> {
  if (type === "partial" && (partialPercent === undefined || partialPercent <= 0 || partialPercent >= 100)) {
    return { success: false, error: "Partial cashout percentage must be between 0 and 100" };
  }

  const adapter = getBrokerAdapter(platformId);
  if (!adapter) {
    return { success: false, error: `No adapter for platform: ${platformId}` };
  }

  return adapter.cashout(accessToken, brokerBetId, type, partialPercent);
}

/**
 * Transfer commission to admin with safety checks
 */
export async function safeTransferCommission(
  platformId: string,
  accessToken: string,
  amount: number,
  adminWalletAddress: string,
  reference: string
): Promise<BrokerTransferResult> {
  if (amount <= 0) {
    return { success: false, error: "Transfer amount must be positive" };
  }

  if (!adminWalletAddress) {
    return { success: false, error: "Admin wallet address not configured" };
  }

  const adapter = getBrokerAdapter(platformId);
  if (!adapter) {
    return { success: false, error: `No adapter for platform: ${platformId}` };
  }

  return adapter.transferToWallet(accessToken, amount, adminWalletAddress, reference);
}
