import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import {
  settleBetById,
  settleFinishedBetsForUser,
} from "@/lib/settlement";

/**
 * Bet Settlement Engine
 * POST /api/settle - idempotently settle supported resolved bets for the signed-in user.
 * GET /api/settle - show resolved/pending settlement and live-bet status.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const matchId =
      typeof body?.matchId === "string" && body.matchId ? body.matchId : null;

    let results;
    if (matchId) {
      const bets = await prisma.bet.findMany({
        where: {
          userId,
          matchId,
          status: { in: ["pending", "partial_cashout"] },
          match: { status: { in: ["finished", "cancelled", "void"] } },
        },
        select: { id: true },
        orderBy: { placedAt: "asc" },
      });
      results = [];
      for (const bet of bets) {
        results.push(await settleBetById(bet.id, userId));
      }
    } else {
      results = await settleFinishedBetsForUser(userId);
    }

    const settled = results.filter((result) => result.settled);
    return NextResponse.json({
      settled: settled.length,
      skipped: results.length - settled.length,
      bets: settled,
      totalProfit: settled.reduce(
        (sum, result) => sum + (result.profit || 0),
        0
      ),
      totalCommission: settled.reduce(
        (sum, result) => sum + (result.commission || 0),
        0
      ),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    console.error("Settlement error:", error);
    return NextResponse.json(
      { error: "Failed to settle bets" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const userId = await requireAuth();

    const [settleableBets, liveBets] = await Promise.all([
      prisma.bet.findMany({
        where: {
          userId,
          status: { in: ["pending", "partial_cashout"] },
          match: { status: { in: ["finished", "cancelled", "void"] } },
        },
        include: { match: true },
        orderBy: { placedAt: "asc" },
      }),
      prisma.bet.findMany({
        where: {
          userId,
          status: { in: ["pending", "partial_cashout"] },
          match: { status: "live" },
        },
        include: { match: true },
        orderBy: { placedAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      settleable: settleableBets.length,
      settleableBets: settleableBets.map((bet) => ({
        id: bet.id,
        matchId: bet.matchId,
        betType: bet.betType,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        match: {
          homeTeam: bet.match.homeTeam,
          awayTeam: bet.match.awayTeam,
          homeScore: bet.match.homeScore,
          awayScore: bet.match.awayScore,
          status: bet.match.status,
        },
      })),
      liveBets: liveBets.length,
      liveBetsList: liveBets.map((bet) => ({
        id: bet.id,
        matchId: bet.matchId,
        betType: bet.betType,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        match: {
          homeTeam: bet.match.homeTeam,
          awayTeam: bet.match.awayTeam,
          homeScore: bet.match.homeScore,
          awayScore: bet.match.awayScore,
          minute: bet.match.minute,
          status: bet.match.status,
        },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    console.error("Error fetching settlement status:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlement status" },
      { status: 500 }
    );
  }
}
