import {
  runAutoBetCycle as runCoreAutoBetCycle,
  type AutoBetCycleResult,
  type AutoBetPlaced,
} from "./auto-bet-runner";
import { refreshRiskPeriodPnlCache } from "./risk-period-pnl";

export type { AutoBetCycleResult, AutoBetPlaced };

/**
 * Safety wrapper around the shared AUTO runner.
 *
 * The core runner still consumes User.dailyPnl / weeklyPnl for its existing
 * risk-gate contract. Refresh those compatibility fields from authoritative,
 * calendar-period realized-PnL events immediately before every execution.
 */
export async function runAutoBetCycle(
  userId: string
): Promise<AutoBetCycleResult> {
  await refreshRiskPeriodPnlCache(userId);
  return runCoreAutoBetCycle(userId);
}
