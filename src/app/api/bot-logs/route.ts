import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Bot Logs API
 * GET /api/bot-logs - Get bot activity logs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const where: Record<string, unknown> = { userId };
    if (action) where.action = action;

    const logs = await prisma.botLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.botLog.count({ where });

    // Get summary stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayLogs = await prisma.botLog.findMany({
      where: { userId, createdAt: { gte: todayStart } },
    });

    const summary = {
      betsPlaced: todayLogs.filter((l) => l.action === "bet_placed").length,
      betsSkipped: todayLogs.filter((l) => l.action === "bet_skipped").length,
      cashoutsExecuted: todayLogs.filter((l) => l.action === "cashout_executed").length,
      cashoutsSkipped: todayLogs.filter((l) => l.action === "cashout_skipped").length,
      accumulatorsCreated: todayLogs.filter((l) => l.action === "accumulator_created").length,
      stopLossHit: todayLogs.filter((l) => l.action === "stop_loss_hit").length,
      profitTargetHit: todayLogs.filter((l) => l.action === "profit_target_hit").length,
      scheduleBlocked: todayLogs.filter((l) => l.action === "schedule_blocked").length,
      totalProfitImpact: todayLogs.reduce((sum, l) => sum + (l.profitImpact || 0), 0),
    };

    return NextResponse.json({
      logs,
      total,
      summary,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Error fetching bot logs:", error);
    return NextResponse.json({ error: "Failed to fetch bot logs" }, { status: 500 });
  }
}
