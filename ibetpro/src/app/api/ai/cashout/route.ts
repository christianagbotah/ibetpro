import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { shouldCashout } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { betId } = body;

    if (!betId) {
      return NextResponse.json({ error: "Bet ID is required" }, { status: 400 });
    }

    const bet = await prisma.bet.findUnique({
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

    // Get team stats for better cashout analysis
    const homeTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.homeTeam, sport: match.sport },
    });

    const awayTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.awayTeam, sport: match.sport },
    });

    // Transform team stats for AI engine
    const homeStatsForAI = homeTeamStats ? {
      teamName: homeTeamStats.teamName,
      sport: homeTeamStats.sport,
      league: homeTeamStats.league,
      matchesPlayed: homeTeamStats.matchesPlayed,
      wins: homeTeamStats.wins,
      draws: homeTeamStats.draws,
      losses: homeTeamStats.losses,
      goalsFor: homeTeamStats.goalsFor,
      goalsAgainst: homeTeamStats.goalsAgainst,
      form: homeTeamStats.form,
      homeRecord: homeTeamStats.homeRecord,
      awayRecord: homeTeamStats.awayRecord,
      attackRating: homeTeamStats.attackRating,
      defenseRating: homeTeamStats.defenseRating,
      overallRating: homeTeamStats.overallRating,
      keyPlayers: homeTeamStats.keyPlayers,
      xgFor: homeTeamStats.xgFor,
      xgAgainst: homeTeamStats.xgAgainst,
      eloRating: homeTeamStats.eloRating,
      shotsPerGame: homeTeamStats.shotsPerGame,
      shotsOnTargetPerGame: homeTeamStats.shotsOnTargetPerGame,
      possessionAvg: homeTeamStats.possessionAvg,
      cornersPerGame: homeTeamStats.cornersPerGame,
      cardsPerGame: homeTeamStats.cardsPerGame,
    } : null;

    const awayStatsForAI = awayTeamStats ? {
      teamName: awayTeamStats.teamName,
      sport: awayTeamStats.sport,
      league: awayTeamStats.league,
      matchesPlayed: awayTeamStats.matchesPlayed,
      wins: awayTeamStats.wins,
      draws: awayTeamStats.draws,
      losses: awayTeamStats.losses,
      goalsFor: awayTeamStats.goalsFor,
      goalsAgainst: awayTeamStats.goalsAgainst,
      form: awayTeamStats.form,
      homeRecord: awayTeamStats.homeRecord,
      awayRecord: awayTeamStats.awayRecord,
      attackRating: awayTeamStats.attackRating,
      defenseRating: awayTeamStats.defenseRating,
      overallRating: awayTeamStats.overallRating,
      keyPlayers: awayTeamStats.keyPlayers,
      xgFor: awayTeamStats.xgFor,
      xgAgainst: awayTeamStats.xgAgainst,
      eloRating: awayTeamStats.eloRating,
      shotsPerGame: awayTeamStats.shotsPerGame,
      shotsOnTargetPerGame: awayTeamStats.shotsOnTargetPerGame,
      possessionAvg: awayTeamStats.possessionAvg,
      cornersPerGame: awayTeamStats.cornersPerGame,
      cardsPerGame: awayTeamStats.cardsPerGame,
    } : null;

    // Run enhanced cashout analysis
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
      },
      homeStatsForAI,
      awayStatsForAI
    );

    // Update bet with cashout amount
    if (cashoutRecommendation.shouldCashout) {
      await prisma.bet.update({
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
