import { prisma } from "@/lib/db";
import { fetchOddsApiScores } from "@/lib/external-apis";

const DEFAULT_REFRESH_MS =
  Math.max(1, Number(process.env.LIVE_SCORE_REFRESH_MIN || 5)) * 60 * 1000;
const DEFAULT_QUOTA_FLOOR = Math.max(
  0,
  Number(process.env.LIVE_SCORE_MIN_QUOTA || 75)
);
const RETRY_GUARD_MS = 30_000;

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
  const minRefreshMs = options.minRefreshMs ?? DEFAULT_REFRESH_MS;
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
      remainingRequests: metadataQuota(state.metadataJson),
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
      remainingRequests: metadataQuota(state.metadataJson),
      lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    };
  }

  const knownQuota = metadataQuota(state?.metadataJson ?? null);
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
        ...(minute !== undefined ? { minute } : {}),
      },
    });
    updated += update.count;
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
    Math.max(5, Number(process.env.LIVE_SCORE_FEED_REFRESH_MIN || 10)) *
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
