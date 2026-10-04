import { prisma } from "@/lib/db";
import { buildOnlineModelFeatures } from "@/lib/prediction/model-features";
import type {
  PredictionInput,
  TeamFeatureSnapshot,
} from "@/lib/prediction/contracts";

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

export async function buildPredictionInput(
  matchId: string
): Promise<PredictionInput | null> {
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

  const realHomeOdds =
    match.apiSource === "api-football" || match.homeOdds <= 1
      ? null
      : match.homeOdds;
  const realDrawOdds =
    match.apiSource === "api-football" ||
    !match.drawOdds ||
    match.drawOdds <= 1
      ? null
      : match.drawOdds;
  const realAwayOdds =
    match.apiSource === "api-football" || match.awayOdds <= 1
      ? null
      : match.awayOdds;

  const asOf = new Date();
  const modelFeatures = await buildOnlineModelFeatures(
    {
      ...match,
      homeOdds: realHomeOdds,
      drawOdds: realDrawOdds,
      awayOdds: realAwayOdds,
    },
    homeStats,
    awayStats,
    asOf
  );

  return {
    matchId: match.id,
    asOf: asOf.toISOString(),
    kickoffAt: match.commenceTime.toISOString(),
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
