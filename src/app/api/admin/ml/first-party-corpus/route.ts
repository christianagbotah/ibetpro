import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, isAdmin } from "@/lib/session";
import {
  captureTrainingFeatureSnapshots,
  FEATURE_SCHEMA_VERSION,
  FIRST_PARTY_CORE_FEATURE_KEYS,
  HORIZONS,
  featureCompletenessForKeys,
} from "@/lib/prediction/training-corpus";

export const dynamic = "force-dynamic";

const PILOT_MIN_LABELED_PER_HORIZON = Number(
  process.env.FIRST_PARTY_PILOT_MIN_LABELED || 300
);
const PROMOTION_MIN_LABELED_PER_HORIZON = Number(
  process.env.FIRST_PARTY_PROMOTION_MIN_LABELED || 1500
);
const PILOT_MIN_FEATURE_COMPLETENESS = Number(
  process.env.FIRST_PARTY_MIN_COMPLETENESS || 0.70
);

function safeMetadata(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const [snapshots, settlementState, nextFixture] = await Promise.all([
    prisma.trainingFeatureSnapshot.findMany({
      where: { featureSchemaVersion: FEATURE_SCHEMA_VERSION },
      orderBy: { asOf: "desc" },
      select: {
        matchId: true,
        horizonKey: true,
        asOf: true,
        kickoffAt: true,
        horizonMinutesActual: true,
        featureHash: true,
        featuresJson: true,
        featureCompleteness: true,
        marketConsensusAvailable: true,
        marketSnapshotCount: true,
        marketHistoryMinutes: true,
        match: {
          select: {
            externalId: true,
            status: true,
            homeScore: true,
            awayScore: true,
          },
        },
      },
    }),
    prisma.providerSyncState.findUnique({
      where: { key: "odds-api:completed-scores" },
      select: {
        lastAttemptAt: true,
        lastSuccessAt: true,
        metadataJson: true,
      },
    }),
    prisma.match.findFirst({
      where: {
        apiSource: "odds-api",
        status: "upcoming",
        commenceTime: { gt: new Date() },
      },
      orderBy: { commenceTime: "asc" },
      select: {
        id: true,
        league: true,
        homeTeam: true,
        awayTeam: true,
        commenceTime: true,
      },
    }),
  ]);

  type HorizonKey = "24h" | "6h" | "1h";
  type HorizonStats = {
    total: number;
    labeled: number;
    timingValid: number;
    preKickoff: number;
    consensus: number;
    minCompleteness: number | null;
    duplicateFixtureRows: number;
    fixtureIds: Set<string>;
  };

  const horizons: Record<HorizonKey, HorizonStats> = {
    "24h": {
      total: 0,
      labeled: 0,
      timingValid: 0,
      preKickoff: 0,
      consensus: 0,
      minCompleteness: null,
      duplicateFixtureRows: 0,
      fixtureIds: new Set(),
    },
    "6h": {
      total: 0,
      labeled: 0,
      timingValid: 0,
      preKickoff: 0,
      consensus: 0,
      minCompleteness: null,
      duplicateFixtureRows: 0,
      fixtureIds: new Set(),
    },
    "1h": {
      total: 0,
      labeled: 0,
      timingValid: 0,
      preKickoff: 0,
      consensus: 0,
      minCompleteness: null,
      duplicateFixtureRows: 0,
      fixtureIds: new Set(),
    },
  };
  const horizonWindows = new Map(
    HORIZONS.map((horizon) => [horizon.key, horizon])
  );

  let labeled = 0;
  let coreCompletenessSum = 0;
  let allFeatureCompletenessSum = 0;
  let marketSnapshotsSum = 0;
  let marketHistorySum = 0;
  let marketHistoryRows = 0;

  for (const snapshot of snapshots) {
    const hasLabel =
      snapshot.match.status === "finished" &&
      snapshot.match.homeScore != null &&
      snapshot.match.awayScore != null;
    let coreCompleteness = 0;
    try {
      coreCompleteness = featureCompletenessForKeys(
        JSON.parse(snapshot.featuresJson),
        FIRST_PARTY_CORE_FEATURE_KEYS
      );
    } catch {
      coreCompleteness = 0;
    }

    if (snapshot.horizonKey in horizons) {
      const key = snapshot.horizonKey as HorizonKey;
      const horizon = horizons[key];
      horizon.total++;

      if (hasLabel) {
        horizon.labeled++;
        const window = horizonWindows.get(key);
        if (
          window &&
          snapshot.horizonMinutesActual >= window.minMinutes &&
          snapshot.horizonMinutesActual <= window.maxMinutes
        ) {
          horizon.timingValid++;
        }
        if (snapshot.asOf < snapshot.kickoffAt) horizon.preKickoff++;
        if (snapshot.marketConsensusAvailable) horizon.consensus++;
        horizon.minCompleteness =
          horizon.minCompleteness == null
            ? coreCompleteness
            : Math.min(horizon.minCompleteness, coreCompleteness);

        const fixtureId = snapshot.match.externalId || snapshot.featureHash;
        if (horizon.fixtureIds.has(fixtureId)) {
          horizon.duplicateFixtureRows++;
        } else {
          horizon.fixtureIds.add(fixtureId);
        }
      }
    }

    if (hasLabel) labeled++;
    coreCompletenessSum += coreCompleteness;
    allFeatureCompletenessSum += snapshot.featureCompleteness;
    marketSnapshotsSum += snapshot.marketSnapshotCount;
    if (snapshot.marketHistoryMinutes != null) {
      marketHistorySum += snapshot.marketHistoryMinutes;
      marketHistoryRows++;
    }
  }

  const horizonSummary = Object.fromEntries(
    (Object.entries(horizons) as Array<[HorizonKey, HorizonStats]>).map(
      ([key, value]) => [
        key,
        {
          total: value.total,
          labeled: value.labeled,
          minLabeledFeatureCompleteness: value.minCompleteness,
        },
      ]
    )
  ) as Record<
    HorizonKey,
    {
      total: number;
      labeled: number;
      minLabeledFeatureCompleteness: number | null;
    }
  >;

  const pilotValidatorByHorizon = Object.fromEntries(
    (Object.entries(horizons) as Array<[HorizonKey, HorizonStats]>).map(
      ([key, value]) => {
        const checks = {
          minimumRows: value.labeled >= PILOT_MIN_LABELED_PER_HORIZON,
          singleExpectedHorizon: true,
          horizonWindowCompliance:
            value.labeled > 0 && value.timingValid === value.labeled,
          preKickoffSnapshots:
            value.labeled > 0 && value.preKickoff === value.labeled,
          genuineMarketConsensus:
            value.labeled > 0 && value.consensus === value.labeled,
          minimumFeatureCompleteness:
            value.minCompleteness != null &&
            value.minCompleteness >= PILOT_MIN_FEATURE_COMPLETENESS,
          allRowsLabeled: true,
          uniqueFixtureRows: value.duplicateFixtureRows === 0,
        };

        return [
          key,
          {
            rows: value.labeled,
            remainingRows: Math.max(
              0,
              PILOT_MIN_LABELED_PER_HORIZON - value.labeled
            ),
            minFeatureCompleteness: value.minCompleteness,
            timingValidRows: value.timingValid,
            preKickoffRows: value.preKickoff,
            consensusRows: value.consensus,
            duplicateFixtureRows: value.duplicateFixtureRows,
            checks,
            ready: Object.values(checks).every(Boolean),
          },
        ];
      }
    )
  ) as Record<
    HorizonKey,
    {
      rows: number;
      remainingRows: number;
      minFeatureCompleteness: number | null;
      timingValidRows: number;
      preKickoffRows: number;
      consensusRows: number;
      duplicateFixtureRows: number;
      checks: Record<string, boolean>;
      ready: boolean;
    }
  >;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totalSnapshots: snapshots.length,
    labeledSnapshots: labeled,
    awaitingLabels: snapshots.length - labeled,
    latestSnapshotAt: snapshots[0]?.asOf?.toISOString() ?? null,
    averageFeatureCompleteness:
      snapshots.length > 0 ? coreCompletenessSum / snapshots.length : 0,
    averageAllFeatureCompleteness:
      snapshots.length > 0 ? allFeatureCompletenessSum / snapshots.length : 0,
    averageMarketSnapshotCount:
      snapshots.length > 0 ? marketSnapshotsSum / snapshots.length : 0,
    averageMarketHistoryMinutes:
      marketHistoryRows > 0 ? marketHistorySum / marketHistoryRows : null,
    horizons: horizonSummary,
    readiness: {
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      featureProfile: "core",
      pilotMinLabeledPerHorizon: PILOT_MIN_LABELED_PER_HORIZON,
      pilotMinFeatureCompleteness: PILOT_MIN_FEATURE_COMPLETENESS,
      promotionMinLabeledPerHorizon: PROMOTION_MIN_LABELED_PER_HORIZON,
      pilotReadyHorizons: Object.entries(pilotValidatorByHorizon)
        .filter(([, value]) => value.ready)
        .map(([key]) => key),
      promotionReadyHorizons: Object.entries(horizonSummary)
        .filter(
          ([, value]) =>
            value.labeled >= PROMOTION_MIN_LABELED_PER_HORIZON
        )
        .map(([key]) => key),
      byHorizon: pilotValidatorByHorizon,
    },
    nextFixture: nextFixture
      ? {
          id: nextFixture.id,
          league: nextFixture.league,
          homeTeam: nextFixture.homeTeam,
          awayTeam: nextFixture.awayTeam,
          kickoffAt: nextFixture.commenceTime.toISOString(),
          captureWindows: Object.fromEntries(
            HORIZONS.map((horizon) => [
              horizon.key,
              {
                opensAt: new Date(
                  nextFixture.commenceTime.getTime() -
                    horizon.maxMinutes * 60_000
                ).toISOString(),
                targetAt: new Date(
                  nextFixture.commenceTime.getTime() -
                    ((horizon.minMinutes + horizon.maxMinutes) / 2) * 60_000
                ).toISOString(),
                closesAt: new Date(
                  nextFixture.commenceTime.getTime() -
                    horizon.minMinutes * 60_000
                ).toISOString(),
              },
            ])
          ),
        }
      : null,
    settlement: {
      lastAttemptAt: settlementState?.lastAttemptAt?.toISOString() ?? null,
      lastSuccessAt: settlementState?.lastSuccessAt?.toISOString() ?? null,
      metadata: safeMetadata(settlementState?.metadataJson ?? null),
    },
  });
}


export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const result = await captureTrainingFeatureSnapshots(new Date());
    return NextResponse.json({
      ...result,
      generatedAt: new Date().toISOString(),
      note:
        result.captured > 0
          ? "Captured immutable first-party training snapshots inside valid pre-kickoff horizon windows."
          : "No eligible uncaptured fixtures are currently inside a valid 24h, 6h or 1h window.",
    });
  } catch (error) {
    console.error("First-party training capture failed:", error);
    return NextResponse.json(
      { error: "First-party training capture failed" },
      { status: 500 }
    );
  }
}
