import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

// GET /api/stats/user - Get stats for authenticated user
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { settings: true },
    });

    if (!fullUser) {
      return NextResponse.json({
        balance: 0,
        totalProfit: 0,
        totalLoss: 0,
        commissionPaid: 0,
        bankroll: 1000,
      });
    }

    // Get bet stats
    const totalBets = await prisma.bet.count({ where: { userId: user.id } });
    const wonBets = await prisma.bet.count({ where: { userId: user.id, status: "won" } });
    const lostBets = await prisma.bet.count({ where: { userId: user.id, status: "lost" } });
    const pendingBets = await prisma.bet.count({ where: { userId: user.id, status: "pending" } });

    const betVolume = await prisma.bet.aggregate({
      where: { userId: user.id },
      _sum: { stake: true },
    });

    const commissionTotal = await prisma.transaction.aggregate({
      where: { userId: user.id, type: "commission" },
      _sum: { amount: true },
    });

    // Monthly profit for chart
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentTransactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: sixMonthsAgo },
        type: { in: ["bet_won", "bet_lost", "commission"] },
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by month
    const monthlyData: Record<string, { profit: number; loss: number; commission: number }> = {};
    for (const tx of recentTransactions) {
      const month = new Date(tx.createdAt).toLocaleString("default", { month: "short" });
      if (!monthlyData[month]) monthlyData[month] = { profit: 0, loss: 0, commission: 0 };
      if (tx.type === "bet_won") monthlyData[month].profit += tx.amount;
      if (tx.type === "bet_lost") monthlyData[month].loss += Math.abs(tx.amount);
      if (tx.type === "commission") monthlyData[month].commission += Math.abs(tx.amount);
    }

    return NextResponse.json({
      balance: fullUser.balance,
      totalProfit: fullUser.totalProfit,
      totalLoss: fullUser.totalLoss,
      commissionPaid: fullUser.commissionPaid,
      bankroll: fullUser.bankroll,
      settings: fullUser.settings,
      totalBets,
      wonBets,
      lostBets,
      pendingBets,
      winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 100) : 0,
      totalBetVolume: betVolume._sum.stake || 0,
      totalCommission: Math.abs(commissionTotal._sum.amount || 0),
      monthlyData: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        ...data,
      })),
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
