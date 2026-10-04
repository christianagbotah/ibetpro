import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { settleBetById } from "@/lib/settlement";
import { NextRequest, NextResponse } from "next/server";

function poissonRandom(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/**
 * Advance a demo fixture only. This endpoint never performs its own financial
 * accounting; once the fixture finishes every attached wager is handed to the
 * canonical idempotent settlement engine.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json().catch(() => ({}));
    const matchId = typeof body?.matchId === "string" ? body.matchId : "";

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        bets: {
          select: { id: true },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.apiSource !== "demo") {
      return NextResponse.json(
        { error: "Simulation is available for demo fixtures only" },
        { status: 403 }
      );
    }

    if (match.homeOdds <= 1 || match.awayOdds <= 1) {
      return NextResponse.json(
        { error: "Simulation requires real bookmaker odds for both teams" },
        { status: 409 }
      );
    }

    if (match.status !== "live") {
      return NextResponse.json(
        { error: "Match is not live", match },
        { status: 400 }
      );
    }

    const advance = Math.floor(Math.random() * 3) + 1;
    const currentMinute = (match.minute ?? 0) + advance;
    const isFootball = match.sport === "football" || match.sport.startsWith("soccer_");
    const isBasketball = match.sport === "basketball" || match.sport.startsWith("basketball_");
    const maxMinutes = isFootball ? 90 : isBasketball ? 48 : 180;

    let homeScore = match.homeScore ?? 0;
    let awayScore = match.awayScore ?? 0;
    let newStatus = match.status;
    const events: string[] = [];

    const homeImplied = 1 / match.homeOdds;
    const awayImplied = 1 / match.awayOdds;
    const homeGoalRate = (homeImplied * 2.5) / maxMinutes;
    const awayGoalRate = (awayImplied * 2.5) / maxMinutes;

    for (let offset = 0; offset < advance; offset++) {
      const minute = (match.minute ?? 0) + offset + 1;

      if (poissonRandom(homeGoalRate) > 0) {
        homeScore += 1;
        events.push(
          `${minute}' - Goal! ${match.homeTeam} scores! (${homeScore}-${awayScore})`
        );
      }

      if (poissonRandom(awayGoalRate) > 0) {
        awayScore += 1;
        events.push(
          `${minute}' - Goal! ${match.awayTeam} scores! (${homeScore}-${awayScore})`
        );
      }
    }

    if (currentMinute >= maxMinutes) {
      newStatus = "finished";
      events.push(
        `Full Time! ${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam}`
      );
    }

    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        minute: Math.min(currentMinute, maxMinutes),
        homeScore,
        awayScore,
        status: newStatus,
      },
      include: { bets: true },
    });

    const settlementResults = [];
    if (newStatus === "finished") {
      // The canonical settlement engine owns balance, allocation, account,
      // commission, accumulator and transaction updates. It is idempotent, so
      // repeated simulation/settlement requests cannot pay a wager twice.
      for (const bet of match.bets) {
        try {
          settlementResults.push(await settleBetById(bet.id));
        } catch (error) {
          console.error(`[DemoSimulation] Settlement failed for ${bet.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      match: updatedMatch,
      events,
      previousMinute: match.minute,
      newMinute: Math.min(currentMinute, maxMinutes),
      settlement: {
        attempted: newStatus === "finished" ? match.bets.length : 0,
        settled: settlementResults.filter((result) => result.settled).length,
        skipped: settlementResults.filter((result) => !result.settled).length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error simulating match:", error);
    return NextResponse.json({ error: "Failed to simulate match" }, { status: 500 });
  }
}
