import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { predictMatch } from "@/lib/prediction/service";
import { persistPredictionSnapshot } from "@/lib/prediction/store";
import { buildOnlineModelFeatures } from "@/lib/prediction/model-features";
import type { PredictionInput, TeamFeatureSnapshot } from "@/lib/prediction/contracts";

export const dynamic = "force-dynamic";

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

async function buildInput(matchId: string): Promise<PredictionInput | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;

  const [homeStats, awayStats] = await Promise.all([
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

  const realHomeOdds = match.apiSource === "api-football" ? null : match.homeOdds;
  const realDrawOdds = match.apiSource === "api-football" ? null : match.drawOdds;
  const realAwayOdds = match.apiSource === "api-football" ? null : match.awayOdds;

  const modelFeatures = await buildOnlineModelFeatures(
    {
      ...match,
      homeOdds: realHomeOdds,
      drawOdds: realDrawOdds,
      awayOdds: realAwayOdds,
    },
    homeStats,
    awayStats,
    new Date()
  );

  return {
    matchId: match.id,
    asOf: new Date().toISOString(),
    league: match.league,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: match.status,
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homeOdds: realHomeOdds,
    drawOdds: realDrawOdds,
    awayOdds: realAwayOdds,
    overUnderLine: match.overUnderLine,
    home: toSnapshot(homeStats),
    away: toSnapshot(awayStats),
    modelFeatures,
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params;
  const input = await buildInput(matchId);

  if (!input) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const prediction = await predictMatch(input);

  return NextResponse.json({
    prediction,
    inputAsOf: input.asOf,
    snapshotId,
  });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params;
  const input = await buildInput(matchId);

  if (!input) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const prediction = await predictMatch(input);
  const snapshotId = await persistPredictionSnapshot(input, prediction);

  await prisma.match.update({
    where: { id: matchId },
    data: {
      aiHomeWinProb: prediction.result.homeWin,
      aiDrawProb: prediction.result.draw,
      aiAwayWinProb: prediction.result.awayWin,
      aiConfidence: prediction.confidence,
      aiAnalysis: [
        `Model: ${prediction.modelVersion}`,
        `Expected goals: ${input.homeTeam} ${prediction.expectedGoals.home.toFixed(2)} - ${prediction.expectedGoals.away.toFixed(2)} ${input.awayTeam}`,
        prediction.warnings.length ? `Warnings: ${prediction.warnings.join(" ")}` : "Probability output generated from current feature snapshot.",
      ].join(" · "),
    },
  });

  return NextResponse.json({
    prediction,
    inputAsOf: input.asOf,
  });
}
