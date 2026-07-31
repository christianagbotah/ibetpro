// ============================================================================
// iBetPro AI Bot Control API
// POST /api/bot/control - Start/stop the bot (uses background BotEngine)
// GET  /api/bot/control - Get bot status
// PATCH /api/bot/control - Run a manual scan cycle (on-demand)
// ============================================================================

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { botEngine } from "@/lib/bot-engine";

/**
 * GET - Get current bot session status
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const session = await prisma.botSession.findUnique({
      where: { userId },
    });

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Get recent bot logs
    const recentLogs = await prisma.botLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Get today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.findMany({
      where: {
        userId,
        isAutoPlaced: true,
        placedAt: { gte: todayStart },
      },
    });

    const todayAutoStake = todayBets.reduce((sum, b) => sum + b.stake, 0);
    const todayAutoProfit = todayBets
      .filter((b) => b.status === "won" || b.status === "cashed_out")
      .reduce((sum, b) => sum + (b.profit || 0), 0);

    // Get connected account info
    const connectedAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
      orderBy: { allocatedAmount: "desc" },
    });

    const activeAllocation = await prisma.allocation.findFirst({
      where: { userId, status: "active" },
    });

    // Get engine stats (in-memory)
    const engineStats = botEngine.getStatus(userId);

    return NextResponse.json({
      botStatus: session?.status || "stopped",
      engineRunning: botEngine.isRunning(userId),
      session: session ? {
        id: session.id,
        startedAt: session.startedAt,
        totalScans: session.totalScans,
        totalBetsPlaced: session.totalBetsPlaced,
        totalStakeUsed: session.totalStakeUsed,
        totalProfit: session.totalProfit,
        lastScanAt: session.lastScanAt,
        lastBetAt: session.lastBetAt,
        scanIntervalSec: session.scanIntervalSec,
        stopReason: session.stopReason,
      } : null,
      engineStats: engineStats ? {
        totalScans: engineStats.totalScans,
        totalBetsPlaced: engineStats.totalBetsPlaced,
        totalStakeUsed: engineStats.totalStakeUsed,
        totalProfit: engineStats.totalProfit,
        lastScanAt: engineStats.lastScanAt,
        lastBetAt: engineStats.lastBetAt,
        startedAt: engineStats.startedAt,
        errorCount: engineStats.errorCount,
        lastError: engineStats.lastError,
      } : null,
      settings: {
        autoBettingEnabled: settings?.autoBettingEnabled ?? true,
        riskLevel: settings?.riskLevel ?? "medium",
        dailyBetLimit: settings?.dailyBetLimit ?? 500,
        stopLossDaily: settings?.stopLossDaily ?? 200,
        profitTargetDaily: settings?.profitTargetDaily ?? 300,
        betScheduleStart: settings?.betScheduleStart ?? "08:00",
        betScheduleEnd: settings?.betScheduleEnd ?? "22:00",
      },
      todayStats: {
        betsPlaced: todayBets.length,
        totalStake: todayAutoStake,
        profit: todayAutoProfit,
      },
      allocation: activeAllocation ? {
        remaining: activeAllocation.remainingAmount,
        used: activeAllocation.usedAmount,
      } : connectedAccount ? {
        remaining: connectedAccount.allocatedAmount,
        used: 0,
      } : null,
      hasConnectedBroker: !!connectedAccount,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        reasoning: log.reasoning,
        confidence: log.confidence,
        profitImpact: log.profitImpact,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Bot status error:", error);
    return NextResponse.json({ error: "Failed to fetch bot status" }, { status: 500 });
  }
}

/**
 * POST - Start or stop the bot using the background BotEngine
 * Body: { action: "start" | "stop", scanIntervalSec?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json();
    const { action, scanIntervalSec } = body;

    if (!action || !["start", "stop"].includes(action)) {
      return NextResponse.json({ error: "Action must be 'start' or 'stop'" }, { status: 400 });
    }

    if (action === "start") {
      // Check if already running in the engine
      if (botEngine.isRunning(userId)) {
        return NextResponse.json({
          success: false,
          botStatus: "running",
          message: "Bot is already running in the background.",
        });
      }

      // Create or update bot session in DB
      await prisma.botSession.upsert({
        where: { userId },
        update: {
          status: "running",
          startedAt: new Date(),
          stoppedAt: null,
          totalScans: 0,
          totalBetsPlaced: 0,
          totalStakeUsed: 0,
          totalProfit: 0,
          lastScanAt: null,
          lastBetAt: null,
          stopReason: null,
          scanIntervalSec: scanIntervalSec || 30,
        },
        create: {
          userId,
          status: "running",
          startedAt: new Date(),
          scanIntervalSec: scanIntervalSec || 30,
        },
      });

      // Start the bot engine
      const result = await botEngine.start(userId, scanIntervalSec || 30);

      if (!result.success) {
        // Revert session status
        await prisma.botSession.update({
          where: { userId },
          data: { status: "stopped", stoppedAt: new Date(), stopReason: "start_failed" },
        });
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        botStatus: "running",
        message: result.message,
        engineRunning: true,
      });
    }

    if (action === "stop") {
      // Get session stats before stopping
      const session = await prisma.botSession.findUnique({ where: { userId } });
      const engineStats = botEngine.getStatus(userId);

      // Stop the bot engine
      await botEngine.stop(userId, "user_stopped");

      return NextResponse.json({
        success: true,
        botStatus: "stopped",
        message: "Bot stopped. It will no longer scan for matches or place bets.",
        engineRunning: false,
        sessionSummary: {
          totalScans: engineStats?.totalScans || session?.totalScans || 0,
          totalBetsPlaced: engineStats?.totalBetsPlaced || session?.totalBetsPlaced || 0,
          totalStakeUsed: engineStats?.totalStakeUsed || session?.totalStakeUsed || 0,
          totalProfit: engineStats?.totalProfit || session?.totalProfit || 0,
          runDuration: engineStats?.startedAt
            ? Math.round((Date.now() - engineStats.startedAt.getTime()) / 60000)
            : session?.startedAt
            ? Math.round((Date.now() - session.startedAt.getTime()) / 60000)
            : 0,
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Bot control error:", error);
    return NextResponse.json({ error: "Failed to control bot" }, { status: 500 });
  }
}

/**
 * PATCH - Run a manual scan cycle (on-demand, doesn't start the engine)
 * This is useful for the frontend to trigger an immediate scan without waiting
 * for the next interval tick.
 */
export async function PATCH() {
  try {
    const userId = await requireAuth();

    // Check if bot is running (either in engine or in DB)
    const engineRunning = botEngine.isRunning(userId);
    const session = await prisma.botSession.findUnique({ where: { userId } });

    if (!engineRunning && (!session || session.status !== "running")) {
      return NextResponse.json({ botStatus: "stopped", message: "Bot is not running" });
    }

    // If the engine is running, the next scan will happen automatically
    // Just return the current status
    const engineStats = botEngine.getStatus(userId);

    return NextResponse.json({
      botStatus: "running",
      engineRunning,
      message: engineRunning
        ? "Bot is running in the background. Next scan will happen automatically."
        : "Bot session is active but engine is not running. Try restarting the bot.",
      engineStats: engineStats ? {
        totalScans: engineStats.totalScans,
        totalBetsPlaced: engineStats.totalBetsPlaced,
        totalStakeUsed: engineStats.totalStakeUsed,
        lastScanAt: engineStats.lastScanAt,
        lastBetAt: engineStats.lastBetAt,
        errorCount: engineStats.errorCount,
      } : null,
      sessionStats: session ? {
        totalScans: session.totalScans,
        totalBetsPlaced: session.totalBetsPlaced,
        totalStakeUsed: session.totalStakeUsed,
        lastScanAt: session.lastScanAt,
        lastBetAt: session.lastBetAt,
      } : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Bot scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
