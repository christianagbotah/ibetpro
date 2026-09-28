import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import type { MatchPrediction, PredictionInput } from "./contracts";

function stableFeatureHash(input: PredictionInput): string {
  const canonical = JSON.stringify({
    asOf: input.asOf,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    status: input.status,
    minute: input.minute ?? null,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    homeOdds: input.homeOdds ?? null,
    drawOdds: input.drawOdds ?? null,
    awayOdds: input.awayOdds ?? null,
    home: input.home,
    away: input.away,
  });

  return createHash("sha256").update(canonical).digest("hex");
}

export async function persistPredictionSnapshot(
  input: PredictionInput,
  prediction: MatchPrediction
): Promise<string> {
  const snapshot = await prisma.predictionSnapshot.create({
    data: {
      matchId: input.matchId,
      modelVersion: prediction.modelVersion,
      source: prediction.source,
      schemaVersion: prediction.schemaVersion,
      asOf: new Date(input.asOf),
      generatedAt: new Date(prediction.generatedAt),
      matchStatus: input.status,
      minute: input.minute ?? null,
      homeScore: input.homeScore ?? null,
      awayScore: input.awayScore ?? null,
      homeWinProb: prediction.result.homeWin,
      drawProb: prediction.result.draw,
      awayWinProb: prediction.result.awayWin,
      expectedHomeGoals: prediction.expectedGoals.home,
      expectedAwayGoals: prediction.expectedGoals.away,
      confidence: prediction.confidence,
      dataCompleteness: prediction.dataCompleteness,
      scorelinesJson: JSON.stringify(prediction.scorelines),
      marketsJson: JSON.stringify(prediction.markets),
      warningsJson: JSON.stringify(prediction.warnings),
      featureHash: stableFeatureHash(input),
    },
    select: { id: true },
  });

  return snapshot.id;
}
