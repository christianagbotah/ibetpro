// ============================================================================
// iBetPro Bot Diagnostics Endpoint
// GET /api/bot/diagnose - Check why the bot might not be sending alerts
// Admin-only endpoint that checks every step of the signal delivery pipeline
// ============================================================================

import { NextResponse } from "next/server";
import { requireAuth, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { botEngine } from "@/lib/bot-engine";
import { getPrimaryDataSource } from "@/lib/config";
import { isWithinBetSchedule } from "@/lib/ai-engine-v2";

export async function GET() {
  try {
    const userId = await requireAuth();
    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const diagnostics: Record<string, unknown> = {};
    const issues: string[] = [];

    // 1. Check API keys configured
    const dataSource = getPrimaryDataSource();
    diagnostics.dataSource = dataSource;
    if (dataSource === "none") {
      issues.push("No API keys configured (ODDS_API_KEY, API_FOOTBALL_KEY). App is using demo data only.");
    }

    // 2. Check matches in DB
    const totalMatches = await prisma.match.count();
    const upcomingMatches = await prisma.match.count({ where: { status: "upcoming" } });
    const liveMatches = await prisma.match.count({ where: { status: "live" } });
    const finishedMatches = await prisma.match.count({ where: { status: "finished" } });
    diagnostics.matches = { total: totalMatches, upcoming: upcomingMatches, live: liveMatches, finished: finishedMatches };
    if (upcomingMatches === 0) {
      issues.push("No upcoming matches in database. The bot has nothing to scan. Run a sync or check API keys.");
    }

    // 3. Check user settings
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      issues.push("No UserSettings record found. Bot cannot run without settings.");
      diagnostics.settings = null;
    } else {
      diagnostics.settings = {
        botMode: settings.botMode,
        autoBettingEnabled: settings.autoBettingEnabled,
        notificationsEnabled: settings.notificationsEnabled,
        telegramChatId: settings.telegramChatId,
        tipSports: settings.tipSports,
        minTipConfidence: settings.minTipConfidence,
        minEdgeThreshold: settings.minEdgeThreshold,
        minOddsThreshold: settings.minOddsThreshold,
        maxOddsThreshold: settings.maxOddsThreshold,
        riskLevel: settings.riskLevel,
        betScheduleStart: settings.betScheduleStart,
        betScheduleEnd: settings.betScheduleEnd,
        kellyFraction: settings.kellyFraction,
      };

      // Check Telegram connection
      if (!settings.telegramChatId) {
        issues.push("Telegram not connected. No chatId set — alerts cannot be sent.");
      }
      if (!settings.notificationsEnabled) {
        issues.push("Notifications are disabled in settings. Enable them to receive alerts.");
      }

      // Check schedule (using user's timezone)
      const inSchedule = isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd, settings.timezone);
      diagnostics.scheduleCheck = {
        inSchedule,
        scheduleStart: settings.betScheduleStart,
        scheduleEnd: settings.betScheduleEnd,
        userTimezone: settings.timezone,
        serverTime: new Date().toISOString(),
        serverTimeLocal: new Date().toLocaleString(),
        serverTimeInUserTz: new Date().toLocaleString("en-US", { timeZone: settings.timezone || "UTC" }),
      };
      if (!inSchedule) {
        issues.push(`Bot is outside its schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd} ${settings.timezone}). Current time in user timezone: ${new Date().toLocaleString("en-US", { timeZone: settings.timezone || "UTC" })}. The bot will not scan until within schedule hours.`);
      }

      // Check confidence/edge thresholds
      if (settings.minTipConfidence > 0.8) {
        issues.push(`minTipConfidence is very high (${settings.minTipConfidence}). Consider lowering to 0.55-0.65 for more tips.`);
      }
      if (settings.minEdgeThreshold > 0.05) {
        issues.push(`minEdgeThreshold is very high (${settings.minEdgeThreshold}). Consider lowering to 0.02-0.03 for more tips.`);
      }
    }

    // 4. Check bot engine status
    const engineRunning = botEngine.isRunning(userId);
    const engineStats = botEngine.getStatus(userId);
    const session = await prisma.botSession.findUnique({ where: { userId } });
    diagnostics.botEngine = {
      running: engineRunning,
      sessionStatus: session?.status || "none",
      sessionStartedAt: session?.startedAt || null,
      totalScans: session?.totalScans || 0,
      totalBetsPlaced: session?.totalBetsPlaced || 0,
      lastScanAt: session?.lastScanAt || null,
      lastBetAt: session?.lastBetAt || null,
      scanIntervalSec: session?.scanIntervalSec || null,
      stopReason: session?.stopReason || null,
      engineStats: engineStats ? {
        totalScans: engineStats.totalScans,
        totalBetsPlaced: engineStats.totalBetsPlaced,
        errorCount: engineStats.errorCount,
        lastError: engineStats.lastError,
      } : null,
    };
    if (!engineRunning && (!session || session.status !== "running")) {
      issues.push("Bot engine is NOT running. Start the bot from the Live Monitor or Betting page.");
    }

    // 5. Check recent tips
    const recentTips = await prisma.tip.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        sport: true,
        homeTeam: true,
        awayTeam: true,
        selection: true,
        odds: true,
        aiConfidence: true,
        valueEdge: true,
        telegramSent: true,
        telegramSentAt: true,
        createdAt: true,
      },
    });
    diagnostics.recentTips = recentTips;
    if (recentTips.length === 0) {
      issues.push("No tips have ever been generated. The AI has not found any value bets matching your criteria.");
    } else {
      const tipsWithoutTelegram = recentTips.filter(t => !t.telegramSent);
      if (tipsWithoutTelegram.length > 0) {
        issues.push(`${tipsWithoutTelegram.length} recent tip(s) were not sent via Telegram. Check telegramChatId and notificationsEnabled.`);
      }
    }

    // 6. Check recent bot logs
    const recentLogs = await prisma.botLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        action: true,
        reasoning: true,
        createdAt: true,
      },
    });
    diagnostics.recentLogs = recentLogs;

    // 7. Check sample upcoming matches with sport filter
    if (settings) {
      const rawSports = settings.tipSports?.split(",") || ["football"];
      // Simple expansion for diagnosis
      const sportFilter = rawSports.flatMap(s => {
        if (s === "football" || s === "soccer") return ["football", "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a", "soccer_france_ligue_one"];
        if (s === "basketball") return ["basketball", "basketball_nba"];
        if (s === "tennis") return ["tennis", "tennis_atp_masters"];
        return [s];
      });

      const matchingMatches = await prisma.match.findMany({
        where: {
          status: "upcoming",
          sport: { in: sportFilter },
          commenceTime: { gte: new Date() },
        },
        orderBy: { commenceTime: "asc" },
        take: 5,
        select: {
          id: true,
          sport: true,
          league: true,
          homeTeam: true,
          awayTeam: true,
          homeOdds: true,
          awayOdds: true,
          commenceTime: true,
          apiSource: true,
        },
      });
      diagnostics.matchingMatches = matchingMatches;
      if (matchingMatches.length === 0 && upcomingMatches > 0) {
        issues.push(`There are ${upcomingMatches} upcoming matches but NONE match your tipSports filter (${settings.tipSports}). The sport keys in the DB may not match your filter.`);
      }
    }

    diagnostics.issues = issues;
    diagnostics.healthy = issues.length === 0;

    return NextResponse.json(diagnostics, { status: issues.length > 0 ? 200 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("[BotDiagnose] Error:", error);
    return NextResponse.json({ error: "Diagnosis failed" }, { status: 500 });
  }
}
