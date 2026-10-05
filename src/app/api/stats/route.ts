import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const [
      totalUsers,
      standaloneTotal,
      accumulatorTotal,
      standaloneWon,
      accumulatorWon,
      standaloneLost,
      accumulatorLost,
      standalonePending,
      accumulatorPending,
      standaloneVolume,
      accumulatorVolume,
      commissionResult,
      profitResult,
      adminSettings,
      liveMatches,
      upcomingMatches,
      users,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.bet.count({ where: { accumulatorId: null } }),
      prisma.accumulator.count(),
      prisma.bet.count({
        where: { accumulatorId: null, status: "won" },
      }),
      prisma.accumulator.count({ where: { status: "won" } }),
      prisma.bet.count({
        where: { accumulatorId: null, status: "lost" },
      }),
      prisma.accumulator.count({ where: { status: "lost" } }),
      prisma.bet.count({
        where: {
          accumulatorId: null,
          status: { in: ["pending", "partial_cashout"] },
        },
      }),
      prisma.accumulator.count({
        where: { status: { in: ["pending", "partial_cashout"] } },
      }),
      prisma.bet.aggregate({
        where: { accumulatorId: null },
        _sum: { stake: true },
      }),
      prisma.accumulator.aggregate({
        _sum: { stake: true },
      }),
      prisma.transaction.aggregate({
        where: { type: "commission" },
        _sum: { amount: true },
      }),
      prisma.user.aggregate({
        _sum: { totalProfit: true, totalLoss: true, commissionPaid: true },
      }),
      prisma.adminSettings.findFirst(),
      prisma.match.count({
        where: { status: "live" },
      }),
      prisma.match.count({
        where: { status: "upcoming" },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          balance: true,
          totalProfit: true,
          totalLoss: true,
          commissionPaid: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalBets = standaloneTotal + accumulatorTotal;
    const wonBets = standaloneWon + accumulatorWon;
    const lostBets = standaloneLost + accumulatorLost;
    const pendingBets = standalonePending + accumulatorPending;
    const totalBetVolume =
      (standaloneVolume._sum.stake || 0) +
      (accumulatorVolume._sum.stake || 0);
    const settledBets = wonBets + lostBets;
    const winRate =
      settledBets > 0 ? Math.round((wonBets / settledBets) * 100) : 0;
    const totalCommission = Math.abs(commissionResult._sum.amount || 0);

    return NextResponse.json({
      totalUsers,
      totalBets,
      totalCommission,
      totalBetVolume,
      wonBets,
      lostBets,
      pendingBets,
      totalProfit: profitResult._sum.totalProfit || 0,
      totalLoss: profitResult._sum.totalLoss || 0,
      totalCommissionPaid: profitResult._sum.commissionPaid || 0,
      winRate,
      liveMatches,
      upcomingMatches,
      adminSettings,
      users,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
