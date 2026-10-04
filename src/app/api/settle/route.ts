import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { countTickets } from "@/lib/bet-accounting";
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
    const settlementStartedAt = new Date();

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
    const touchedAccumulatorIds = Array.from(
      new Set(
        settled
          .map((result) => result.accumulatorId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const settledAccumulatorTickets =
      touchedAccumulatorIds.length > 0
        ? await prisma.accumulator.findMany({
            where: {
              userId,
              id: { in: touchedAccumulatorIds },
              settledAt: { gte: settlementStartedAt },
              status: { in: ["won", "lost", "void"] },
            },
            select: {
              id: true,
              status: true,
              profit: true,
              commission: true,
            },
          })
        : [];

    const standaloneSettled = settled.filter(
      (result) => !result.accumulatorId
    );
    const resultAccumulatorIds = new Set(
      results
        .map((result) => result.accumulatorId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    const standaloneResults = results.filter((result) => !result.accumulatorId);
    const processedTickets = standaloneResults.length + resultAccumulatorIds.size;
    const settledTickets =
      standaloneSettled.length + settledAccumulatorTickets.length;
    const skippedTickets = Math.max(0, processedTickets - settledTickets);

    const totalProfit =
      standaloneSettled.reduce(
        (sum, result) => sum + (result.profit || 0),
        0
      ) +
      settledAccumulatorTickets.reduce(
        (sum, accumulator) => sum + (accumulator.profit || 0),
        0
      );
    const totalCommission =
      standaloneSettled.reduce(
        (sum, result) => sum + (result.commission || 0),
        0
      ) +
      settledAccumulatorTickets.reduce(
        (sum, accumulator) => sum + (accumulator.commission || 0),
        0
      );

    return NextResponse.json({
      settled: settledTickets,
      skipped: skippedTickets,
      processedTickets,
      processedRows: results.length,
      settledRows: settled.length,
      bets: settled,
      settledAccumulatorTickets: settledAccumulatorTickets.length,
      totalProfit,
      totalCommission,
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
      settleable: countTickets(settleableBets),
      settleableRows: settleableBets.length,
      settleableBets: settleableBets.map((bet) => ({
        id: bet.id,
        matchId: bet.matchId,
        betType: bet.betType,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        accumulatorId: bet.accumulatorId,
        match: {
          homeTeam: bet.match.homeTeam,
          awayTeam: bet.match.awayTeam,
          homeScore: bet.match.homeScore,
          awayScore: bet.match.awayScore,
          status: bet.match.status,
        },
      })),
      liveBets: countTickets(liveBets),
      liveBetRows: liveBets.length,
      liveBetsList: liveBets.map((bet) => ({
        id: bet.id,
        matchId: bet.matchId,
        betType: bet.betType,
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        accumulatorId: bet.accumulatorId,
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
