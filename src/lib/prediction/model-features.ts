import { prisma } from "@/lib/db";
import type { ModelFeatureVector } from "./contracts";
import { getCausalElo } from "./elo-snapshots";

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

type StatSnapshot = {
  teamSide: string;
  teamName: string;
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  xg: number | null;
};

type HistoricalMatch = {
  id: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  statSnapshots: StatSnapshot[];
};

function implied(odds: number | null | undefined): number | null {
  return odds && odds > 1 ? 1 / odds : null;
}

function marketStructure(
  homeImplied: number | null,
  drawImplied: number | null,
  awayImplied: number | null
) {
  if (
    homeImplied == null ||
    drawImplied == null ||
    awayImplied == null ||
    !Number.isFinite(homeImplied) ||
    !Number.isFinite(drawImplied) ||
    !Number.isFinite(awayImplied)
  ) {
    return {
      home_market_prob: null,
      draw_market_prob: null,
      away_market_prob: null,
      market_overround: null,
      market_entropy: null,
      market_home_away_log_ratio: null,
      market_home_draw_log_ratio: null,
      market_away_draw_log_ratio: null,
    };
  }

  const overround = homeImplied + drawImplied + awayImplied;
  if (!(overround > 0)) {
    return {
      home_market_prob: null,
      draw_market_prob: null,
      away_market_prob: null,
      market_overround: null,
      market_entropy: null,
      market_home_away_log_ratio: null,
      market_home_draw_log_ratio: null,
      market_away_draw_log_ratio: null,
    };
  }

  const home = homeImplied / overround;
  const draw = drawImplied / overround;
  const away = awayImplied / overround;
  const eps = 1e-12;
  const entropy = -[home, draw, away].reduce(
    (sum, probability) =>
      sum + probability * Math.log(Math.max(probability, eps)),
    0
  );

  return {
    home_market_prob: home,
    draw_market_prob: draw,
    away_market_prob: away,
    market_overround: overround,
    market_entropy: entropy,
    market_home_away_log_ratio: Math.log(Math.max(home, eps) / Math.max(away, eps)),
    market_home_draw_log_ratio: Math.log(Math.max(home, eps) / Math.max(draw, eps)),
    market_away_draw_log_ratio: Math.log(Math.max(away, eps) / Math.max(draw, eps)),
  };
}

function pointsFor(team: string, match: HistoricalMatch): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  const isHome = match.homeTeam === team;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  if (gf > ga) return 3;
  if (gf === ga) return 1;
  return 0;
}

function goalsFor(team: string, match: HistoricalMatch): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  return match.homeTeam === team ? match.homeScore : match.awayScore;
}

function goalsAgainst(team: string, match: HistoricalMatch): number {
  if (match.homeScore == null || match.awayScore == null) return 0;
  return match.homeTeam === team ? match.awayScore : match.homeScore;
}

function average(values: number[], fallback = 0): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : fallback;
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  return valid.length ? average(valid) : null;
}

function teamSnapshot(team: string, match: HistoricalMatch): StatSnapshot | null {
  return (
    match.statSnapshots.find((snapshot) => snapshot.teamName === team) ||
    match.statSnapshots.find(
      (snapshot) =>
        (snapshot.teamSide === "home" && match.homeTeam === team) ||
        (snapshot.teamSide === "away" && match.awayTeam === team)
    ) ||
    null
  );
}

function opponentSnapshot(team: string, match: HistoricalMatch): StatSnapshot | null {
  return (
    match.statSnapshots.find(
      (snapshot) =>
        (snapshot.teamSide === "away" && match.homeTeam === team) ||
        (snapshot.teamSide === "home" && match.awayTeam === team)
    ) || null
  );
}

async function lastFinishedMatches(
  team: string,
  asOf: Date,
  sport: string,
  league: string
): Promise<HistoricalMatch[]> {
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
      statSnapshots: {
        select: {
          teamSide: true,
          teamName: true,
          possession: true,
          shots: true,
          shotsOnTarget: true,
          corners: true,
          yellowCards: true,
          redCards: true,
          xg: true,
        },
      },
    },
  });
}

async function lastVenueMatches(
  team: string,
  venue: "home" | "away",
  asOf: Date,
  sport: string,
  league: string
): Promise<HistoricalMatch[]> {
  return prisma.match.findMany({
    where: {
      status: "finished",
      sport,
      league,
      commenceTime: { lt: asOf },
      homeScore: { not: null },
      awayScore: { not: null },
      ...(venue === "home" ? { homeTeam: team } : { awayTeam: team }),
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
      statSnapshots: {
        select: {
          teamSide: true,
          teamName: true,
          possession: true,
          shots: true,
          shotsOnTarget: true,
          corners: true,
          yellowCards: true,
          redCards: true,
          xg: true,
        },
      },
    },
  });
}

async function latestConsensusOdds(matchId: string, asOf: Date) {
  return prisma.oddsSnapshot.findFirst({
    where: {
      matchId,
      bookmaker: "consensus",
      capturedAt: { lte: asOf },
    },
    orderBy: { capturedAt: "desc" },
    select: {
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
      capturedAt: true,
    },
  });
}

function restDays(lastMatch: HistoricalMatch | undefined, asOf: Date): number {
  if (!lastMatch) return 7;
  const days = (asOf.getTime() - lastMatch.commenceTime.getTime()) / 86_400_000;
  return Math.min(30, Math.max(0, days));
}

function rollingStats(team: string, history: HistoricalMatch[]) {
  const own = history.map((match) => teamSnapshot(team, match));
  const opponents = history.map((match) => opponentSnapshot(team, match));

  return {
    xgFor: averageNullable(own.map((snapshot) => snapshot?.xg)),
    xgAgainst: averageNullable(opponents.map((snapshot) => snapshot?.xg)),
    shots: averageNullable(own.map((snapshot) => snapshot?.shots)),
    shotsOnTarget: averageNullable(
      own.map((snapshot) => snapshot?.shotsOnTarget)
    ),
    possession: averageNullable(own.map((snapshot) => snapshot?.possession)),
    corners: averageNullable(own.map((snapshot) => snapshot?.corners)),
    yellowCards: averageNullable(
      own.map((snapshot) => snapshot?.yellowCards)
    ),
    redCards: averageNullable(own.map((snapshot) => snapshot?.redCards)),
  };
}

export async function buildOnlineModelFeatures(
  match: MatchLike,
  homeStats: TeamStatsLike,
  awayStats: TeamStatsLike,
  asOf = new Date()
): Promise<ModelFeatureVector> {
  // Pre-match features can use only information available before kickoff.
  const featureAsOf =
    asOf.getTime() < match.commenceTime.getTime() ? asOf : match.commenceTime;

  const [homeHistory, awayHistory, homeVenueHistory, awayVenueHistory] =
    await Promise.all([
      lastFinishedMatches(match.homeTeam, featureAsOf, match.sport, match.league),
      lastFinishedMatches(match.awayTeam, featureAsOf, match.sport, match.league),
      lastVenueMatches(
        match.homeTeam,
        "home",
        featureAsOf,
        match.sport,
        match.league
      ),
      lastVenueMatches(
        match.awayTeam,
        "away",
        featureAsOf,
        match.sport,
        match.league
      ),
    ]);

  const homeRolling = rollingStats(match.homeTeam, homeHistory);
  const awayRolling = rollingStats(match.awayTeam, awayHistory);
  const homeVenueRolling = rollingStats(match.homeTeam, homeVenueHistory);
  const awayVenueRolling = rollingStats(match.awayTeam, awayVenueHistory);

  const [homeElo, awayElo, consensusOdds] = await Promise.all([
    getCausalElo(match.homeTeam, match.sport, match.league, featureAsOf),
    getCausalElo(match.awayTeam, match.sport, match.league, featureAsOf),
    latestConsensusOdds(match.id, featureAsOf),
  ]);

  // Historical training uses consensus/average bookmaker prices. Use the
  // latest causal consensus snapshot for serving parity, while Match odds stay
  // as best-available display/value prices. Fall back only when no consensus
  // snapshot has been captured yet.
  const homeImplied = implied(consensusOdds?.homeOdds ?? match.homeOdds);
  const drawImplied = implied(consensusOdds?.drawOdds ?? match.drawOdds);
  const awayImplied = implied(consensusOdds?.awayOdds ?? match.awayOdds);
  const market = marketStructure(homeImplied, drawImplied, awayImplied);

  return {
    home_elo: homeElo,
    away_elo: awayElo,
    elo_diff: homeElo - awayElo,
    home_form_points_5: average(
      homeHistory.map((item) => pointsFor(match.homeTeam, item))
    ),
    away_form_points_5: average(
      awayHistory.map((item) => pointsFor(match.awayTeam, item))
    ),
    home_goals_for_5: average(
      homeHistory.map((item) => goalsFor(match.homeTeam, item))
    ),
    away_goals_for_5: average(
      awayHistory.map((item) => goalsFor(match.awayTeam, item))
    ),
    home_goals_against_5: average(
      homeHistory.map((item) => goalsAgainst(match.homeTeam, item))
    ),
    away_goals_against_5: average(
      awayHistory.map((item) => goalsAgainst(match.awayTeam, item))
    ),
    home_xg_for_5: homeRolling.xgFor,
    away_xg_for_5: awayRolling.xgFor,
    home_xg_against_5: homeRolling.xgAgainst,
    away_xg_against_5: awayRolling.xgAgainst,
    home_shots_5: homeRolling.shots,
    away_shots_5: awayRolling.shots,
    home_sot_5: homeRolling.shotsOnTarget,
    away_sot_5: awayRolling.shotsOnTarget,
    home_rest_days: restDays(homeHistory[0], featureAsOf),
    away_rest_days: restDays(awayHistory[0], featureAsOf),
    home_implied_prob: homeImplied,
    draw_implied_prob: drawImplied,
    away_implied_prob: awayImplied,
    ...market,
    market_consensus_available: Boolean(consensusOdds),
    market_consensus_age_minutes: consensusOdds
      ? Math.max(
          0,
          (featureAsOf.getTime() - consensusOdds.capturedAt.getTime()) / 60_000
        )
      : null,
    home_possession_5: homeRolling.possession,
    away_possession_5: awayRolling.possession,
    home_corners_5: homeRolling.corners,
    away_corners_5: awayRolling.corners,
    home_yellow_cards_5: homeRolling.yellowCards,
    away_yellow_cards_5: awayRolling.yellowCards,
    home_red_cards_5: homeRolling.redCards,
    away_red_cards_5: awayRolling.redCards,
    home_home_form_points_5: average(
      homeVenueHistory.map((item) => pointsFor(match.homeTeam, item))
    ),
    away_away_form_points_5: average(
      awayVenueHistory.map((item) => pointsFor(match.awayTeam, item))
    ),
    home_home_goals_for_5: average(
      homeVenueHistory.map((item) => goalsFor(match.homeTeam, item))
    ),
    home_home_goals_against_5: average(
      homeVenueHistory.map((item) => goalsAgainst(match.homeTeam, item))
    ),
    away_away_goals_for_5: average(
      awayVenueHistory.map((item) => goalsFor(match.awayTeam, item))
    ),
    away_away_goals_against_5: average(
      awayVenueHistory.map((item) => goalsAgainst(match.awayTeam, item))
    ),
    home_home_shots_5: homeVenueRolling.shots,
    away_away_shots_5: awayVenueRolling.shots,
    home_home_sot_5: homeVenueRolling.shotsOnTarget,
    away_away_sot_5: awayVenueRolling.shotsOnTarget,
    home_home_corners_5: homeVenueRolling.corners,
    away_away_corners_5: awayVenueRolling.corners,
    home_home_yellow_cards_5: homeVenueRolling.yellowCards,
    away_away_yellow_cards_5: awayVenueRolling.yellowCards,
  };
}
