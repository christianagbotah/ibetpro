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
