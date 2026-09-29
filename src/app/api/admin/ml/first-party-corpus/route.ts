import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

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

  const [snapshots, settlementState] = await Promise.all([
    prisma.trainingFeatureSnapshot.findMany({
      orderBy: { asOf: "desc" },
      select: {
        horizonKey: true,
        asOf: true,
        featureCompleteness: true,
        marketSnapshotCount: true,
        marketHistoryMinutes: true,
        match: {
          select: {
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
  ]);

  const horizons = {
    "24h": { total: 0, labeled: 0 },
    "6h": { total: 0, labeled: 0 },
    "1h": { total: 0, labeled: 0 },
  };

  let labeled = 0;
  let completenessSum = 0;
  let marketSnapshotsSum = 0;
  let marketHistorySum = 0;
  let marketHistoryRows = 0;

  for (const snapshot of snapshots) {
    const hasLabel =
      snapshot.match.status === "finished" &&
      snapshot.match.homeScore != null &&
      snapshot.match.awayScore != null;

    if (snapshot.horizonKey in horizons) {
      const horizon =
        horizons[snapshot.horizonKey as keyof typeof horizons];
      horizon.total++;
      if (hasLabel) horizon.labeled++;
    }

    if (hasLabel) labeled++;
    completenessSum += snapshot.featureCompleteness;
    marketSnapshotsSum += snapshot.marketSnapshotCount;
    if (snapshot.marketHistoryMinutes != null) {
      marketHistorySum += snapshot.marketHistoryMinutes;
      marketHistoryRows++;
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totalSnapshots: snapshots.length,
    labeledSnapshots: labeled,
    awaitingLabels: snapshots.length - labeled,
    latestSnapshotAt: snapshots[0]?.asOf?.toISOString() ?? null,
    averageFeatureCompleteness:
      snapshots.length > 0 ? completenessSum / snapshots.length : 0,
    averageMarketSnapshotCount:
      snapshots.length > 0 ? marketSnapshotsSum / snapshots.length : 0,
    averageMarketHistoryMinutes:
      marketHistoryRows > 0 ? marketHistorySum / marketHistoryRows : null,
    horizons,
    settlement: {
      lastAttemptAt: settlementState?.lastAttemptAt?.toISOString() ?? null,
      lastSuccessAt: settlementState?.lastSuccessAt?.toISOString() ?? null,
      metadata: safeMetadata(settlementState?.metadataJson ?? null),
    },
  });
}
