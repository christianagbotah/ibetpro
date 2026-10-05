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

// The evidence timer runs every 10 minutes. Allow one timer tick plus a small
// scheduling margin so a consensus snapshot captured just before a horizon
// opens is still considered horizon-local, while snapshots from prior horizons
// are rejected.
const HORIZON_CONSENSUS_GRACE_MINUTES = Math.max(
  0,
  Number(process.env.TRAINING_HORIZON_CONSENSUS_GRACE_MIN || 15)
);

// Keep synchronized with ml-service/training/train_xgb.py CORE_FEATURE_COLUMNS.
const FIRST_PARTY_CORE_FEATURE_KEYS = [
  "home_elo",
  "away_elo",
  "elo_diff",
  "home_form_points_5",
  "away_form_points_5",
  "home_goals_for_5",
  "away_goals_for_5",
  "home_goals_against_5",
  "away_goals_against_5",
  "home_xg_for_5",
  "away_xg_for_5",
  "home_xg_against_5",
  "away_xg_against_5",
  "home_shots_5",
  "away_shots_5",
  "home_sot_5",
  "away_sot_5",
  "home_rest_days",
  "away_rest_days",
  "home_implied_prob",
  "draw_implied_prob",
  "away_implied_prob",
  "home_market_prob",
  "draw_market_prob",
  "away_market_prob",
  "market_overround",
  "market_entropy",
  "market_home_away_log_ratio",
  "market_home_draw_log_ratio",
  "market_away_draw_log_ratio",
] as const satisfies ReadonlyArray<keyof ModelFeatureVector>;

// Keep synchronized with ml-service/training/train_xgb.py MARKET_MOVEMENT_FEATURE_COLUMNS.
const FIRST_PARTY_MARKET_MOVEMENT_FEATURE_KEYS = [
  ...FIRST_PARTY_CORE_FEATURE_KEYS,
  "market_snapshot_count",
  "market_history_minutes",
  "home_market_prob_move_open",
  "draw_market_prob_move_open",
  "away_market_prob_move_open",
  "market_overround_move_open",
  "home_market_prob_move_6h",
  "draw_market_prob_move_6h",
  "away_market_prob_move_6h",
] as const satisfies ReadonlyArray<keyof ModelFeatureVector>;

export type HorizonKey = (typeof HORIZONS)[number]["key"];

export function maxConsensusAgeMinutesForHorizon(
  horizonKey: HorizonKey,
  minutesToKickoff: number
): number {
  const horizon = HORIZONS.find((item) => item.key === horizonKey);
  if (!horizon) return 0;
  return (
    Math.max(0, horizon.maxMinutes - minutesToKickoff) +
    HORIZON_CONSENSUS_GRACE_MINUTES
  );
}

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

function completenessOf(values: unknown[]): number {
  if (!values.length) return 0;

  const observed = values.filter((value) => {
    if (typeof value === "boolean") return true;
    return value != null && typeof value === "number" && Number.isFinite(value);
  }).length;

  return observed / values.length;
}

function featureCompleteness(features: ModelFeatureVector): number {
  return completenessOf(Object.values(features));
}

function featureCompletenessForKeys(
  features: ModelFeatureVector,
  keys: ReadonlyArray<keyof ModelFeatureVector>
): number {
  return completenessOf(keys.map((key) => features[key]));
}

export interface TrainingCaptureResult {
  considered: number;
  captured: number;
  skippedExisting: number;
  skippedNoConsensus: number;
  skippedStaleConsensus: number;
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
  let skippedStaleConsensus = 0;
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

      const maxConsensusAgeMinutes = maxConsensusAgeMinutesForHorizon(
        horizonKey,
        minutesToKickoff
      );
      const consensusAgeMinutes = features.market_consensus_age_minutes;

      if (
        consensusAgeMinutes == null ||
        consensusAgeMinutes > maxConsensusAgeMinutes
      ) {
        skippedStaleConsensus++;
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
    skippedStaleConsensus,
    skippedOutsideHorizon,
    errors,
  };
}

export {
  FEATURE_SCHEMA_VERSION,
  HORIZON_CONSENSUS_GRACE_MINUTES,
  FIRST_PARTY_CORE_FEATURE_KEYS,
  FIRST_PARTY_MARKET_MOVEMENT_FEATURE_KEYS,
  HORIZONS,
  featureCompletenessForKeys,
};
