import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

async function getDemoUserId(): Promise<string> {
  const user = await prisma.user.findFirst({ where: { email: "demo@ibetpro.com" } });
  return user?.id || "";
}

// Simple Poisson random number generator
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { bets: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status !== "live") {
      return NextResponse.json({ error: "Match is not live", match }, { status: 400 });
    }

    // Advance the minute by 1-3
    const advance = Math.floor(Math.random() * 3) + 1;
    const currentMinute = (match.minute ?? 0) + advance;

    // Determine max minutes based on sport
    const isFootball = match.sport === "football";
    const isBasketball = match.sport === "basketball";
    const maxMinutes = isFootball ? 90 : isBasketball ? 48 : 180;

    let homeScore = match.homeScore ?? 0;
    let awayScore = match.awayScore ?? 0;
    let newStatus = match.status;
    const events: string[] = [];

    // Calculate goal probability based on odds (approximate expected goals)
    const homeImplied = 1 / match.homeOdds;
    const awayImplied = 1 / match.awayOdds;

    // Expected goals per minute (simplified)
    const homeGoalRate = (homeImplied * 2.5) / maxMinutes;
    const awayGoalRate = (awayImplied * 2.5) / maxMinutes;

    // For each minute advanced, check if a goal is scored
    for (let m = 0; m < advance; m++) {
      const minute = (match.minute ?? 0) + m + 1;

      // Home team goal probability
      const homeGoals = poissonRandom(homeGoalRate);
      if (homeGoals > 0) {
        homeScore += 1; // Cap at 1 goal per minute
        events.push(`${minute}' - Goal! ${match.homeTeam} scores! (${homeScore}-${awayScore})`);
      }

      // Away team goal probability
      const awayGoals = poissonRandom(awayGoalRate);
      if (awayGoals > 0) {
        awayScore += 1;
        events.push(`${minute}' - Goal! ${match.awayTeam} scores! (${homeScore}-${awayScore})`);
      }
    }

    // Check if match should end
    if (currentMinute >= maxMinutes) {
      newStatus = "finished";
      events.push(`Full Time! ${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam}`);
    }

    // Update match
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

    // If match is finished, settle bets
    if (newStatus === "finished") {
      const userId = await getDemoUserId();

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

        // Create settlement transaction
        if (betWon) {
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

          // Create commission transaction (10% of profit)
          const commission = profit * 0.10;
          await prisma.transaction.create({
            data: {
              userId: bet.userId,
              type: "commission",
              amount: -commission,
              currency: "USD",
              status: "completed",
              description: `Commission on winning bet - ${match.homeTeam} vs ${match.awayTeam}`,
              betId: bet.id,
            },
          });

          // Update user commission paid
          if (userId) {
            await prisma.user.update({
              where: { id: bet.userId },
              data: {
                totalProfit: { increment: profit - commission },
                commissionPaid: { increment: commission },
              },
            });
          }
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

          if (userId) {
            await prisma.user.update({
              where: { id: bet.userId },
              data: {
                totalLoss: { increment: bet.stake },
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      match: updatedMatch,
      events,
      previousMinute: match.minute,
      newMinute: Math.min(currentMinute, maxMinutes),
    });
  } catch (error) {
    console.error("Error simulating match:", error);
    return NextResponse.json({ error: "Failed to simulate match" }, { status: 500 });
  }
}
