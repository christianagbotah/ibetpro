import { prisma } from "@/lib/db";
import type { MatchPrediction, PredictionInput } from "./contracts";

export async function persistShadowComparison(
  input: PredictionInput,
  baseline: MatchPrediction,
  candidate: MatchPrediction
) {
  const deltas = [
    Math.abs(candidate.result.homeWin - baseline.result.homeWin),
    Math.abs(candidate.result.draw - baseline.result.draw),
    Math.abs(candidate.result.awayWin - baseline.result.awayWin),
  ];

  return prisma.shadowPredictionComparison.create({
    data: {
      matchId: input.matchId,
      baselineModelVersion: baseline.modelVersion,
      candidateModelVersion: candidate.modelVersion,
      asOf: new Date(input.asOf),
      baselineHomeWin: baseline.result.homeWin,
      baselineDraw: baseline.result.draw,
      baselineAwayWin: baseline.result.awayWin,
      candidateHomeWin: candidate.result.homeWin,
      candidateDraw: candidate.result.draw,
      candidateAwayWin: candidate.result.awayWin,
      baselineHomeXg: baseline.expectedGoals.home,
      baselineAwayXg: baseline.expectedGoals.away,
      candidateHomeXg: candidate.expectedGoals.home,
      candidateAwayXg: candidate.expectedGoals.away,
      maxProbabilityDelta: Math.max(...deltas),
      homeXgDelta: candidate.expectedGoals.home - baseline.expectedGoals.home,
      awayXgDelta: candidate.expectedGoals.away - baseline.expectedGoals.away,
      featureCompleteness: candidate.dataCompleteness,
    },
  });
}
