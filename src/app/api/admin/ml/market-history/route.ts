import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    const now = new Date();
    const upcoming = await prisma.match.findMany({
      where: {
        status: "upcoming",
        commenceTime: { gt: now },
      },
      select: {
        id: true,
        league: true,
        commenceTime: true,
        oddsSnapshots: {
          where: {
            bookmaker: "consensus",
            capturedAt: { lte: now },
          },
          orderBy: { capturedAt: "asc" },
          select: { capturedAt: true },
        },
      },
    });

    let withConsensus = 0;
    let withTwoSnapshots = 0;
    let history6h = 0;
    let history24h = 0;
    let history48h = 0;

    const byLeague = new Map<
      string,
      {
        matches: number;
        withConsensus: number;
        withTwoSnapshots: number;
        history24h: number;
      }
    >();

    for (const match of upcoming) {
      const snapshots = match.oddsSnapshots;
      const league = byLeague.get(match.league) || {
        matches: 0,
        withConsensus: 0,
        withTwoSnapshots: 0,
        history24h: 0,
      };
      league.matches += 1;

      if (snapshots.length > 0) {
        withConsensus += 1;
        league.withConsensus += 1;
      }
      if (snapshots.length >= 2) {
        withTwoSnapshots += 1;
        league.withTwoSnapshots += 1;
      }

      if (snapshots.length > 0) {
        const minutes =
          (snapshots[snapshots.length - 1].capturedAt.getTime() -
            snapshots[0].capturedAt.getTime()) /
          60_000;

        if (minutes >= 6 * 60) history6h += 1;
        if (minutes >= 24 * 60) {
          history24h += 1;
          league.history24h += 1;
        }
        if (minutes >= 48 * 60) history48h += 1;
      }

      byLeague.set(match.league, league);
    }

    const total = upcoming.length;
    const pct = (value: number) => (total ? value / total : 0);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      upcomingMatches: total,
      withConsensus,
      withTwoSnapshots,
      history6h,
      history24h,
      history48h,
      coverage: {
        consensus: pct(withConsensus),
        twoSnapshots: pct(withTwoSnapshots),
        history6h: pct(history6h),
        history24h: pct(history24h),
        history48h: pct(history48h),
      },
      researchReady:
        total >= 20 &&
        pct(withTwoSnapshots) >= 0.9 &&
        pct(history24h) >= 0.75,
      byLeague: Array.from(byLeague.entries())
        .map(([league, values]) => ({ league, ...values }))
        .sort((a, b) => a.league.localeCompare(b.league)),
    });
  } catch (error) {
    console.error("Market-history readiness failed:", error);
    return NextResponse.json(
      { error: "Market-history readiness failed" },
      { status: 500 }
    );
  }
}
