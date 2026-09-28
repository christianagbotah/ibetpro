import { prisma } from "@/lib/db";
import { fetchApiFootballFixtureStatistics } from "@/lib/external-apis";

export interface FixtureStatsBackfillResult {
  requestedLimit: number;
  candidates: number;
  matchesProcessed: number;
  snapshotsUpserted: number;
  skipped: number;
  errors: string[];
}

function fixtureIdFromMatch(externalId: string | null): number | null {
  if (!externalId?.startsWith("af-")) return null;
  const parsed = Number(externalId.slice(3));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function backfillFinishedFixtureStats(
  limit = 20
): Promise<FixtureStatsBackfillResult> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const errors: string[] = [];
  let matchesProcessed = 0;
  let snapshotsUpserted = 0;
  let skipped = 0;

  // Fetch a wider candidate window and filter in memory so fixtures with
  // exactly one stored side remain retryable. A relation "none" filter would
  // permanently skip partially backfilled matches.
  const recentMatches = await prisma.match.findMany({
    where: {
      apiSource: "api-football",
      status: "finished",
      externalId: { not: null },
    },
    orderBy: { commenceTime: "desc" },
    take: boundedLimit * 4,
    select: {
      id: true,
      externalId: true,
      homeTeam: true,
      awayTeam: true,
      commenceTime: true,
      statSnapshots: {
        select: { teamSide: true },
      },
    },
  });

  const matches = recentMatches
    .filter((match) => {
      const sides = new Set(match.statSnapshots.map((snapshot) => snapshot.teamSide));
      return !sides.has("home") || !sides.has("away");
    })
    .slice(0, boundedLimit);

  for (const match of matches) {
    const fixtureId = fixtureIdFromMatch(match.externalId);
    if (!fixtureId) {
      skipped++;
      continue;
    }

    try {
      const stats = await fetchApiFootballFixtureStatistics(fixtureId);
      if (stats.length < 2) {
        skipped++;
        errors.push(
          `Fixture ${fixtureId}: expected two team-stat blocks, received ${stats.length}`
        );
        continue;
      }

      for (const team of stats) {
        const side =
          team.teamName === match.homeTeam
            ? "home"
            : team.teamName === match.awayTeam
              ? "away"
              : null;

        if (!side) {
          errors.push(
            `Fixture ${fixtureId}: could not map provider team "${team.teamName}" to match teams`
          );
          continue;
        }

        await prisma.matchTeamStatSnapshot.upsert({
          where: {
            matchId_teamSide: {
              matchId: match.id,
              teamSide: side,
            },
          },
          update: {
            provider: "api-football",
            providerFixtureId: String(fixtureId),
            teamName: team.teamName,
            providerTeamId: team.teamId ? String(team.teamId) : null,
            possession: team.possession,
            shots: team.shots,
            shotsOnTarget: team.shotsOnTarget,
            corners: team.corners,
            yellowCards: team.yellowCards,
            redCards: team.redCards,
            xg: team.xg,
            capturedAt: new Date(),
          },
          create: {
            matchId: match.id,
            provider: "api-football",
            providerFixtureId: String(fixtureId),
            teamSide: side,
            teamName: team.teamName,
            providerTeamId: team.teamId ? String(team.teamId) : null,
            possession: team.possession,
            shots: team.shots,
            shotsOnTarget: team.shotsOnTarget,
            corners: team.corners,
            yellowCards: team.yellowCards,
            redCards: team.redCards,
            xg: team.xg,
            capturedAt: new Date(),
          },
        });
        snapshotsUpserted++;
      }

      matchesProcessed++;
    } catch (error) {
      errors.push(
        `Fixture ${fixtureId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return {
    requestedLimit: boundedLimit,
    candidates: matches.length,
    matchesProcessed,
    snapshotsUpserted,
    skipped,
    errors,
  };
}
