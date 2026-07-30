import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { config } from "@/lib/config";

/**
 * Settle a match with real results from the API
 * This replaces the simulated match endpoint with real result settlement
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Only admins can settle matches
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { matchId, homeScore, awayScore, status } = body;

    if (!matchId || homeScore === undefined || awayScore === undefined) {
      return NextResponse.json(
        { error: "Match ID, home score, and away score are required" },
        { status: 400 }
      );
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { bets: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status === "finished") {
      return NextResponse.json({ error: "Match already settled" }, { status: 400 });
    }

    // Update match with real results
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        status: status || "finished",
        minute: status === "finished" ? (match.sport === "football" ? 90 : null) : match.minute,
      },
      include: { bets: true },
    });

    // Settle bets if match is finished
    if (updatedMatch.status === "finished") {
      // Get commission rate from admin settings
      const adminSettings = await prisma.adminSettings.findFirst();
      const commissionRate = adminSettings?.defaultCommissionRate || config.commission.defaultRate;

      for (const bet of match.bets) {
        if (bet.status !== "pending") continue;

        let betWon = false;
        if (bet.selection === match.homeTeam) {
          betWon = homeScore > awayScore;
        } else if (bet.selection === match.awayTeam) {
          betWon = awayScore > homeScore;
        } else if (bet.selection === "Draw") {
          betWon = homeScore === awayScore;
        }

        const profit = betWon ? (bet.odds * bet.stake) - bet.stake : -bet.stake;

        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: betWon ? "won" : "lost",
            profit,
            settledAt: new Date(),
          },
        });

        if (betWon) {
          const commission = profit * commissionRate;

          await prisma.transaction.create({
            data: {
              userId: bet.userId,
              type: "bet_won",
              amount: bet.odds * bet.stake,
              currency: "USD",
              status: "completed",
              description: `Won bet on ${bet.selection} - ${match.homeTeam} vs ${match.awayTeam}`,
              betId: bet.id,
            },
          });

          await prisma.transaction.create({
            data: {
              userId: bet.userId,
              type: "commission",
              amount: -commission,
              currency: "USD",
              status: "completed",
              description: `Commission (${(commissionRate * 100).toFixed(0)}%) on winning bet - ${match.homeTeam} vs ${match.awayTeam}`,
              betId: bet.id,
            },
          });

          await prisma.user.update({
            where: { id: bet.userId },
            data: {
              totalProfit: { increment: profit - commission },
              commissionPaid: { increment: commission },
              balance: { increment: bet.odds * bet.stake - commission },
            },
          });
        } else {
          await prisma.transaction.create({
            data: {
              userId: bet.userId,
              type: "bet_lost",
              amount: 0,
              currency: "USD",
              status: "completed",
              description: `Lost bet on ${bet.selection} - ${match.homeTeam} vs ${match.awayTeam}`,
              betId: bet.id,
            },
          });

          await prisma.user.update({
            where: { id: bet.userId },
            data: {
              totalLoss: { increment: bet.stake },
            },
          });
        }
      }
    }

    return NextResponse.json({
      match: updatedMatch,
      settled: updatedMatch.status === "finished",
    });
  } catch (error) {
    console.error("Error settling match:", error);
    return NextResponse.json({ error: "Failed to settle match" }, { status: 500 });
  }
}
