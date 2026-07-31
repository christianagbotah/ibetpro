import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
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
          dailyPnl: true,
          weeklyPnl: true,
          createdAt: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId: user.id },
        select: { commissionRate: true },
      }),
    ]);

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [wonBets, lostBets, pendingBets, totalBets] = await Promise.all([
      prisma.bet.count({ where: { userId: user.id, status: "won" } }),
      prisma.bet.count({ where: { userId: user.id, status: "lost" } }),
      prisma.bet.count({ where: { userId: user.id, status: "pending" } }),
      prisma.bet.count({ where: { userId: user.id } }),
    ]);

    const stakeResult = await prisma.bet.aggregate({
      where: { userId: user.id },
      _sum: { stake: true },
    });

    const monthlyData: Array<{ month: string; profit: number; loss: number; commission: number }> = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      const [monthProfit, monthLoss, monthCommission] = await Promise.all([
        prisma.bet.aggregate({
          where: { userId: user.id, status: "won", settledAt: { gte: monthStart, lt: monthEnd } },
          _sum: { profit: true },
        }),
        prisma.bet.aggregate({
          where: { userId: user.id, status: "lost", settledAt: { gte: monthStart, lt: monthEnd } },
          _sum: { stake: true },
        }),
        prisma.transaction.aggregate({
          where: { userId: user.id, type: "commission", createdAt: { gte: monthStart, lt: monthEnd } },
          _sum: { amount: true },
        }),
      ]);

      monthlyData.push({
        month: monthLabel,
        profit: monthProfit._sum.profit || 0,
        loss: monthLoss._sum.stake || 0,
        commission: monthCommission._sum.amount || 0,
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
        match: { select: { homeTeam: true, awayTeam: true, sport: true } },
      },
    });

    const activeAccounts = await prisma.bettingAccount.count({
      where: { userId: user.id, isConnected: true },
    });

    const totalStaked = stakeResult._sum.stake || 0;
    const settledBets = wonBets + lostBets;
    const winRate = settledBets > 0 ? Math.round((wonBets / settledBets) * 100) : 0;
    const roi = totalStaked > 0 ? ((userData.totalProfit - userData.totalLoss) / totalStaked) * 100 : 0;

    return NextResponse.json({
      balance: userData.balance,
      bankroll: userData.bankroll,
      totalProfit: userData.totalProfit,
      totalLoss: userData.totalLoss,
      commissionPaid: userData.commissionPaid,
      commissionRate: settings?.commissionRate ?? 0.10,
      dailyPnl: userData.dailyPnl,
      weeklyPnl: userData.weeklyPnl,
      totalBets,
      wonBets,
      lostBets,
      pendingBets,
      winRate,
      roi: Math.round(roi * 100) / 100,
      totalStaked,
      activeAccounts,
      monthlyData,
      recentBets,
      memberSince: userData.createdAt.toISOString(),
    }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
