// ============================================================================
// iBetPro AI Bot Control API
// POST /api/bot/control - Start/stop the bot
// GET  /api/bot/control - Get bot status
// ============================================================================

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { analyzeMatch, shouldAutoBet, checkRiskLimits, isWithinBetSchedule } from "@/lib/ai-engine-v2";
import { placeBetOnBroker } from "@/lib/broker-integration";

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

    return NextResponse.json({
      botStatus: session?.status || "stopped",
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
 * POST - Start or stop the bot
 * Body: { action: "start" | "stop" }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json();
    const { action } = body;

    if (!action || !["start", "stop"].includes(action)) {
      return NextResponse.json({ error: "Action must be 'start' or 'stop'" }, { status: 400 });
    }

    // Get user settings
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      return NextResponse.json({ error: "Settings not found. Please configure your settings first." }, { status: 400 });
    }

    if (action === "start") {
      // Validate prerequisites
      if (!settings.autoBettingEnabled) {
        return NextResponse.json({ error: "Auto-betting is disabled. Enable it first." }, { status: 400 });
      }

      // Check for connected broker
      const connectedAccount = await prisma.bettingAccount.findFirst({
        where: { userId, isConnected: true },
      });

      if (!connectedAccount) {
        return NextResponse.json({ error: "No connected broker account. Connect a broker and set allocation first." }, { status: 400 });
      }

      if (connectedAccount.allocatedAmount <= 0) {
        return NextResponse.json({ error: "No allocation set. Allocate funds from your broker account first." }, { status: 400 });
      }

      // Check schedule
      if (!isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd)) {
        return NextResponse.json({
          error: `Outside betting schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd}). Bot will start when the schedule window opens.`,
          warning: true,
        }, { status: 400 });
      }

      // Check risk limits
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const riskCheck = checkRiskLimits(user?.dailyPnl || 0, user?.weeklyPnl || 0, {
        stopLossDaily: settings.stopLossDaily,
        stopLossWeekly: settings.stopLossWeekly,
        profitTargetDaily: settings.profitTargetDaily,
        profitTargetWeekly: settings.profitTargetWeekly,
      });

      if (!riskCheck.canBet) {
        return NextResponse.json({ error: `Risk limit reached: ${riskCheck.reason}` }, { status: 400 });
      }

      // Create or update bot session
      const session = await prisma.botSession.upsert({
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
          scanIntervalSec: 30,
        },
        create: {
          userId,
          status: "running",
          startedAt: new Date(),
          scanIntervalSec: 30,
        },
      });

      // Log bot start
      await prisma.botLog.create({
        data: {
          userId,
          action: "bot_started",
          reasoning: "User started the AI bot. It will scan for matches and place bets automatically.",
          details: JSON.stringify({
            broker: connectedAccount.platform,
            allocation: connectedAccount.allocatedAmount,
            riskLevel: settings.riskLevel,
            dailyLimit: settings.dailyBetLimit,
          }),
        },
      });

      // Run the first scan immediately
      const scanResult = await runScanCycle(userId, settings, connectedAccount.id);

      // Update session stats
      await prisma.botSession.update({
        where: { id: session.id },
        data: {
          totalScans: { increment: 1 },
          totalBetsPlaced: scanResult.betsPlaced,
          totalStakeUsed: scanResult.totalStake,
          lastScanAt: new Date(),
          lastBetAt: scanResult.betsPlaced > 0 ? new Date() : undefined,
        },
      });

      return NextResponse.json({
        success: true,
        botStatus: "running",
        message: scanResult.betsPlaced > 0
          ? `Bot started! Placed ${scanResult.betsPlaced} bet(s) in first scan.`
          : "Bot started! Scanning for matches. Will place bets automatically when opportunities arise.",
        firstScan: scanResult,
      });
    }

    if (action === "stop") {
      // Stop the bot
      const session = await prisma.botSession.findUnique({ where: { userId } });

      await prisma.botSession.upsert({
        where: { userId },
        update: {
          status: "stopped",
          stoppedAt: new Date(),
          stopReason: "user_stopped",
        },
        create: {
          userId,
          status: "stopped",
          stoppedAt: new Date(),
          stopReason: "user_stopped",
        },
      });

      // Log bot stop
      await prisma.botLog.create({
        data: {
          userId,
          action: "bot_stopped",
          reasoning: "User stopped the AI bot.",
          details: JSON.stringify({
            totalScans: session?.totalScans || 0,
            totalBetsPlaced: session?.totalBetsPlaced || 0,
            totalStakeUsed: session?.totalStakeUsed || 0,
            totalProfit: session?.totalProfit || 0,
            runDuration: session?.startedAt
              ? Math.round((Date.now() - session.startedAt.getTime()) / 60000)
              : 0,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        botStatus: "stopped",
        message: "Bot stopped. It will no longer scan for matches or place bets.",
        sessionSummary: {
          totalScans: session?.totalScans || 0,
          totalBetsPlaced: session?.totalBetsPlaced || 0,
          totalStakeUsed: session?.totalStakeUsed || 0,
          totalProfit: session?.totalProfit || 0,
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
 * Run a single scan cycle - analyze matches and place bets
 */
async function runScanCycle(
  userId: string,
  settings: any,
  bettingAccountId: string
): Promise<{ betsPlaced: number; totalStake: number; matches: number; skipped: number }> {
  const result = { betsPlaced: 0, totalStake: 0, matches: 0, skipped: 0 };

  // Check schedule
  if (!isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd)) {
    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_scan",
        reasoning: `Scan skipped: outside betting schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd})`,
      },
    });
    return result;
  }

  // Check risk limits
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const riskCheck = checkRiskLimits(user?.dailyPnl || 0, user?.weeklyPnl || 0, {
    stopLossDaily: settings.stopLossDaily,
    stopLossWeekly: settings.stopLossWeekly,
    profitTargetDaily: settings.profitTargetDaily,
    profitTargetWeekly: settings.profitTargetWeekly,
  });

  if (!riskCheck.canBet) {
    // Auto-stop the bot if risk limits hit
    await prisma.botSession.update({
      where: { userId },
      data: {
        status: "stopped",
        stoppedAt: new Date(),
        stopReason: user?.dailyPnl ?? 0 <= -settings.stopLossDaily ? "stop_loss" : "profit_target",
      },
    });
    await prisma.botLog.create({
      data: {
        userId,
        action: user?.dailyPnl ?? 0 <= -settings.stopLossDaily ? "stop_loss_hit" : "profit_target_hit",
        reasoning: riskCheck.reason,
      },
    });
    return result;
  }

  // Get betting account
  const bettingAccount = await prisma.bettingAccount.findFirst({
    where: { userId, isConnected: true },
    orderBy: { allocatedAmount: "desc" },
  });

  if (!bettingAccount || bettingAccount.allocatedAmount <= 0) {
    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_scan",
        reasoning: "No connected broker or allocation available. Stopping bot.",
      },
    });
    await prisma.botSession.update({
      where: { userId },
      data: { status: "stopped", stoppedAt: new Date(), stopReason: "no_allocation" },
    });
    return result;
  }

  // Check daily limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayBets = await prisma.bet.findMany({
    where: {
      userId,
      placedAt: { gte: todayStart },
      status: { in: ["pending", "won", "lost", "cashed_out", "partial_cashout"] },
    },
  });
  const dailyStake = todayBets.reduce((sum, b) => sum + b.stake, 0);
  const existingBetMatchIds = todayBets.map((b) => b.matchId);

  if (dailyStake >= settings.dailyBetLimit) {
    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_scan",
        reasoning: `Daily limit reached: $${dailyStake.toFixed(2)} / $${settings.dailyBetLimit.toFixed(2)}`,
      },
    });
    return result;
  }

  const remainingDailyLimit = Math.min(
    settings.dailyBetLimit - dailyStake,
    bettingAccount.allocatedAmount
  );

  if (remainingDailyLimit < 5) {
    return result;
  }

  // Get upcoming matches
  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "upcoming",
      sport: { in: settings.preferredSports?.split(",") || ["football"] },
      commenceTime: { gte: new Date() },
      id: { notIn: existingBetMatchIds },
    },
    orderBy: { commenceTime: "asc" },
    take: 20,
  });

  result.matches = upcomingMatches.length;

  // If no matches found, log it but don't stop the bot
  if (upcomingMatches.length === 0) {
    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_scan",
        reasoning: "No upcoming matches found. Will scan again in the next cycle.",
      },
    });
    return result;
  }

  // Analyze and place bets
  for (const match of upcomingMatches) {
    const homeTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.homeTeam, sport: match.sport },
    });
    const awayTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.awayTeam, sport: match.sport },
    });

    const prediction = analyzeMatch(
      {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds ?? undefined,
        awayOdds: match.awayOdds,
        overOdds: match.overOdds ?? undefined,
        underOdds: match.underOdds ?? undefined,
        overUnderLine: match.overUnderLine ?? undefined,
        status: match.status,
        commenceTime: match.commenceTime.toISOString(),
      },
      homeTeamStats,
      awayTeamStats,
      user?.bankroll || 1000,
      settings.kellyFraction
    );

    const autoBetCheck = shouldAutoBet(prediction, {
      minOddsThreshold: settings.minOddsThreshold,
      maxOddsThreshold: settings.maxOddsThreshold,
      minAiConfidence: settings.minAiConfidence,
      minEdgeThreshold: settings.minEdgeThreshold,
      riskLevel: settings.riskLevel,
      preferredSports: settings.preferredSports,
    }, match.sport);

    const recOdds = prediction.recommended === "home" ? match.homeOdds
      : prediction.recommended === "away" ? match.awayOdds
      : match.drawOdds || 3.0;

    // Check odds range
    if (recOdds < settings.minOddsThreshold || recOdds > settings.maxOddsThreshold) {
      result.skipped++;
      continue;
    }

    if (!autoBetCheck.shouldPlace) {
      result.skipped++;
      continue;
    }

    // Calculate stake
    const stake = Math.min(
      autoBetCheck.suggestedStake || settings.maxBetAmount * 0.5,
      settings.maxBetAmount,
      remainingDailyLimit - result.totalStake
    );

    if (stake < 5) continue;

    const selection = prediction.recommended === "home" ? match.homeTeam
      : prediction.recommended === "away" ? match.awayTeam
      : prediction.recommended === "draw" ? "Draw"
      : prediction.recommended === "over" ? "Over 2.5"
      : "Under 2.5";

    const potentialWin = Math.round(stake * recOdds * 100) / 100;

    // Place bet on broker
    const brokerResult = await placeBetOnBroker(
      bettingAccount.platform,
      bettingAccount.accessToken || "",
      {
        matchId: match.id,
        selection,
        odds: recOdds,
        stake,
        betType: "single",
      }
    );

    // Create bet record
    const bet = await prisma.bet.create({
      data: {
        userId,
        bettingAccountId: bettingAccount.id,
        matchId: match.id,
        betType: "single",
        selection,
        odds: recOdds,
        stake,
        potentialWin,
        isAutoPlaced: true,
        aiConfidence: prediction.confidence,
        aiReasoning: prediction.analysis,
        aiModelUsed: "v2_ensemble",
        kellyStake: prediction.kellyStake,
        valueEdge: prediction.valueEdge,
        riskScore: prediction.riskScore,
      },
    });

    // Update allocation
    const activeAllocation = await prisma.allocation.findFirst({
      where: { userId, bettingAccountId: bettingAccount.id, status: "active" },
    });

    if (activeAllocation) {
      await prisma.allocation.update({
        where: { id: activeAllocation.id },
        data: {
          usedAmount: { increment: stake },
          remainingAmount: { decrement: stake },
        },
      });
    }

    // Update betting account
    await prisma.bettingAccount.update({
      where: { id: bettingAccount.id },
      data: {
        allocatedAmount: { decrement: stake },
        lastBetPlacedAt: new Date(),
        totalBrokerBets: { increment: 1 },
      },
    });

    // Create transaction
    await prisma.transaction.create({
      data: {
        userId,
        type: "bet_placed",
        amount: -stake,
        currency: bettingAccount.currency || "USD",
        status: "completed",
        description: `Auto-bet via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${selection} @ ${recOdds}`,
        betId: bet.id,
      },
    });

    // Update match AI data
    await prisma.match.update({
      where: { id: match.id },
      data: {
        aiHomeWinProb: prediction.homeWinProb,
        aiDrawProb: prediction.drawProb,
        aiAwayWinProb: prediction.awayWinProb,
        aiConfidence: prediction.confidence,
        aiRecommended: prediction.recommended,
        aiAnalysis: prediction.analysis,
        aiRiskScore: prediction.riskScore,
        aiValueEdge: prediction.valueEdge,
        aiKellyStake: prediction.kellyStake,
      },
    });

    // Log the bet
    await prisma.botLog.create({
      data: {
        userId,
        action: "bet_placed",
        matchId: match.id,
        betId: bet.id,
        details: JSON.stringify({
          stake,
          odds: recOdds,
          selection,
          potentialWin,
          broker: bettingAccount.platform,
          brokerBetId: brokerResult.brokerBetId,
        }),
        reasoning: autoBetCheck.reason,
        confidence: prediction.confidence,
        profitImpact: -stake,
      },
    });

    result.betsPlaced++;
    result.totalStake += stake;
  }

  return result;
}

/**
 * PATCH - Run a scan cycle (called by frontend polling)
 */
export async function PATCH() {
  try {
    const userId = await requireAuth();

    const session = await prisma.botSession.findUnique({ where: { userId } });

    // Only scan if bot is running
    if (!session || session.status !== "running") {
      return NextResponse.json({ botStatus: "stopped", message: "Bot is not running" });
    }

    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      return NextResponse.json({ error: "Settings not found" }, { status: 400 });
    }

    const connectedAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
    });

    if (!connectedAccount) {
      // Auto-stop
      await prisma.botSession.update({
        where: { userId },
        data: { status: "stopped", stoppedAt: new Date(), stopReason: "no_allocation" },
      });
      return NextResponse.json({ botStatus: "stopped", message: "No connected broker. Bot stopped." });
    }

    // Run scan cycle
    const scanResult = await runScanCycle(userId, settings, connectedAccount.id);

    // Update session stats
    await prisma.botSession.update({
      where: { userId },
      data: {
        totalScans: { increment: 1 },
        totalBetsPlaced: { increment: scanResult.betsPlaced },
        totalStakeUsed: { increment: scanResult.totalStake },
        lastScanAt: new Date(),
        lastBetAt: scanResult.betsPlaced > 0 ? new Date() : undefined,
      },
    });

    // Check if bot was auto-stopped during scan
    const updatedSession = await prisma.botSession.findUnique({ where: { userId } });

    return NextResponse.json({
      botStatus: updatedSession?.status || "stopped",
      scanResult,
      totalScans: (session.totalScans || 0) + 1,
      totalBetsPlaced: (session.totalBetsPlaced || 0) + scanResult.betsPlaced,
      totalStakeUsed: (session.totalStakeUsed || 0) + scanResult.totalStake,
      lastScanAt: new Date(),
      stopReason: updatedSession?.stopReason,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Bot scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
