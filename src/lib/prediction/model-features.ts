import { prisma } from "@/lib/db";
import type { ModelFeatureVector } from "./contracts";

type MatchLike = {
  id: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  sport: string;
  league: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
};

type TeamStatsLike = {
  eloRating?: number | null;
} | null;

function implied(odds: number | null | undefined): number | null {
  return odds && odds > 1 ? 1 / odds : null;
}

function pointsFor(team: string, match: MatchLike): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  const isHome = match.homeTeam === team;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  if (gf > ga) return 3;
  if (gf === ga) return 1;
  return 0;
}

function goalsFor(team: string, match: MatchLike): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  return match.homeTeam === team ? match.homeScore : match.awayScore;
}

function goalsAgainst(team: string, match: MatchLike): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  return match.homeTeam === team ? match.awayScore : match.homeScore;
}

function average(values: number[], fallback = 0): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : fallback;
}

async function lastFinishedMatches(team: string, asOf: Date, sport: string, league: string) {
  return prisma.match.findMany({
    where: {
      status: "finished",
      sport,
      league,
      commenceTime: { lt: asOf },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeam: team }, { awayTeam: team }],
    },
    orderBy: { commenceTime: "desc" },
    take: 5,
    select: {
      id: true,
      commenceTime: true,
      homeTeam: true,
      awayTeam: true,
      homeScore: true,
      awayScore: true,
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
    },
  });
}

function restDays(lastMatch: MatchLike | undefined, asOf: Date): number {
  if (!lastMatch) return 7;
  const days = (asOf.getTime() - lastMatch.commenceTime.getTime()) / 86_400_000;
  return Math.min(30, Math.max(0, days));
}

export async function buildOnlineModelFeatures(
  match: MatchLike,
  homeStats: TeamStatsLike,
  awayStats: TeamStatsLike,
  asOf = new Date()
): Promise<ModelFeatureVector> {
  const [homeHistory, awayHistory] = await Promise.all([
    lastFinishedMatches(match.homeTeam, asOf, match.sport, match.league),
    lastFinishedMatches(match.awayTeam, asOf, match.sport, match.league),
  ]);

  const homeElo = Number(homeStats?.eloRating ?? 1500);
  const awayElo = Number(awayStats?.eloRating ?? 1500);

  return {
    home_elo: homeElo,
    away_elo: awayElo,
    elo_diff: homeElo - awayElo,
    home_form_points_5: average(homeHistory.map((item) => pointsFor(match.homeTeam, item))),
    away_form_points_5: average(awayHistory.map((item) => pointsFor(match.awayTeam, item))),
    home_goals_for_5: average(homeHistory.map((item) => goalsFor(match.homeTeam, item))),
    away_goals_for_5: average(awayHistory.map((item) => goalsFor(match.awayTeam, item))),
    home_goals_against_5: average(homeHistory.map((item) => goalsAgainst(match.homeTeam, item))),
    away_goals_against_5: average(awayHistory.map((item) => goalsAgainst(match.awayTeam, item))),

    // Until per-fixture xG/shot history is stored with as-of timestamps,
    // leave these absent so the trained model uses training-period imputation.
    // This is safer than mixing season aggregates with rolling-match features.
    home_xg_for_5: null,
    away_xg_for_5: null,
    home_xg_against_5: null,
    away_xg_against_5: null,
    home_shots_5: null,
    away_shots_5: null,
    home_sot_5: null,
    away_sot_5: null,

    home_rest_days: restDays(homeHistory[0], asOf),
    away_rest_days: restDays(awayHistory[0], asOf),

    // Match-market features are only included when the current provider has
    // genuine odds. Placeholder odds are filtered before this builder is called.
    home_implied_prob: implied(match.homeOdds),
    draw_implied_prob: implied(match.drawOdds),
    away_implied_prob: implied(match.awayOdds),
  };
}
