import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { predictMatch } from "@/lib/prediction/service";
import { buildPredictionInput } from "@/lib/prediction/input-builder";
import type { MatchPrediction } from "@/lib/prediction/contracts";
import { refreshActiveOddsApiLiveScores } from "@/lib/live-score-refresh";

export const dynamic = "force-dynamic";

type CacheEntry = {
  expiresAt: number;
  prediction: MatchPrediction;
};

const predictionCache = new Map<string, CacheEntry>();
const LIVE_TTL_MS = 45_000;
const UPCOMING_TTL_MS = 5 * 60_000;

function marketProbability(prediction: MatchPrediction, key: string) {
  return prediction.markets.find((market) => market.key === key)?.probability ?? null;
}

function summarizeFirstGoal(
  prediction: MatchPrediction,
  match: {
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: string;
    awayTeam: string;
  }
) {
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;

  if (match.status === "live" && homeScore + awayScore > 0) {
    return {
      state: "already-scored" as const,
      team: null,
      label: "Already occurred",
      note: "Player/scoring sequence is unavailable from the current score feed.",
      homeProbability: null,
      awayProbability: null,
      noGoalProbability: null,
    };
  }

  const homeProbability = marketProbability(prediction, "first-goal-home");
  const awayProbability = marketProbability(prediction, "first-goal-away");
  const noGoalProbability = marketProbability(prediction, "no-goal");

  if (
    homeProbability == null ||
    awayProbability == null ||
    noGoalProbability == null
  ) {
    return {
      state: "unavailable" as const,
      team: null,
      label: "First-goal estimate unavailable",
      note: "This active model does not expose the first-goal market yet.",
      homeProbability,
      awayProbability,
      noGoalProbability,
    };
  }

  const best = [
    { team: "home" as const, label: match.homeTeam, probability: homeProbability },
    { team: "away" as const, label: match.awayTeam, probability: awayProbability },
    { team: "none" as const, label: "No goal", probability: noGoalProbability },
  ].sort((a, b) => b.probability - a.probability)[0];

  return {
    state: "forecast" as const,
    team: best.team,
    label: best.label,
    note:
      best.team === "none"
        ? "No goal is currently the strongest first-goal outcome."
        : best.label + " is more likely to score first.",
    homeProbability,
    awayProbability,
    noGoalProbability,
  };
}

async function cachedPrediction(matchId: string, status: string) {
  const now = Date.now();
  const cached = predictionCache.get(matchId);
  if (cached && cached.expiresAt > now) return cached.prediction;

  const input = await buildPredictionInput(matchId);
  if (!input) return null;

  const prediction = await predictMatch(input);
  predictionCache.set(matchId, {
    prediction,
    expiresAt: now + (status === "live" ? LIVE_TTL_MS : UPCOMING_TTL_MS),
  });
  return prediction;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const sport = searchParams.get("sport");
    const requestedPage = Number(searchParams.get("page") || 1);
    const requestedPageSize = Number(
      searchParams.get("pageSize") || searchParams.get("limit") || 24
    );
    const requestedHours = Number(searchParams.get("hours") || 48);
    const page = Number.isFinite(requestedPage)
      ? Math.max(1, Math.floor(requestedPage))
      : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(36, Math.max(6, Math.floor(requestedPageSize)))
      : 24;
    const hours = Number.isFinite(requestedHours)
      ? Math.min(168, Math.max(6, Math.floor(requestedHours)))
      : 48;

    // Refresh only currently active live competitions, through a shared
    // provider-state cache. This lets the predictions feed surface all available
    // live scores without spending one provider call per match or per page poll.
    const liveScoreRefresh =
      status === "upcoming"
        ? []
        : await refreshActiveOddsApiLiveScores({
            maxSports: 4,
          });

    const now = new Date();
    const upcomingUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const commonWhere = sport ? { sport } : {};

    const [totalLiveCount, confirmedLiveCount, totalUpcomingCount, sportRows] =
      await Promise.all([
        prisma.match.count({
          where: {
            ...commonWhere,
            status: "live",
          },
        }),
        prisma.match.count({
          where: {
            ...commonWhere,
            status: "live",
            homeScore: { not: null },
            awayScore: { not: null },
          },
        }),
        prisma.match.count({
          where: {
            ...commonWhere,
            status: "upcoming",
            commenceTime: { gte: now, lte: upcomingUntil },
          },
        }),
        prisma.match.findMany({
          where: {
            status: { in: ["live", "upcoming"] },
            OR: [
              { status: "live" },
              {
                status: "upcoming",
                commenceTime: { gte: now, lte: upcomingUntil },
              },
            ],
          },
          select: { sport: true },
          distinct: ["sport"],
          orderBy: { sport: "asc" },
        }),
      ]);

    const totalCount =
      status === "live"
        ? totalLiveCount
        : status === "upcoming"
          ? totalUpcomingCount
          : totalLiveCount + totalUpcomingCount;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    let liveMatches: Awaited<ReturnType<typeof prisma.match.findMany>> = [];
    let upcomingMatches: Awaited<ReturnType<typeof prisma.match.findMany>> = [];

    if (status === "live") {
      liveMatches = await prisma.match.findMany({
        where: { ...commonWhere, status: "live" },
        orderBy: { commenceTime: "asc" },
        skip: offset,
        take: pageSize,
      });
    } else if (status === "upcoming") {
      upcomingMatches = await prisma.match.findMany({
        where: {
          ...commonWhere,
          status: "upcoming",
          commenceTime: { gte: now, lte: upcomingUntil },
        },
        orderBy: { commenceTime: "asc" },
        skip: offset,
        take: pageSize,
      });
    } else {
      const liveTake =
        offset < totalLiveCount
          ? Math.min(pageSize, totalLiveCount - offset)
          : 0;

      if (liveTake > 0) {
        liveMatches = await prisma.match.findMany({
          where: { ...commonWhere, status: "live" },
          orderBy: { commenceTime: "asc" },
          skip: offset,
          take: liveTake,
        });
      }

      const remaining = pageSize - liveMatches.length;
      if (remaining > 0) {
        const upcomingSkip = Math.max(0, offset - totalLiveCount);
        upcomingMatches = await prisma.match.findMany({
          where: {
            ...commonWhere,
            status: "upcoming",
            commenceTime: { gte: now, lte: upcomingUntil },
          },
          orderBy: { commenceTime: "asc" },
          skip: upcomingSkip,
          take: remaining,
        });
      }
    }

    const matches = [...liveMatches, ...upcomingMatches];

    const items = await mapWithConcurrency(matches, 5, async (match) => {
      const prediction = await cachedPrediction(match.id, match.status);
      if (!prediction) return null;

      const resultOptions = [
        {
          key: "home" as const,
          label: match.homeTeam,
          probability: prediction.result.homeWin,
        },
        {
          key: "draw" as const,
          label: "Draw",
          probability: prediction.result.draw,
        },
        {
          key: "away" as const,
          label: match.awayTeam,
          probability: prediction.result.awayWin,
        },
      ].sort((a, b) => b.probability - a.probability);

      const topScore = prediction.scorelines[0] ?? null;
      const over25 = marketProbability(prediction, "over-2.5");
      const btts = marketProbability(prediction, "btts-yes");

      return {
        match: {
          id: match.id,
          externalId: match.externalId,
          sport: match.sport,
          league: match.league,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          commenceTime: match.commenceTime,
          status: match.status,
          minute: match.minute,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeOdds: match.homeOdds > 1 ? match.homeOdds : null,
          drawOdds: match.drawOdds && match.drawOdds > 1 ? match.drawOdds : null,
          awayOdds: match.awayOdds > 1 ? match.awayOdds : null,
          apiSource: match.apiSource,
        },
        prediction,
        summary: {
          winner: resultOptions[0],
          likelyScore: topScore
            ? {
                home: topScore.home,
                away: topScore.away,
                probability: topScore.probability,
              }
            : null,
          expectedTotalGoals: prediction.expectedGoals.total,
          over25Probability: over25,
          bttsYesProbability: btts,
          firstGoal: summarizeFirstGoal(prediction, match),
        },
      };
    });

    const predictions = items.filter(Boolean);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status,
        sport: sport || "all",
        horizonHours: hours,
        page: safePage,
        pageSize,
        totalPages,
        totalCount,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < totalPages,
        liveCount: totalLiveCount,
        confirmedLiveCount,
        pendingLiveScoreCount: Math.max(0, totalLiveCount - confirmedLiveCount),
        upcomingCount: totalUpcomingCount,
        count: predictions.length,
        availableSports: sportRows.map((row) => row.sport),
        liveScoreRefresh: liveScoreRefresh.map((result) => ({
          sport: result.sport,
          refreshed: result.refreshed,
          cached: result.cached,
          skipped: result.skipped,
          updated: result.updated,
          scoredEvents: result.scoredEvents,
          remainingRequests: result.remainingRequests,
          staleDemoted: result.staleDemoted ?? 0,
          reason: result.reason ?? null,
        })),
        predictions,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[PredictionFeed] Failed:", error);
    return NextResponse.json(
      { error: "Failed to build prediction feed" },
      { status: 500 }
    );
  }
}
