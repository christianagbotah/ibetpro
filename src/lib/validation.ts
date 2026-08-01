// ============================================================================
// iBetPro API Validation Schemas
// Zod schemas for all API route input validation
// ============================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

// ==================== AUTH ====================

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long"),
});

// ==================== BETS ====================

export const createBetSchema = z.object({
  matchId: z.string().min(1, "Match ID is required"),
  bettingAccountId: z.string().min(1, "Betting account ID is required"),
  betType: z.enum(["match_winner", "over_under", "both_teams_score", "double_chance", "draw_no_bet", "handicap"]),
  selection: z.string().min(1, "Selection is required").max(200),
  odds: z.number().positive("Odds must be positive").max(100, "Odds too high"),
  stake: z.number().positive("Stake must be positive").max(100000, "Stake exceeds maximum"),
  isAutoPlaced: z.boolean().optional().default(false),
  aiConfidence: z.number().min(0).max(1).optional(),
});

// ==================== MATCHES ====================

export const settleMatchSchema = z.object({
  matchId: z.string().min(1, "Match ID is required"),
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
  status: z.enum(["finished", "live", "postponed", "cancelled"]).optional().default("finished"),
});

// ==================== ACCOUNTS ====================

export const createAccountSchema = z.object({
  platform: z.enum(["bet365", "betway", "1xbet", "sportybet", "stake", "pinnacle"]),
  accountId: z.string().min(1).max(100),
  accountName: z.string().min(1).max(100),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  balance: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("USD"),
});

// ==================== AI ====================

export const analyzeMatchSchema = z.object({
  matchId: z.string().min(1, "Match ID is required"),
  forceRefresh: z.boolean().optional().default(false),
});

export const cashoutSchema = z.object({
  betId: z.string().min(1, "Bet ID is required"),
  forceCashout: z.boolean().optional().default(false),
});

export const detailedAnalysisSchema = z.object({
  matchId: z.string().min(1, "Match ID is required"),
});

// ==================== SYNC ====================

export const syncSchema = z.object({
  source: z.enum(["odds-api", "api-football", "auto"]),
});

// ==================== SETTINGS ====================

export const updateSettingsSchema = z.object({
  autoBettingEnabled: z.boolean().optional(),
  maxBetAmount: z.number().min(1).max(100000).optional(),
  minOddsThreshold: z.number().min(1).max(100).optional(),
  maxOddsThreshold: z.number().min(1).max(100).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  autoCashoutEnabled: z.boolean().optional(),
  cashoutThreshold: z.number().min(0.1).max(1).optional(),
  commissionRate: z.number().min(0.01).max(0.5).optional(),
  preferredSports: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  dailyBetLimit: z.number().min(10).max(1000000).optional(),
  kellyFraction: z.number().min(0.01).max(1).optional(),
  minEdgeThreshold: z.number().min(0).max(0.5).optional(),
  brokerMode: z.enum(["demo", "real"]).optional(),
  // Advisor mode fields
  botMode: z.enum(["advisor", "auto"]).optional(),
  minTipConfidence: z.number().min(0.1).max(1).optional(),
  tipSports: z.string().optional(),
  stopLossDaily: z.number().min(0).max(1000000).optional(),
  stopLossWeekly: z.number().min(0).max(1000000).optional(),
  profitTargetDaily: z.number().min(0).max(1000000).optional(),
  profitTargetWeekly: z.number().min(0).max(1000000).optional(),
  partialCashoutEnabled: z.boolean().optional(),
  waitFullSettlement: z.boolean().optional(),
  maxAccumulatorLegs: z.number().int().min(2).max(20).optional(),
  betScheduleStart: z.string().optional(),
  betScheduleEnd: z.string().optional(),
  minAiConfidence: z.number().min(0.1).max(1).optional(),
});

// ==================== ADMIN ====================

export const updateAdminSettingsSchema = z.object({
  defaultCommissionRate: z.number().min(0.01).max(0.5).optional(),
  minCommissionRate: z.number().min(0.01).max(0.5).optional(),
  maxCommissionRate: z.number().min(0.01).max(0.5).optional(),
  platformName: z.string().min(1).max(100).optional(),
  maintenanceMode: z.boolean().optional(),
  maxUsers: z.number().int().min(1).max(1000000).optional(),
  autoApproveAccounts: z.boolean().optional(),
  oddsApiKey: z.string().optional(),
  apiFootballKey: z.string().optional(),
});

// ==================== HELPER ====================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: NextResponse } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      const errorList = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return {
        success: false,
        error: NextResponse.json({ error: `Validation failed: ${errorList}` }, { status: 400 }),
      };
    }
    return {
      success: false,
      error: NextResponse.json({ error: "Invalid input" }, { status: 400 }),
    };
  }
}
