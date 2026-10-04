import { prisma } from "./db";
import { checkRiskLimits } from "./ai-engine-v2";
import {
  runAutoBetCycle as runCoreAutoBetCycle,
  type AutoBetCycleResult,
  type AutoBetPlaced,
} from "./auto-bet-runner";
import { refreshRiskPeriodPnlCache } from "./risk-period-pnl";

export type { AutoBetCycleResult, AutoBetPlaced };

function blockedRiskResult(input: {
  reason: string;
  code: string;
  stopReason: "stop_loss" | "profit_target";
}): AutoBetCycleResult {
  return {
    statusCode: 409,
    betsPlaced: 0,
    bets: [],
    matchesScanned: 0,
    skipped: 0,
    dailyStake: 0,
    remainingDailyLimit: 0,
    allocationUsed: 0,
    remainingAllocation: 0,
    error: input.reason,
    code: input.code,
    shouldStop: true,
    stopReason: input.stopReason,
  };
}

/**
 * Safety wrapper around the shared AUTO runner.
 *
 * User.dailyPnl / weeklyPnl are compatibility cache fields used by the core
 * runner. Refresh them from authoritative calendar-period realized-PnL events,
 * and perform the risk gate here as well so weekly breaches are classified
 * correctly instead of being mislabeled as a daily profit target.
 */
export async function runAutoBetCycle(
  userId: string
): Promise<AutoBetCycleResult> {
  const pnl = await refreshRiskPeriodPnlCache(userId);
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      stopLossDaily: true,
      stopLossWeekly: true,
      profitTargetDaily: true,
      profitTargetWeekly: true,
    },
  });

  if (settings) {
    const riskCheck = checkRiskLimits(pnl.dailyPnl, pnl.weeklyPnl, settings);
    if (!riskCheck.canBet) {
      const dailyStopLoss = pnl.dailyPnl <= -settings.stopLossDaily;
      const weeklyStopLoss = pnl.weeklyPnl <= -settings.stopLossWeekly;
      const dailyProfitTarget = pnl.dailyPnl >= settings.profitTargetDaily;
      const stopLossHit = dailyStopLoss || weeklyStopLoss;

      const code = dailyStopLoss
        ? "DAILY_STOP_LOSS"
        : weeklyStopLoss
          ? "WEEKLY_STOP_LOSS"
          : dailyProfitTarget
            ? "DAILY_PROFIT_TARGET"
            : "WEEKLY_PROFIT_TARGET";

      return blockedRiskResult({
        reason: riskCheck.reason,
        code,
        stopReason: stopLossHit ? "stop_loss" : "profit_target",
      });
    }
  }

  return runCoreAutoBetCycle(userId);
}
