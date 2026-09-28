import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { predictMatch } from "@/lib/prediction/service";
import type { PredictionInput, TeamFeatureSnapshot } from "@/lib/prediction/contracts";

function toSnapshot(stats: any): TeamFeatureSnapshot | null {
  if (!stats) return null;

  return {
    teamName: stats.teamName,
    matchesPlayed: stats.matchesPlayed || 0,
    wins: stats.wins || 0,
    draws: stats.draws || 0,
    losses: stats.losses || 0,
    goalsFor: stats.goalsFor || 0,
    goalsAgainst: stats.goalsAgainst || 0,
    eloRating: stats.eloRating ?? null,
    xgFor: stats.xgFor ?? null,
    xgAgainst: stats.xgAgainst ?? null,
    shotsPerGame: stats.shotsPerGame ?? null,
    shotsOnTargetPerGame: stats.shotsOnTargetPerGame ?? null,
    possessionAvg: stats.possessionAvg ?? null,
    cornersPerGame: stats.cornersPerGame ?? null,
    cardsPerGame: stats.cardsPerGame ?? null,
    form: stats.form ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const [homeTeamStats, awayTeamStats] = await Promise.all([
      prisma.teamStats.findFirst({
        where: {
          teamName: match.homeTeam,
          sport: match.sport,
          league: match.league,
        },
        orderBy: { lastUpdated: "desc" },
      }),
      prisma.teamStats.findFirst({
        where: {
          teamName: match.awayTeam,
          sport: match.sport,
          league: match.league,
        },
        orderBy: { lastUpdated: "desc" },
      }),
    ]);

    const input: PredictionInput = {
      matchId: match.id,
      asOf: new Date().toISOString(),
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      status: match.status,
      minute: match.minute,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeOdds: match.homeOdds,
      drawOdds: match.drawOdds,
      awayOdds: match.awayOdds,
      overUnderLine: match.overUnderLine,
      home: toSnapshot(homeTeamStats),
      away: toSnapshot(awayTeamStats),
    };

    const richPrediction = await predictMatch(input);
    const maxResult = Math.max(
      richPrediction.result.homeWin,
      richPrediction.result.draw,
      richPrediction.result.awayWin
    );
    const recommended =
      maxResult === richPrediction.result.homeWin
        ? "home"
        : maxResult === richPrediction.result.awayWin
          ? "away"
          : "draw";

    const analysis = [
      `Model ${richPrediction.modelVersion}`,
      `Expected goals: ${match.homeTeam} ${richPrediction.expectedGoals.home.toFixed(2)} - ${richPrediction.expectedGoals.away.toFixed(2)} ${match.awayTeam}`,
      `Data completeness: ${Math.round(richPrediction.dataCompleteness * 100)}%`,
      ...richPrediction.warnings,
    ].join(" · ");

    await prisma.match.update({
      where: { id: matchId },
      data: {
        aiHomeWinProb: richPrediction.result.homeWin,
        aiDrawProb: richPrediction.result.draw,
        aiAwayWinProb: richPrediction.result.awayWin,
        aiConfidence: richPrediction.confidence,
        aiRecommended: recommended,
        aiAnalysis: analysis,
      },
    });

    // Compatibility fields keep the existing UI working while exposing the
    // richer v1 prediction contract for new clients.
    return NextResponse.json({
      matchId,
      prediction: {
        homeWinProb: richPrediction.result.homeWin,
        drawProb: richPrediction.result.draw,
        awayWinProb: richPrediction.result.awayWin,
        confidence: richPrediction.confidence,
        recommended,
        analysis,
      },
      richPrediction,
      homeTeamStats,
      awayTeamStats,
    });
  } catch (error) {
    console.error("Error analyzing match:", error);
    return NextResponse.json({ error: "Failed to analyze match" }, { status: 500 });
  }
}
