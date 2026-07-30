import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Get total users
    const totalUsers = await prisma.user.count();

    // Get total bets
    const totalBets = await prisma.bet.count();

    // Get total commission
    const commissionResult = await prisma.transaction.aggregate({
      where: { type: "commission" },
      _sum: { amount: true },
    });

    // Get total bet volume
    const betVolume = await prisma.bet.aggregate({
      _sum: { stake: true },
    });

    // Get won bets
    const wonBets = await prisma.bet.count({
      where: { status: "won" },
    });

    // Get lost bets
    const lostBets = await prisma.bet.count({
      where: { status: "lost" },
    });

    // Get pending bets
    const pendingBets = await prisma.bet.count({
      where: { status: "pending" },
    });

    // Get total profit across all users
    const profitResult = await prisma.user.aggregate({
      _sum: { totalProfit: true, totalLoss: true, commissionPaid: true },
    });

    // Get admin settings
    const adminSettings = await prisma.adminSettings.findFirst();

    // Get active matches
    const liveMatches = await prisma.match.count({
      where: { status: "live" },
    });

    const upcomingMatches = await prisma.match.count({
      where: { status: "upcoming" },
    });

    // Get users with their profit/loss
    const users = await prisma.user.findMany({
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
    });

    return NextResponse.json({
      totalUsers,
      totalBets,
      totalCommission: commissionResult._sum.amount || 0,
      totalBetVolume: betVolume._sum.stake || 0,
      wonBets,
      lostBets,
      pendingBets,
      totalProfit: profitResult._sum.totalProfit || 0,
      totalLoss: profitResult._sum.totalLoss || 0,
      totalCommissionPaid: profitResult._sum.commissionPaid || 0,
      winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 100) : 0,
      liveMatches,
      upcomingMatches,
      adminSettings,
      users,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
