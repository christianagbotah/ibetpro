import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { buildOnlineModelFeatures } from "./model-features";
import type { ModelFeatureVector } from "./contracts";

const FEATURE_SCHEMA_VERSION = "online-v1";

const HORIZONS = [
  { key: "24h", minMinutes: 18 * 60, maxMinutes: 30 * 60 },
  { key: "6h", minMinutes: 4 * 60, maxMinutes: 8 * 60 },
  { key: "1h", minMinutes: 30, maxMinutes: 90 },
] as const;

type HorizonKey = (typeof HORIZONS)[number]["key"];

function horizonFor(minutesToKickoff: number): HorizonKey | null {
  return (
    HORIZONS.find(
      (item) =>
        minutesToKickoff >= item.minMinutes &&
        minutesToKickoff <= item.maxMinutes
    )?.key ?? null
  );
}

function canonicalFeatureJson(features: ModelFeatureVector): string {
  const sorted = Object.fromEntries(
    Object.entries(features).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  return JSON.stringify(sorted);
}

function featureCompleteness(features: ModelFeatureVector): number {
  const values = Object.values(features);
  if (!values.length) return 0;

  const observed = values.filter((value) => {
    if (typeof value === "boolean") return true;
    return value != null && typeof value === "number" && Number.isFinite(value);
  }).length;

  return observed / values.length;
}

export interface TrainingCaptureResult {
  considered: number;
  captured: number;
  skippedExisting: number;
  skippedNoConsensus: number;
  skippedOutsideHorizon: number;
  errors: string[];
}

export async function captureTrainingFeatureSnapshots(
  now = new Date()
): Promise<TrainingCaptureResult> {
  const errors: string[] = [];
  let captured = 0;
  let skippedExisting = 0;
  let skippedNoConsensus = 0;
  let skippedOutsideHorizon = 0;

  const lowerBound = new Date(now.getTime() + 25 * 60_000);
  const upperBound = new Date(now.getTime() + 30 * 60 * 60_000);

  const matches = await prisma.match.findMany({
    where: {
      apiSource: "odds-api",
      status: "upcoming",
      commenceTime: {
        gte: lowerBound,
        lte: upperBound,
      },
    },
    orderBy: { commenceTime: "asc" },
    select: {
      id: true,
      commenceTime: true,
      homeTeam: true,
      awayTeam: true,
      homeScore: true,
      awayScore: true,
      sport: true,
      league: true,
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
    },
  });

  const existing = matches.length
    ? await prisma.trainingFeatureSnapshot.findMany({
        where: {
          matchId: { in: matches.map((match) => match.id) },
          featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        },
        select: {
          matchId: true,
          horizonKey: true,
        },
      })
    : [];

  const existingKeys = new Set(
    existing.map((item) => `${item.matchId}:${item.horizonKey}`)
  );

  for (const match of matches) {
    const minutesToKickoff =
      (match.commenceTime.getTime() - now.getTime()) / 60_000;
    const horizonKey = horizonFor(minutesToKickoff);

    if (!horizonKey) {
      skippedOutsideHorizon++;
      continue;
    }

    const uniqueKey = `${match.id}:${horizonKey}`;
    if (existingKeys.has(uniqueKey)) {
      skippedExisting++;
      continue;
    }

    try {
      const features = await buildOnlineModelFeatures(match, null, null, now);
      if (!features.market_consensus_available) {
        skippedNoConsensus++;
        continue;
      }

      const featuresJson = canonicalFeatureJson(features);
      const featureHash = createHash("sha256")
        .update(featuresJson)
        .digest("hex");

      await prisma.trainingFeatureSnapshot.create({
        data: {
          matchId: match.id,
          horizonKey,
          featureSchemaVersion: FEATURE_SCHEMA_VERSION,
          asOf: now,
          kickoffAt: match.commenceTime,
          horizonMinutesActual: Math.round(minutesToKickoff),
          featureHash,
          featuresJson,
          featureCompleteness: featureCompleteness(features),
          marketConsensusAvailable: true,
          marketSnapshotCount: Math.max(
            0,
            Math.trunc(features.market_snapshot_count ?? 0)
          ),
          marketHistoryMinutes:
            features.market_history_minutes != null
              ? Number(features.market_history_minutes)
              : null,
        },
      });

      existingKeys.add(uniqueKey);
      captured++;
    } catch (error) {
      errors.push(
        `${match.id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return {
    considered: matches.length,
    captured,
    skippedExisting,
    skippedNoConsensus,
    skippedOutsideHorizon,
    errors,
  };
}

export { FEATURE_SCHEMA_VERSION, HORIZONS };
