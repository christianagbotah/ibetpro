import { prisma } from "./db";
import {
  runAutoBetCycle,
  type AutoBetCycleResult,
} from "./risk-aware-auto-bet-runner";
import { syncMatchData } from "./sync-service";
import { settleFinishedBetsForUser } from "./settlement";

export interface AtomicBotEngineStats {
  userId: string;
  status: "running" | "stopped" | "paused";
  scanIntervalSec: number;
  totalScans: number;
  totalBetsPlaced: number;
  totalStakeUsed: number;
  totalProfit: number;
  lastScanAt: Date | null;
  lastBetAt: Date | null;
  startedAt: Date | null;
  errorCount: number;
  lastError: string | null;
}

/**
 * Background AUTO scheduler that only uses the atomic placement/settlement
 * services. It intentionally does not call the legacy auto-cashout routine;
 * full settlement is processed through the canonical settlement engine.
 */
export class AtomicAutoEngine {
  private timers = new Map<string, NodeJS.Timeout>();
  private stats = new Map<string, AtomicBotEngineStats>();
  private cyclesInProgress = new Set<string>();
  private shuttingDown = false;

  async start(
    userId: string,
    scanIntervalSec = 30
  ): Promise<{ success: boolean; message: string }> {
    if (this.isRunning(userId)) {
      return {
        success: true,
        message: "Atomic AUTO engine is already running for this user",
      };
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        botMode: true,
        brokerMode: true,
        autoBettingEnabled: true,
        autoCashoutEnabled: true,
      },
    });

    if (!settings) {
      return { success: false, message: "User settings not found" };
    }
    if (settings.botMode !== "auto") {
      return { success: false, message: "AUTO bot mode is not enabled" };
    }
    if (settings.brokerMode === "real") {
      return {
        success: false,
        message:
          "Automated Real-mode execution is disabled until verified broker execution is enabled",
      };
    }
    if (!settings.autoBettingEnabled) {
      return { success: false, message: "Auto-betting is disabled" };
    }

    const account = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true, allocatedAmount: { gt: 0 } },
      orderBy: { allocatedAmount: "desc" },
      select: { id: true },
    });
    if (!account) {
      return {
        success: false,
        message: "No connected Demo betting account with available allocation",
      };
    }

    const existingSession = await prisma.botSession.findUnique({
      where: { userId },
    });
    const preservingRecovery = existingSession?.status === "running";
    const interval = Math.max(10, Math.floor(scanIntervalSec || 30));

    const session = await prisma.botSession.upsert({
      where: { userId },
      update: preservingRecovery
        ? { scanIntervalSec: interval, stoppedAt: null, stopReason: null }
        : {
            status: "running",
            startedAt: new Date(),
            stoppedAt: null,
            totalScans: 0,
            totalBetsPlaced: 0,
            totalStakeUsed: 0,
            totalProfit: 0,
            lastScanAt: null,
            lastBetAt: null,
            scanIntervalSec: interval,
            stopReason: null,
          },
      create: {
        userId,
        status: "running",
        startedAt: new Date(),
        scanIntervalSec: interval,
      },
    });

    const stats: AtomicBotEngineStats = {
      userId,
      status: "running",
      scanIntervalSec: interval,
      totalScans: session.totalScans,
      totalBetsPlaced: session.totalBetsPlaced,
      totalStakeUsed: session.totalStakeUsed,
      totalProfit: session.totalProfit,
      lastScanAt: session.lastScanAt,
      lastBetAt: session.lastBetAt,
      startedAt: session.startedAt || new Date(),
      errorCount: 0,
      lastError: null,
    };
    this.stats.set(userId, stats);

    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_started",
        reasoning: `Atomic background AUTO engine started. Scanning every ${interval}s.`,
        details: JSON.stringify({
          mode: "auto",
          engine: "atomic-v1",
          scanIntervalSec: interval,
          autoCashoutEnabled: settings.autoCashoutEnabled,
          autoCashoutExecution: "manual-v3-endpoint-only",
        }),
      },
    });

    const first = await this.executeCycle(userId);
    if (first?.shouldStop || !this.stats.has(userId)) {
      return {
        success: false,
        message:
          first?.error || first?.message || "AUTO engine stopped during its first scan",
      };
    }

    const timer = setInterval(() => {
      void this.executeCycle(userId);
    }, interval * 1000);
    this.timers.set(userId, timer);

    return {
      success: true,
      message:
        first && first.betsPlaced > 0
          ? `Atomic AUTO started and placed ${first.betsPlaced} wager ticket(s) in the first scan.`
          : "Atomic AUTO started. It is scanning safely in the background.",
    };
  }

  private async executeCycle(
    userId: string
  ): Promise<AutoBetCycleResult | null> {
    if (this.shuttingDown || this.cyclesInProgress.has(userId)) return null;
    if (!this.stats.has(userId)) return null;

    this.cyclesInProgress.add(userId);
    try {
      const session = await prisma.botSession.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (!session || session.status !== "running") {
        await this.stop(userId, "session_expired");
        return null;
      }

      try {
        await syncMatchData(false);
      } catch (syncError) {
        console.warn(
          "[AtomicAutoEngine] Match sync failed; using existing data:",
          syncError
        );
      }

      let settlementProfit = 0;
      try {
        const settlementStartedAt = new Date();
        const settlements = await settleFinishedBetsForUser(userId);
        const settledResults = settlements.filter((result) => result.settled);
        const touchedAccumulatorIds = Array.from(
          new Set(
            settledResults
              .map((result) => result.accumulatorId)
              .filter(
                (id): id is string => typeof id === "string" && id.length > 0
              )
          )
        );

        const settledAccumulatorTickets =
          touchedAccumulatorIds.length > 0
            ? await prisma.accumulator.findMany({
                where: {
                  userId,
                  id: { in: touchedAccumulatorIds },
                  settledAt: { gte: settlementStartedAt },
                  status: { in: ["won", "lost", "void"] },
                },
                select: { profit: true },
              })
            : [];

        const standaloneProfit = settledResults
          .filter((result) => !result.accumulatorId)
          .reduce((sum, result) => sum + (result.profit || 0), 0);
        const accumulatorProfit = settledAccumulatorTickets.reduce(
          (sum, accumulator) => sum + (accumulator.profit || 0),
          0
        );
        settlementProfit = standaloneProfit + accumulatorProfit;
      } catch (settlementError) {
        console.error(
          "[AtomicAutoEngine] Settlement cycle failed:",
          settlementError
        );
      }

      const result = await runAutoBetCycle(userId);
      const current = this.stats.get(userId);
      if (!current) return result;

      current.totalScans += 1;
      current.totalBetsPlaced += result.betsPlaced;
      current.totalStakeUsed += result.allocationUsed;
      current.totalProfit += settlementProfit;
      current.lastScanAt = new Date();
      current.lastError = result.error || null;
      if (result.error) current.errorCount += 1;
      else current.errorCount = 0;
      if (result.betsPlaced > 0) current.lastBetAt = new Date();

      await prisma.botSession.update({
        where: { userId },
        data: {
          totalScans: { increment: 1 },
          totalBetsPlaced: { increment: result.betsPlaced },
          totalStakeUsed: { increment: result.allocationUsed },
          totalProfit:
            settlementProfit !== 0 ? { increment: settlementProfit } : undefined,
          lastScanAt: new Date(),
          lastBetAt: result.betsPlaced > 0 ? new Date() : undefined,
        },
      });

      if (result.betsPlaced > 0 || current.totalScans % 10 === 0) {
        await prisma.botLog.create({
          data: {
            userId,
            action: "bot_scan",
            reasoning: `Atomic AUTO scan #${current.totalScans}: ${result.matchesScanned} matches, ${result.betsPlaced} wager ticket(s), ${result.skipped} skipped.`,
            details: JSON.stringify({
              engine: "atomic-v1",
              scanNumber: current.totalScans,
              matchesScanned: result.matchesScanned,
              betsPlaced: result.betsPlaced,
              stakeUsed: result.allocationUsed,
              settledProfit: settlementProfit,
              code: result.code,
            }),
            profitImpact: settlementProfit || undefined,
          },
        });
      }

      if (result.shouldStop) {
        await this.stop(userId, result.stopReason || "auto_stopped");
      } else if (current.errorCount >= 10) {
        await this.stop(userId, "too_many_errors");
      }

      return result;
    } catch (error) {
      const current = this.stats.get(userId);
      if (current) {
        current.errorCount += 1;
        current.lastError =
          error instanceof Error ? error.message : "Unknown error";
        if (current.errorCount >= 10) {
          await this.stop(userId, "too_many_errors");
        }
      }
      console.error(`[AtomicAutoEngine] Scan failed for ${userId}:`, error);
      return null;
    } finally {
      this.cyclesInProgress.delete(userId);
    }
  }

  async stop(userId: string, reason = "user_stopped"): Promise<void> {
    const timer = this.timers.get(userId);
    if (timer) clearInterval(timer);
    this.timers.delete(userId);

    const stats = this.stats.get(userId);
    if (stats) stats.status = "stopped";
    this.stats.delete(userId);

    await prisma.botSession.upsert({
      where: { userId },
      update: {
        status: "stopped",
        stoppedAt: new Date(),
        stopReason: reason,
      },
      create: {
        userId,
        status: "stopped",
        stoppedAt: new Date(),
        stopReason: reason,
      },
    });

    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_stopped",
        reasoning: `Atomic AUTO engine stopped. Reason: ${reason}`,
        details: JSON.stringify({ engine: "atomic-v1", reason }),
      },
    });
  }

  isRunning(userId: string): boolean {
    return (
      this.timers.has(userId) &&
      this.stats.get(userId)?.status === "running"
    );
  }

  getStatus(userId: string): AtomicBotEngineStats | null {
    return this.stats.get(userId) || null;
  }

  getAllRunningStats(): AtomicBotEngineStats[] {
    return Array.from(this.stats.values()).filter(
      (stat) => stat.status === "running"
    );
  }

  getRunningCount(): number {
    return this.timers.size;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.stats.clear();
  }
}

export const atomicAutoEngine = new AtomicAutoEngine();
