import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import {
  checkRateLimit,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { config } from "@/lib/config";
import {
  getCalendarMonthWindow,
  getRealizedPnlBreakdown,
  getRiskPeriodPnl,
} from "@/lib/risk-period-pnl";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const [userData, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          balance: true,
          totalProfit: true,
          totalLoss: true,
          commissionPaid: true,
          bankroll: true,
          createdAt: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId: user.id },
        select: { commissionRate: true, timezone: true },
      }),
    ]);

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const periodPnl = await getRiskPeriodPnl(user.id, settings?.timezone);

    // Bet rows belonging to an accumulator are legs, not independent wager
    // tickets. Count standalone bets and accumulator tickets separately, then
    // combine them so win rate / total bets match the money actually staked.
    const [
      standaloneWon,
      standaloneLost,
      standalonePending,
      standaloneTotal,
      accumulatorWon,
      accumulatorLost,
      accumulatorPending,
      accumulatorTotal,
      standaloneStakeResult,
      accumulatorStakeResult,
    ] = await Promise.all([
      prisma.bet.count({
        where: { userId: user.id, accumulatorId: null, status: "won" },
      }),
      prisma.bet.count({
        where: { userId: user.id, accumulatorId: null, status: "lost" },
      }),
      prisma.bet.count({
        where: {
          userId: user.id,
          accumulatorId: null,
          status: { in: ["pending", "partial_cashout"] },
        },
      }),
      prisma.bet.count({
        where: { userId: user.id, accumulatorId: null },
      }),
      prisma.accumulator.count({
        where: { userId: user.id, status: "won" },
      }),
      prisma.accumulator.count({
        where: { userId: user.id, status: "lost" },
      }),
      prisma.accumulator.count({
        where: {
          userId: user.id,
          status: { in: ["pending", "partial_cashout"] },
        },
      }),
      prisma.accumulator.count({ where: { userId: user.id } }),
      prisma.bet.aggregate({
        where: { userId: user.id, accumulatorId: null },
        _sum: { stake: true },
      }),
      prisma.accumulator.aggregate({
        where: { userId: user.id },
        _sum: { stake: true },
      }),
    ]);

    const wonBets = standaloneWon + accumulatorWon;
    const lostBets = standaloneLost + accumulatorLost;
    const pendingBets = standalonePending + accumulatorPending;
    const totalBets = standaloneTotal + accumulatorTotal;
    const totalStaked =
      (standaloneStakeResult._sum.stake || 0) +
      (accumulatorStakeResult._sum.stake || 0);

    const [
      autoStandaloneTotal,
      autoAccumulatorTotal,
      todayStandaloneStakeResult,
      todayAccumulatorStakeResult,
      todayCommissionResult,
    ] = await Promise.all([
      prisma.bet.count({
        where: {
          userId: user.id,
          accumulatorId: null,
          isAutoPlaced: true,
        },
      }),
      prisma.accumulator.count({
        where: { userId: user.id, isAutoPlaced: true },
      }),
      prisma.bet.aggregate({
        where: {
          userId: user.id,
          accumulatorId: null,
          placedAt: { gte: periodPnl.dayStart },
        },
        _sum: { stake: true },
      }),
      prisma.accumulator.aggregate({
        where: {
          userId: user.id,
          placedAt: { gte: periodPnl.dayStart },
        },
        _sum: { stake: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId: user.id,
          type: "commission",
          createdAt: { gte: periodPnl.dayStart },
        },
        _sum: { amount: true },
      }),
    ]);

    const autoBets = autoStandaloneTotal + autoAccumulatorTotal;
    const accumulatorBets = accumulatorTotal;
    const todayStaked =
      (todayStandaloneStakeResult._sum.stake || 0) +
      (todayAccumulatorStakeResult._sum.stake || 0);
    const todayCommission = Math.abs(todayCommissionResult._sum.amount || 0);

    const monthlyData: Array<{
      month: string;
      profit: number;
      loss: number;
      commission: number;
    }> = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const {
        start: monthStart,
        end: monthEnd,
        label: monthLabel,
      } = getCalendarMonthWindow(settings?.timezone, i, now);

      const [realizedPnl, monthCommission] = await Promise.all([
        getRealizedPnlBreakdown(user.id, monthStart, monthEnd),
        prisma.transaction.aggregate({
          where: {
            userId: user.id,
            type: "commission",
            createdAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amount: true },
        }),
      ]);

      const profit = realizedPnl.profit;
      const loss = realizedPnl.loss;

      monthlyData.push({
        month: monthLabel,
        profit,
        loss,
        commission: Math.abs(monthCommission._sum.amount || 0),
      });
    }

    const recentBets = await prisma.bet.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: "desc" },
      take: 5,
      select: {
        id: true,
        betType: true,
        selection: true,
        odds: true,
        stake: true,
        status: true,
        profit: true,
        placedAt: true,
        match: {
          select: { homeTeam: true, awayTeam: true, sport: true },
        },
      },
    });

    const activeAccounts = await prisma.bettingAccount.count({
      where: { userId: user.id, isConnected: true },
    });

    const settledBets = wonBets + lostBets;
    const winRate =
      settledBets > 0 ? Math.round((wonBets / settledBets) * 100) : 0;
    const roi =
      totalStaked > 0
        ? ((userData.totalProfit - userData.totalLoss) / totalStaked) * 100
        : 0;

    return NextResponse.json(
      {
        balance: userData.balance,
        bankroll: userData.bankroll,
        totalProfit: userData.totalProfit,
        totalLoss: userData.totalLoss,
        commissionPaid: userData.commissionPaid,
        commissionRate:
          settings?.commissionRate ?? config.commission.defaultRate,
        dailyPnl: periodPnl.dailyPnl,
        weeklyPnl: periodPnl.weeklyPnl,
        totalBets,
        wonBets,
        lostBets,
        pendingBets,
        winRate,
        roi: Math.round(roi * 100) / 100,
        totalStaked,
        autoBets,
        accumulatorBets,
        todayStaked,
        todayCommission,
        activeAccounts,
        monthlyData,
        recentBets,
        memberSince: userData.createdAt.toISOString(),
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch user stats" },
      { status: 500 }
    );
  }
}
