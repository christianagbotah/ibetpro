import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getRiskPeriodStarts } from "@/lib/risk-period-pnl";

/**
 * Bot Logs API
 * GET /api/bot-logs - Get bot activity logs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const requestedOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(0, requestedOffset)
      : 0;

    const where: Record<string, unknown> = { userId };
    if (action) where.action = action;

    const logs = await prisma.botLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.botLog.count({ where });

    // Get summary stats using the user's local calendar day.
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const { dayStart: todayStart } = getRiskPeriodStarts(settings?.timezone);

    const todayLogs = await prisma.botLog.findMany({
      where: { userId, createdAt: { gte: todayStart } },
    });
    const realizedPnlActions = new Set([
      "bet_settled",
      "accumulator_settled",
      "cashout_executed",
    ]);

    const summary = {
      betsPlaced: todayLogs.filter((l) => l.action === "bet_placed").length,
      betsSkipped: todayLogs.filter((l) => l.action === "bet_skipped").length,
      cashoutsExecuted: todayLogs.filter((l) => l.action === "cashout_executed").length,
      cashoutsSkipped: todayLogs.filter((l) => l.action === "cashout_skipped").length,
      accumulatorsCreated: todayLogs.filter((l) => l.action === "accumulator_created").length,
      stopLossHit: todayLogs.filter((l) => l.action === "stop_loss_hit").length,
      profitTargetHit: todayLogs.filter((l) => l.action === "profit_target_hit").length,
      scheduleBlocked: todayLogs.filter((l) => l.action === "schedule_blocked").length,
      totalProfitImpact: todayLogs
        .filter((l) => realizedPnlActions.has(l.action))
        .reduce((sum, l) => sum + (l.profitImpact || 0), 0),
    };

    return NextResponse.json({
      logs,
      total,
      summary,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error fetching bot logs:", error);
    return NextResponse.json({ error: "Failed to fetch bot logs" }, { status: 500 });
  }
}
