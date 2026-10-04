import { prisma } from "@/lib/db";
import type { CanonicalOddsSnapshot } from "./canonical";

export async function persistOddsSnapshot(
  matchId: string,
  snapshot: CanonicalOddsSnapshot
) {
  const capturedAt = new Date(snapshot.capturedAt);

  const duplicate = await prisma.oddsSnapshot.findFirst({
    where: {
      matchId,
      provider: snapshot.provider,
      providerFixtureId: snapshot.providerFixtureId,
      bookmaker: snapshot.bookmaker ?? null,
      capturedAt,
    },
    select: { id: true },
  });

  if (duplicate) return duplicate;

  return prisma.oddsSnapshot.create({
    data: {
      matchId,
      provider: snapshot.provider,
      providerFixtureId: snapshot.providerFixtureId,
      bookmaker: snapshot.bookmaker ?? null,
      capturedAt,
      homeOdds: snapshot.home ?? null,
      drawOdds: snapshot.draw ?? null,
      awayOdds: snapshot.away ?? null,
      over25Odds: snapshot.over25 ?? null,
      under25Odds: snapshot.under25 ?? null,
    },
    select: { id: true },
  });
}

export async function getLatestOddsMovement(matchId: string) {
  const snapshots = await prisma.oddsSnapshot.findMany({
    where: { matchId },
    orderBy: { capturedAt: "desc" },
    take: 20,
  });

  if (snapshots.length < 2) {
    return {
      available: false,
      homeDelta: null,
      drawDelta: null,
      awayDelta: null,
    };
  }

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const delta = (now: number | null, before: number | null) =>
    now != null && before != null ? Math.round((now - before) * 1000) / 1000 : null;

  return {
    available: true,
    from: oldest.capturedAt,
    to: latest.capturedAt,
    homeDelta: delta(latest.homeOdds, oldest.homeOdds),
    drawDelta: delta(latest.drawOdds, oldest.drawOdds),
    awayDelta: delta(latest.awayOdds, oldest.awayOdds),
  };
}


type ConsensusPoint = {
  capturedAt: Date;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
};

function normalizedProbabilities(point: ConsensusPoint | null) {
  if (
    !point ||
    point.homeOdds == null ||
    point.drawOdds == null ||
    point.awayOdds == null ||
    point.homeOdds <= 1 ||
    point.drawOdds <= 1 ||
    point.awayOdds <= 1
  ) {
    return null;
  }

  const raw = [
    1 / point.homeOdds,
    1 / point.drawOdds,
    1 / point.awayOdds,
  ];
  const overround = raw[0] + raw[1] + raw[2];
  if (!(overround > 0) || !raw.every(Number.isFinite)) return null;

  return {
    home: raw[0] / overround,
    draw: raw[1] / overround,
    away: raw[2] / overround,
    overround,
  };
}

function probabilityDelta(
  current: ReturnType<typeof normalizedProbabilities>,
  previous: ReturnType<typeof normalizedProbabilities>
) {
  if (!current || !previous) {
    return {
      home: null,
      draw: null,
      away: null,
      overround: null,
    };
  }

  return {
    home: current.home - previous.home,
    draw: current.draw - previous.draw,
    away: current.away - previous.away,
    overround: current.overround - previous.overround,
  };
}

async function consensusPointAtOrBefore(
  matchId: string,
  at: Date
): Promise<ConsensusPoint | null> {
  return prisma.oddsSnapshot.findFirst({
    where: {
      matchId,
      bookmaker: "consensus",
      capturedAt: { lte: at },
    },
    orderBy: { capturedAt: "desc" },
    select: {
      capturedAt: true,
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
    },
  });
}

export async function getConsensusOddsMovementFeatures(
  matchId: string,
  asOf: Date
) {
  const current = await consensusPointAtOrBefore(matchId, asOf);
  if (!current) {
    return {
      market_snapshot_count: 0,
      market_history_minutes: null,
      home_market_prob_move_open: null,
      draw_market_prob_move_open: null,
      away_market_prob_move_open: null,
      market_overround_move_open: null,
      home_market_prob_move_6h: null,
      draw_market_prob_move_6h: null,
      away_market_prob_move_6h: null,
      home_market_prob_move_24h: null,
      draw_market_prob_move_24h: null,
      away_market_prob_move_24h: null,
    };
  }

  const [opening, sixHoursAgo, twentyFourHoursAgo, count] = await Promise.all([
    prisma.oddsSnapshot.findFirst({
      where: {
        matchId,
        bookmaker: "consensus",
        capturedAt: { lte: asOf },
      },
      orderBy: { capturedAt: "asc" },
      select: {
        capturedAt: true,
        homeOdds: true,
        drawOdds: true,
        awayOdds: true,
      },
    }),
    consensusPointAtOrBefore(
      matchId,
      new Date(asOf.getTime() - 6 * 60 * 60 * 1000)
    ),
    consensusPointAtOrBefore(
      matchId,
      new Date(asOf.getTime() - 24 * 60 * 60 * 1000)
    ),
    prisma.oddsSnapshot.count({
      where: {
        matchId,
        bookmaker: "consensus",
        capturedAt: { lte: asOf },
      },
    }),
  ]);

  const currentProb = normalizedProbabilities(current);
  const openingDelta = probabilityDelta(
    currentProb,
    normalizedProbabilities(opening)
  );
  const sixHourDelta = probabilityDelta(
    currentProb,
    normalizedProbabilities(sixHoursAgo)
  );
  const dayDelta = probabilityDelta(
    currentProb,
    normalizedProbabilities(twentyFourHoursAgo)
  );

  return {
    market_snapshot_count: count,
    market_history_minutes: opening
      ? Math.max(
          0,
          (current.capturedAt.getTime() - opening.capturedAt.getTime()) / 60_000
        )
      : null,
    home_market_prob_move_open: openingDelta.home,
    draw_market_prob_move_open: openingDelta.draw,
    away_market_prob_move_open: openingDelta.away,
    market_overround_move_open: openingDelta.overround,
    home_market_prob_move_6h: sixHourDelta.home,
    draw_market_prob_move_6h: sixHourDelta.draw,
    away_market_prob_move_6h: sixHourDelta.away,
    home_market_prob_move_24h: dayDelta.home,
    draw_market_prob_move_24h: dayDelta.draw,
    away_market_prob_move_24h: dayDelta.away,
  };
}
