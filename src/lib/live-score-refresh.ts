import { prisma } from "@/lib/db";
import { fetchOddsApiScores } from "@/lib/external-apis";

const DEFAULT_REFRESH_MS =
  Math.max(1, Number(process.env.LIVE_SCORE_REFRESH_MIN || 1)) * 60 * 1000;
const DEFAULT_QUOTA_FLOOR = Math.max(
  0,
  Number(process.env.LIVE_SCORE_MIN_QUOTA || 75)
);
const RETRY_GUARD_MS = 30_000;
const STALE_SOCCER_LIVE_GRACE_MS =
  Math.max(120, Number(process.env.LIVE_SCORE_STALE_GRACE_MIN || 150)) *
  60 *
  1000;

export type LiveScoreRefreshResult = {
  sport: string;
  refreshed: boolean;
  cached: boolean;
  skipped: boolean;
  reason?: string;
  updated: number;
  scoredEvents: number;
  requestCost: number | null;
  remainingRequests: number | null;
  lastSuccessAt?: string | null;
  staleDemoted?: number;
};

function stateKey(sport: string) {
  return "odds-api:live-scores:" + sport;
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

export function resolveLiveScoreRefreshMs(
  baseRefreshMs: number,
  remainingRequests: number | null,
  quotaFloor: number
) {
  const base = Math.max(60_000, baseRefreshMs);
  if (remainingRequests == null) return base;

  const headroom = remainingRequests - quotaFloor;
  if (headroom <= 25) return Math.max(base, 10 * 60_000);
  if (headroom <= 100) return Math.max(base, 5 * 60_000);
  if (headroom <= 250) return Math.max(base, 2 * 60_000);
  return base;
}

export function estimateSoccerMinute(commenceTime: Date, now: Date): number {
  const wallMinutes = Math.max(
    0,
    Math.floor((now.getTime() - commenceTime.getTime()) / 60_000)
  );
  if (wallMinutes <= 45) return wallMinutes;
  if (wallMinutes <= 60) return 45;
  return Math.min(90, Math.max(45, wallMinutes - 15));
}

export async function refreshOddsApiLiveSport(
  sport: string,
  options: {
    minRefreshMs?: number;
    quotaFloor?: number;
  } = {}
): Promise<LiveScoreRefreshResult> {
  const now = new Date();
  const baseRefreshMs = options.minRefreshMs ?? DEFAULT_REFRESH_MS;
  const quotaFloor = options.quotaFloor ?? DEFAULT_QUOTA_FLOOR;
  const key = stateKey(sport);

  const state = await prisma.providerSyncState.findUnique({
    where: { key },
    select: {
      lastAttemptAt: true,
      lastSuccessAt: true,
      metadataJson: true,
    },
  });

  const knownQuota = metadataQuota(state?.metadataJson ?? null);
  const minRefreshMs = resolveLiveScoreRefreshMs(
    baseRefreshMs,
    knownQuota,
    quotaFloor
  );

  if (
    state?.lastSuccessAt &&
    now.getTime() - state.lastSuccessAt.getTime() < minRefreshMs
  ) {
    return {
      sport,
      refreshed: false,
      cached: true,
      skipped: false,
      reason: "Live score cache is still fresh",
      updated: 0,
      scoredEvents: 0,
      requestCost: null,
      remainingRequests: knownQuota,
      lastSuccessAt: state.lastSuccessAt.toISOString(),
    };
  }

  if (
    state?.lastAttemptAt &&
    now.getTime() - state.lastAttemptAt.getTime() < RETRY_GUARD_MS
  ) {
    return {
      sport,
      refreshed: false,
      cached: true,
      skipped: true,
      reason: "Live score refresh already attempted recently",
      updated: 0,
      scoredEvents: 0,
      requestCost: null,
      remainingRequests: knownQuota,
      lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    };
  }

  if (knownQuota != null && knownQuota < quotaFloor) {
    return {
      sport,
      refreshed: false,
      cached: true,
      skipped: true,
      reason: "Live score refresh paused to preserve provider quota",
      updated: 0,
      scoredEvents: 0,
      requestCost: null,
      remainingRequests: knownQuota,
      lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
    };
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

  const result = await fetchOddsApiScores(sport);
  let updated = 0;
  let scoredEvents = 0;
  const scoredProviderEventIds = new Set(
    result.events
      .filter(
        (event) =>
          Boolean(event.id) &&
          event.homeScore != null &&
          event.awayScore != null
      )
      .map((event) => event.id as string)
  );

  for (const event of result.events) {
    if (!event.id || event.homeScore == null || event.awayScore == null) continue;
    scoredEvents += 1;

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
        lastSyncedAt: now,
        ...(minute !== undefined ? { minute } : {}),
      },
    });
    updated += update.count;
  }

  let staleDemoted = 0;
  if (sport.startsWith("soccer_")) {
    const staleBefore = new Date(now.getTime() - STALE_SOCCER_LIVE_GRACE_MS);
    const stale = await prisma.match.updateMany({
      where: {
        apiSource: "odds-api",
        sport,
        status: "live",
        commenceTime: { lt: staleBefore },
        externalId:
          scoredProviderEventIds.size > 0
            ? { not: null, notIn: [...scoredProviderEventIds] }
            : { not: null },
      },
      data: {
        status: "awaiting_result",
        minute: null,
        lastSyncedAt: now,
      },
    });
    staleDemoted = stale.count;
  }

  const successAt = new Date();
  await prisma.providerSyncState.update({
    where: { key },
    data: {
      lastSuccessAt: successAt,
      metadataJson: JSON.stringify({
        remainingRequests: result.remainingRequests,
        requestCost: result.requestCost,
        events: result.events.length,
        scoredEvents,
        updated,
        staleDemoted,
      }),
    },
  });

  return {
    sport,
    refreshed: true,
    cached: false,
    skipped: false,
    updated,
    scoredEvents,
    requestCost: result.requestCost,
    remainingRequests: result.remainingRequests,
    lastSuccessAt: successAt.toISOString(),
    staleDemoted,
  };
}

export async function refreshActiveOddsApiLiveScores(
  options: {
    maxSports?: number;
    minRefreshMs?: number;
    quotaFloor?: number;
  } = {}
) {
  const maxSports = Math.min(
    8,
    Math.max(1, options.maxSports ?? Number(process.env.LIVE_SCORE_FEED_MAX_SPORTS || 4))
  );
  const minRefreshMs =
    options.minRefreshMs ??
    Math.max(1, Number(process.env.LIVE_SCORE_FEED_REFRESH_MIN || 1)) *
      60 *
      1000;

  const sports = await prisma.match.findMany({
    where: {
      apiSource: "odds-api",
      status: "live",
      externalId: { not: null },
    },
    select: { sport: true },
    distinct: ["sport"],
    orderBy: { sport: "asc" },
  });

  const keys = sports.map((row) => stateKey(row.sport));
  const states =
    keys.length > 0
      ? await prisma.providerSyncState.findMany({
          where: { key: { in: keys } },
          select: { key: true, lastSuccessAt: true, lastAttemptAt: true },
        })
      : [];
  const stateByKey = new Map(states.map((state) => [state.key, state]));

  const selectedSports = [...sports]
    .sort((a, b) => {
      const aState = stateByKey.get(stateKey(a.sport));
      const bState = stateByKey.get(stateKey(b.sport));
      const aTime =
        aState?.lastSuccessAt?.getTime() ??
        aState?.lastAttemptAt?.getTime() ??
        0;
      const bTime =
        bState?.lastSuccessAt?.getTime() ??
        bState?.lastAttemptAt?.getTime() ??
        0;
      return aTime - bTime || a.sport.localeCompare(b.sport);
    })
    .slice(0, maxSports);

  const results: LiveScoreRefreshResult[] = [];
  for (const row of selectedSports) {
    try {
      const result = await refreshOddsApiLiveSport(row.sport, {
        minRefreshMs,
        quotaFloor: options.quotaFloor,
      });
      results.push(result);

      if (
        result.remainingRequests != null &&
        result.remainingRequests < (options.quotaFloor ?? DEFAULT_QUOTA_FLOOR)
      ) {
        break;
      }
    } catch (error) {
      results.push({
        sport: row.sport,
        refreshed: false,
        cached: false,
        skipped: true,
        reason: error instanceof Error ? error.message : "Live score refresh failed",
        updated: 0,
        scoredEvents: 0,
        requestCost: null,
        remainingRequests: null,
      });
    }
  }

  return results;
}