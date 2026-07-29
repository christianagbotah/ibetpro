import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { shouldCashout } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { betId } = body;

    if (!betId) {
      return NextResponse.json({ error: "Bet ID is required" }, { status: 400 });
    }

    const bet = await db.bet.findUnique({
      where: { id: betId },
      include: {
        match: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (!bet.match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = bet.match;

    // Run cashout analysis
    const cashoutRecommendation = shouldCashout(
      {
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        potentialWin: bet.potentialWin,
        status: bet.status,
      },
      {
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        minute: match.minute ?? 0,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
      }
    );

    // Update bet with cashout amount
    if (cashoutRecommendation.shouldCashout) {
      await db.bet.update({
        where: { id: betId },
        data: {
          cashoutAmount: cashoutRecommendation.cashoutAmount,
        },
      });
    }

    return NextResponse.json({
      betId,
      cashoutRecommendation,
      matchStatus: {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        minute: match.minute,
      },
    });
  } catch (error) {
    console.error("Error evaluating cashout:", error);
    return NextResponse.json({ error: "Failed to evaluate cashout" }, { status: 500 });
  }
}
