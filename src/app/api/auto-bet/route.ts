import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { runAutoBetCycle } from "@/lib/auto-bet-runner";
import { countTickets, sumTicketStake } from "@/lib/bet-accounting";

/**
 * POST /api/auto-bet - execute one atomic Demo AUTO scan.
 * GET  /api/auto-bet - current automated betting status/activity.
 */
export async function POST() {
  try {
    const userId = await requireAuth();
    const result = await runAutoBetCycle(userId);
    const { statusCode, ...payload } = result;
    return NextResponse.json(payload, { status: statusCode });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    console.error("Auto-bet error:", error);
    return NextResponse.json(
      { error: "Failed to process auto-bet" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const userId = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const recentLogs = await prisma.botLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.findMany({
      where: {
        userId,
        isAutoPlaced: true,
        placedAt: { gte: todayStart },
      },
      include: { match: true, bettingAccount: true },
    });

    const [todayAccumulatorProfit, activeAllocation, todayCommission] =
      await Promise.all([
        prisma.accumulator.aggregate({
          where: {
            userId,
            isAutoPlaced: true,
            placedAt: { gte: todayStart },
            status: { in: ["won", "cashed_out"] },
          },
          _sum: { profit: true },
        }),
        prisma.allocation.findFirst({
          where: { userId, status: "active" },
          include: { bettingAccount: true },
        }),
        prisma.commissionLedger.findMany({
          where: {
            userId,
            createdAt: { gte: todayStart },
          },
        }),
      ]);

    const todayAutoBets = countTickets(todayBets);
    const todayAutoStake = sumTicketStake(todayBets);
    const todayStandaloneProfit = todayBets
      .filter(
        (bet) =>
          !bet.accumulatorId &&
          (bet.status === "won" || bet.status === "cashed_out")
      )
      .reduce((sum, bet) => sum + (bet.profit || 0), 0);
    const todayAutoProfit =
      todayStandaloneProfit + (todayAccumulatorProfit._sum.profit || 0);

    return NextResponse.json({
      status: user.settings.autoBettingEnabled ? "active" : "inactive",
      settings: {
        autoBettingEnabled: user.settings.autoBettingEnabled,
        brokerMode: user.settings.brokerMode,
        botMode: user.settings.botMode,
        realExecutionEnabled: false,
        backgroundAutoExecutionEnabled: true,
        riskLevel: user.settings.riskLevel,
        dailyBetLimit: user.settings.dailyBetLimit,
        stopLossDaily: user.settings.stopLossDaily,
        profitTargetDaily: user.settings.profitTargetDaily,
        betTypes: user.settings.betTypes,
        maxAccumulatorLegs: user.settings.maxAccumulatorLegs,
        waitFullSettlement: user.settings.waitFullSettlement,
      },
      todayStats: {
        betsPlaced: todayAutoBets,
        totalStake: todayAutoStake,
        profit: todayAutoProfit,
        dailyPnl: user.dailyPnl,
        weeklyPnl: user.weeklyPnl,
      },
      allocation: activeAllocation
        ? {
            id: activeAllocation.id,
            amount: activeAllocation.amount,
            usedAmount: activeAllocation.usedAmount,
            remainingAmount: activeAllocation.remainingAmount,
            profitFromAlloc: activeAllocation.profitFromAlloc,
            commissionFromAlloc: activeAllocation.commissionFromAlloc,
            broker: activeAllocation.bettingAccount.platform,
            currency: activeAllocation.bettingAccount.currency || "USD",
          }
        : null,
      commission: {
        todayTotal: todayCommission.reduce(
          (sum, entry) => sum + entry.commissionAmount,
          0
        ),
        todayPending: todayCommission
          .filter((entry) => entry.status === "pending")
          .reduce((sum, entry) => sum + entry.commissionAmount, 0),
        todayTransferred: todayCommission
          .filter((entry) => entry.status === "transferred")
          .reduce((sum, entry) => sum + entry.commissionAmount, 0),
      },
      recentLogs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    console.error("Error fetching bot status:", error);
    return NextResponse.json(
      { error: "Failed to fetch bot status" },
      { status: 500 }
    );
  }
}
