import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { fetchOddsApiScores } from "@/lib/external-apis";
import { resolveLiveScoreRefreshMs } from "@/lib/live-score-refresh";

const LIVE_SCORE_REFRESH_MS =
  Math.max(1, Number(process.env.LIVE_SCORE_REFRESH_MIN || 1)) * 60 * 1000;
const LIVE_SCORE_MIN_QUOTA = Math.max(
  0,
  Number(process.env.LIVE_SCORE_MIN_QUOTA || 50)
);
const LIVE_STATUS_WINDOW_MS =
  Math.max(120, Number(process.env.ODDS_DISCOVERY_LIVE_WINDOW_MIN || 150)) *
  60 *
  1000;

function stateKey(sport: string) {
  return `odds-api:live-scores:${sport}`;
}

function metadataQuota(metadataJson: string | null): number | null {
  if (!metadataJson) return null;
  try {
    const value = JSON.parse(metadataJson) as { remainingRequests?: unknown };
    const parsed = Number(value.remainingRequests);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function estimateSoccerMinute(commenceTime: Date, now: Date): number {
  const wallMinutes = Math.max(
    0,
    Math.floor((now.getTime() - commenceTime.getTime()) / 60_000)
  );
  if (wallMinutes <= 45) return wallMinutes;
  if (wallMinutes <= 60) return 45;
  return Math.min(90, Math.max(45, wallMinutes - 15));
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const matchId = typeof body?.matchId === "string" ? body.matchId : "";

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        externalId: true,
        sport: true,
        apiSource: true,
        status: true,
        commenceTime: true,
        homeScore: true,
        awayScore: true,
        minute: true,
        updatedAt: true,
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.apiSource !== "odds-api" || !match.externalId) {
      return NextResponse.json({
        refreshed: false,
        reason: "Live score refresh is not available for this provider",
        match,
      });
    }

    if (match.status !== "live") {
      return NextResponse.json({
        refreshed: false,
        scoreAvailable:
          match.homeScore != null && match.awayScore != null,
        reason: "Match is not live",
        match,
      });
    }

    const now = new Date();
    if (
      now.getTime() - match.commenceTime.getTime() > LIVE_STATUS_WINDOW_MS
    ) {
      const stale = await prisma.match.update({
        where: { id: match.id },
        data: { status: "awaiting_result", minute: null },
      });
      return NextResponse.json({
        refreshed: false,
        scoreAvailable:
          stale.homeScore != null && stale.awayScore != null,
        reason: "Live window elapsed; awaiting provider result",
        match: stale,
      });
    }

    const key = stateKey(match.sport);
    const state = await prisma.providerSyncState.findUnique({
      where: { key },
      select: { lastSuccessAt: true, metadataJson: true },
    });
    const knownQuota = metadataQuota(state?.metadataJson ?? null);
    const effectiveRefreshMs = resolveLiveScoreRefreshMs(
      LIVE_SCORE_REFRESH_MS,
      knownQuota,
      LIVE_SCORE_MIN_QUOTA
    );

    if (
      state?.lastSuccessAt &&
      now.getTime() - state.lastSuccessAt.getTime() < effectiveRefreshMs
    ) {
      const cached = await prisma.match.findUnique({ where: { id: matchId } });
      return NextResponse.json({
        refreshed: false,
        cached: true,
        scoreAvailable:
          cached?.homeScore != null && cached?.awayScore != null,
        reason: "Live score cache is still fresh",
        match: cached,
        cacheAgeSeconds: Math.floor(
          (now.getTime() - state.lastSuccessAt.getTime()) / 1000
        ),
        targetRefreshSeconds: Math.floor(effectiveRefreshMs / 1000),
        remainingRequests: knownQuota,
      });
    }

    if (knownQuota != null && knownQuota < LIVE_SCORE_MIN_QUOTA) {
      return NextResponse.json({
        refreshed: false,
        cached: true,
        scoreAvailable:
          match.homeScore != null && match.awayScore != null,
        reason: "Live score refresh paused to preserve provider quota",
        remainingRequests: knownQuota,
        match,
      });
    }

    await prisma.providerSyncState.upsert({
      where: { key },
      update: { lastAttemptAt: now },
      create: {
        key,
        provider: "odds-api",
        lastAttemptAt: now,
      },
    });

    const result = await fetchOddsApiScores(match.sport);
    let updated = 0;

    for (const event of result.events) {
      if (!event.id || event.homeScore == null || event.awayScore == null) continue;

      const eventTime = new Date(event.commenceTime);
      const minute =
        event.completed
          ? 90
          : event.sportKey.startsWith("soccer_") &&
              Number.isFinite(eventTime.getTime())
            ? estimateSoccerMinute(eventTime, now)
            : undefined;

      const update = await prisma.match.updateMany({
        where: {
          externalId: event.id,
          apiSource: "odds-api",
          status: { notIn: ["cancelled", "postponed"] },
        },
        data: {
          homeScore: event.homeScore,
          awayScore: event.awayScore,
          status: event.completed ? "finished" : "live",
          ...(minute !== undefined ? { minute } : {}),
        },
      });
      updated += update.count;
    }

    await prisma.providerSyncState.update({
      where: { key },
      data: {
        lastSuccessAt: new Date(),
        metadataJson: JSON.stringify({
          remainingRequests: result.remainingRequests,
          requestCost: result.requestCost,
          events: result.events.length,
          updated,
        }),
      },
    });

    const refreshedMatch = await prisma.match.findUnique({ where: { id: matchId } });
    const providerEvent = result.events.find(
      (event) => event.id === match.externalId
    );

    return NextResponse.json({
      refreshed: true,
      cached: false,
      scoreAvailable:
        refreshedMatch?.homeScore != null && refreshedMatch?.awayScore != null,
      providerEventFound: Boolean(providerEvent),
      providerScoreAvailable:
        providerEvent?.homeScore != null && providerEvent?.awayScore != null,
      updated,
      requestCost: result.requestCost,
      remainingRequests: result.remainingRequests,
      match: refreshedMatch,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("[LiveScoreRefresh] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to refresh live score",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}