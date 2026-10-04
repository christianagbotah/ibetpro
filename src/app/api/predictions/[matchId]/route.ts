import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { predictMatch, predictShadowCandidate } from "@/lib/prediction/service";
import { persistPredictionSnapshot } from "@/lib/prediction/store";
import { persistShadowComparison } from "@/lib/prediction/shadow-store";
import { getAuthUser } from "@/lib/session";
import { buildPredictionInput } from "@/lib/prediction/input-builder";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { matchId } = await context.params;
  const input = await buildPredictionInput(matchId);

  if (!input) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const prediction = await predictMatch(input);

  return NextResponse.json({
    prediction,
    inputAsOf: input.asOf,
  });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { matchId } = await context.params;
  const input = await buildPredictionInput(matchId);

  if (!input) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const prediction = await predictMatch(input);
  const snapshotId = await persistPredictionSnapshot(input, prediction);
  const shadowCandidate = await predictShadowCandidate(input);
  const shadowComparisonId = shadowCandidate
    ? (await persistShadowComparison(input, prediction, shadowCandidate)).id
    : null;

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
        prediction.warnings.length
          ? `Warnings: ${prediction.warnings.join(" ")}`
          : "Probability output generated from current feature snapshot.",
      ].join(" · "),
    },
  });

  return NextResponse.json({
    prediction,
    inputAsOf: input.asOf,
    snapshotId,
    shadowComparisonId,
  });
}
