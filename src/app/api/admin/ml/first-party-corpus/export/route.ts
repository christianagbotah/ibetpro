import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_HORIZONS = new Set(["24h", "6h", "1h"]);

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function resultClass(homeGoals: number, awayGoals: number): 0 | 1 | 2 {
  if (homeGoals > awayGoals) return 0;
  if (homeGoals < awayGoals) return 2;
  return 1;
}

export async function GET(request: NextRequest) {
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

  const requestedHorizon =
    request.nextUrl.searchParams.get("horizon")?.trim() || "1h";
  if (!ALLOWED_HORIZONS.has(requestedHorizon)) {
    return NextResponse.json(
      { error: "horizon must be one of 24h, 6h or 1h" },
      { status: 400 }
    );
  }

  const snapshots = await prisma.trainingFeatureSnapshot.findMany({
    where: {
      horizonKey: requestedHorizon,
      match: {
        status: "finished",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    orderBy: [{ kickoffAt: "asc" }, { matchId: "asc" }],
    select: {
      asOf: true,
      horizonKey: true,
      featureSchemaVersion: true,
      featureHash: true,
      featuresJson: true,
      horizonMinutesActual: true,
      featureCompleteness: true,
      match: {
        select: {
          externalId: true,
          commenceTime: true,
          league: true,
          homeTeam: true,
          awayTeam: true,
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  const parsed = snapshots.map((snapshot) => {
    const features = JSON.parse(snapshot.featuresJson) as Record<
      string,
      number | boolean | null
    >;
    return { snapshot, features };
  });

  const featureColumns = Array.from(
    new Set(parsed.flatMap((row) => Object.keys(row.features)))
  ).sort();

  const metadataColumns = [
    "fixture_id",
    "kickoff_utc",
    "league",
    "home_team",
    "away_team",
    "home_goals",
    "away_goals",
    "result_class",
    "snapshot_as_of",
    "horizon_key",
    "feature_schema_version",
    "feature_hash",
    "horizon_minutes_actual",
    "feature_completeness",
  ];

  const lines = [[...metadataColumns, ...featureColumns].map(csvCell).join(",")];

  for (const { snapshot, features } of parsed) {
    const homeGoals = snapshot.match.homeScore!;
    const awayGoals = snapshot.match.awayScore!;
    const row = [
      snapshot.match.externalId || snapshot.featureHash,
      snapshot.match.commenceTime.toISOString(),
      snapshot.match.league,
      snapshot.match.homeTeam,
      snapshot.match.awayTeam,
      homeGoals,
      awayGoals,
      resultClass(homeGoals, awayGoals),
      snapshot.asOf.toISOString(),
      snapshot.horizonKey,
      snapshot.featureSchemaVersion,
      snapshot.featureHash,
      snapshot.horizonMinutesActual,
      snapshot.featureCompleteness,
      ...featureColumns.map((column) => features[column] ?? null),
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const csv = `${lines.join("\n")}\n`;
  const filename = `ibetpro-first-party-${requestedHorizon}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-iBetPro-Rows": String(snapshots.length),
      "X-iBetPro-Horizon": requestedHorizon,
    },
  });
}
