// ============================================================================
// iBetPro Live Data Sync Service
// Fetches real-time match data from external APIs and syncs to the database.
// Called by the bot engine before each scan cycle and by the cron sync endpoint.
// Falls back to demo data when no API keys are configured.
// ============================================================================

import { prisma } from "./db";
import { config, getPrimaryDataSource } from "./config";
import {
  fetchOddsApiEvents,
  fetchOddsApiSports,
  fetchOddsApiUpcoming,
  fetchOddsApiCompletedScores,
  convertOddsApiToMatch,
  fetchApiFootballFixtures,
  fetchApiFootballLiveFixtures,
} from "./external-apis";
import { generateDemoMatches } from "./demo-data";
import { ensureFixtureIdentity } from "./football/identity";
import { selectPaidOddsSports } from "./odds-quota-policy";
import { persistOddsSnapshot } from "./football/odds-history";
import {
  captureTrainingFeatureSnapshots,
  FEATURE_SCHEMA_VERSION,
  HORIZONS,
  maxConsensusAgeMinutesForHorizon,
} from "./prediction/training-corpus";
import {
  rebuildLeagueEloSnapshots,
  repairMissingCausalEloSnapshots,
} from "./prediction/elo-snapshots";

let lastSyncAt: Date | null = null;

const MIN_SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MIN || "30", 10) * 60 * 1000;

let apiQuotaRemaining: number | null = null;
let apiQuotaCheckedAt: Date | null = null;
const QUOTA_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const QUOTA_LOW_THRESHOLD = 20;
const QUOTA_CONSERVE_THRESHOLD = Math.max(
  QUOTA_LOW_THRESHOLD + 1,
  parseInt(process.env.ODDS_API_CONSERVE_THRESHOLD || "250", 10)
);
const QUOTA_CAPTURE_ONLY_THRESHOLD = Math.max(
  QUOTA_LOW_THRESHOLD + 1,
  Math.min(
    QUOTA_CONSERVE_THRESHOLD,
    parseInt(process.env.ODDS_API_CAPTURE_ONLY_THRESHOLD || "150", 10)
  )
);
const ODDS_REFRESH_INTERVAL_MS =
  parseInt(process.env.ODDS_REFRESH_MIN || "360", 10) * 60 * 1000;
const SCORE_SETTLEMENT_INTERVAL_MS =
  parseInt(process.env.SCORE_SETTLEMENT_INTERVAL_MIN || "1440", 10) *
  60 *
  1000;
const SCORE_SETTLEMENT_MIN_QUOTA = parseInt(
  process.env.SCORE_SETTLEMENT_MIN_QUOTA || "50",
  10
);
const SCORE_SETTLEMENT_RETRY_INTERVAL_MS =
  parseInt(process.env.SCORE_SETTLEMENT_RETRY_INTERVAL_MIN || "120", 10) *
  60 *
  1000;
const SCORE_SETTLEMENT_STATE_KEY = "odds-api:completed-scores";
const FIXTURE_DISCOVERY_STATE_KEY = "odds-api:fixture-discovery";
const FIXTURE_DISCOVERY_INTERVAL_MS =
  parseInt(process.env.ODDS_DISCOVERY_INTERVAL_MIN || "10", 10) * 60 * 1000;
const FIXTURE_DISCOVERY_MAX_SPORTS = Math.max(
  1,
  parseInt(process.env.ODDS_DISCOVERY_MAX_SPORTS || "60", 10)
);
const FIXTURE_DISCOVERY_CONCURRENCY = Math.max(
  1,
  Math.min(10, parseInt(process.env.ODDS_DISCOVERY_CONCURRENCY || "2", 10))
);
const FIXTURE_DISCOVERY_BATCH_DELAY_MS = Math.max(
  0,
  parseInt(process.env.ODDS_DISCOVERY_BATCH_DELAY_MS || "250", 10)
);
const FIXTURE_DISCOVERY_RETRY_LIMIT = Math.max(
  0,
  Math.min(5, parseInt(process.env.ODDS_DISCOVERY_RETRY_LIMIT || "2", 10))
);
const FIXTURE_DISCOVERY_RETRY_DELAY_MS = Math.max(
  100,
  parseInt(process.env.ODDS_DISCOVERY_RETRY_DELAY_MS || "1000", 10)
);
const NEAR_TERM_PRIORITY_MS =
  parseInt(process.env.ODDS_NEAR_TERM_PRIORITY_HOURS || "36", 10) *
  60 *
  60 *
  1000;
const PAID_SPORTS_PER_SYNC = Math.max(
  1,
  parseInt(process.env.ODDS_API_PAID_SPORTS_PER_SYNC || "3", 10)
);
const DISCOVERY_LIVE_WINDOW_MS =
  parseInt(process.env.ODDS_DISCOVERY_LIVE_WINDOW_MIN || "240", 10) * 60 * 1000;
const DEFAULT_PRIORITY_SPORTS = [
  "soccer_epl",
  "soccer_germany_bundesliga",
  "soccer_spain_la_liga",
];

interface OddsDiscoveryCandidate {
  key: string;
  title: string;
  eventCount: number;
  firstFutureKickoff: string | null;
  hasLive: boolean;
}

interface OddsDiscoveryResult {
  created: number;
  updated: number;
  sportsScanned: number;
  eventsDiscovered: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
  sportCandidates: OddsDiscoveryCandidate[];
}

async function refreshOddsApiQuotaEstimate() {
  if (!config.api.oddsApiKey) return;

  const quotaAge = apiQuotaCheckedAt
    ? Date.now() - apiQuotaCheckedAt.getTime()
    : Infinity;
  if (apiQuotaRemaining !== null && quotaAge < QUOTA_CHECK_INTERVAL_MS) {
    return;
  }

  try {
    const response = await fetch(
      `${config.apiUrls.oddsApi}/sports/?apiKey=${config.api.oddsApiKey}`,
      { next: { revalidate: 0 } }
    );
    const remaining = response.headers.get("x-requests-remaining");
    if (remaining) {
      const parsed = parseInt(remaining, 10);
      if (Number.isFinite(parsed)) {
        apiQuotaRemaining = parsed;
        apiQuotaCheckedAt = new Date();
        console.log(
          `[Sync] Odds API quota preflight: ${apiQuotaRemaining} requests remaining`
        );
      }
    }
  } catch (error) {
    console.warn(
      `[Sync] Odds API quota preflight failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function configuredPrioritySports(): string[] {
  const raw = process.env.ODDS_API_PRIORITY_SPORTS?.trim();
  if (!raw) return DEFAULT_PRIORITY_SPORTS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function discoveryGroups(): Set<string> {
  return new Set(
    (process.env.ODDS_DISCOVERY_GROUPS || "Soccer")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOddsApiFrequencyLimit(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("The Odds API events error (429)") ||
    error.message.includes("EXCEEDED_FREQ_LIMIT")
  );
}

async function fetchDiscoveryEventsWithRetry(sportKey: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= FIXTURE_DISCOVERY_RETRY_LIMIT; attempt++) {
    try {
      return await fetchOddsApiEvents(sportKey);
    } catch (error) {
      lastError = error;
      if (!isOddsApiFrequencyLimit(error) || attempt >= FIXTURE_DISCOVERY_RETRY_LIMIT) {
        throw error;
      }
      await sleep(FIXTURE_DISCOVERY_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

function parseDiscoveryCandidates(metadataJson: string | null): OddsDiscoveryCandidate[] {
  if (!metadataJson) return [];
  try {
    const parsed = JSON.parse(metadataJson) as {
      sportCandidates?: OddsDiscoveryCandidate[];
    };
    return Array.isArray(parsed.sportCandidates) ? parsed.sportCandidates : [];
  } catch {
    return [];
  }
}

async function trainingCapturePrioritySports(now: Date): Promise<string[]> {
  const maxHorizonMinutes = Math.max(...HORIZONS.map((item) => item.maxMinutes));
  const matches = await prisma.match.findMany({
    where: {
      apiSource: "odds-api",
      status: "upcoming",
      commenceTime: {
        gte: new Date(now.getTime() + 25 * 60_000),
        lte: new Date(now.getTime() + maxHorizonMinutes * 60_000),
      },
    },
    select: {
      id: true,
      sport: true,
      commenceTime: true,
      oddsSnapshots: {
        where: {
          bookmaker: "consensus",
          capturedAt: { lte: now },
        },
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { id: true, capturedAt: true },
      },
      trainingFeatureSnapshots: {
        where: { featureSchemaVersion: FEATURE_SCHEMA_VERSION },
        select: { horizonKey: true },
      },
    },
  });

  const gaps = matches.flatMap((match) => {
    const minutesToKickoff =
      (match.commenceTime.getTime() - now.getTime()) / 60_000;
    const horizon = HORIZONS.find(
      (item) =>
        minutesToKickoff >= item.minMinutes &&
        minutesToKickoff <= item.maxMinutes
    );

    if (!horizon) return [];
    if (
      match.trainingFeatureSnapshots.some(
        (snapshot) => snapshot.horizonKey === horizon.key
      )
    ) {
      return [];
    }

    // Treat the current horizon as covered only when the latest causal
    // consensus snapshot is horizon-local. This prevents a 24h market
    // snapshot from silently being reused as the 6h or 1h observation while
    // still allowing one evidence-timer tick of scheduling grace.
    const latestConsensusAt = match.oddsSnapshots[0]?.capturedAt ?? null;
    const latestConsensusAgeMinutes = latestConsensusAt
      ? Math.max(0, (now.getTime() - latestConsensusAt.getTime()) / 60_000)
      : null;
    const maxConsensusAgeMinutes = maxConsensusAgeMinutesForHorizon(
      horizon.key,
      minutesToKickoff
    );
    if (
      latestConsensusAgeMinutes != null &&
      latestConsensusAgeMinutes <= maxConsensusAgeMinutes
    ) {
      return [];
    }

    return [
      {
        sport: match.sport,
        minutesUntilWindowCloses: minutesToKickoff - horizon.minMinutes,
      },
    ];
  });

  gaps.sort(
    (left, right) =>
      left.minutesUntilWindowCloses - right.minutesUntilWindowCloses
  );

  return Array.from(new Set(gaps.map((gap) => gap.sport).filter(Boolean)));
}

async function syncOddsApiFixtureDiscovery(
  force = false
): Promise<OddsDiscoveryResult> {
  const now = new Date();
  const errors: string[] = [];
  const state = await prisma.providerSyncState.findUnique({
    where: { key: FIXTURE_DISCOVERY_STATE_KEY },
    select: { lastSuccessAt: true, metadataJson: true },
  });

  if (
    !force &&
    state?.lastSuccessAt &&
    now.getTime() - state.lastSuccessAt.getTime() < FIXTURE_DISCOVERY_INTERVAL_MS
  ) {
    return {
      created: 0,
      updated: 0,
      sportsScanned: 0,
      eventsDiscovered: 0,
      skipped: true,
      reason: "Global fixture discovery is still fresh",
      errors,
      sportCandidates: parseDiscoveryCandidates(state.metadataJson),
    };
  }

  await prisma.providerSyncState.upsert({
    where: { key: FIXTURE_DISCOVERY_STATE_KEY },
    update: { lastAttemptAt: now },
    create: {
      key: FIXTURE_DISCOVERY_STATE_KEY,
      provider: "odds-api",
      lastAttemptAt: now,
    },
  });

  let sports;
  try {
    sports = (await fetchOddsApiSports())
      .filter(
        (sport) =>
          sport.active &&
          !sport.hasOutrights &&
          discoveryGroups().has(sport.group.toLowerCase()) &&
          Boolean(sport.key)
      )
      .slice(0, FIXTURE_DISCOVERY_MAX_SPORTS);
  } catch (error) {
    return {
      created: 0,
      updated: 0,
      sportsScanned: 0,
      eventsDiscovered: 0,
      skipped: false,
      errors: [
        `Sports discovery: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      sportCandidates: parseDiscoveryCandidates(state?.metadataJson ?? null),
    };
  }

  let created = 0;
  let updated = 0;
  let sportsScanned = 0;
  let eventsDiscovered = 0;
  const sportCandidates: OddsDiscoveryCandidate[] = [];

  for (let index = 0; index < sports.length; index += FIXTURE_DISCOVERY_CONCURRENCY) {
    const batch = sports.slice(index, index + FIXTURE_DISCOVERY_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (sport) => {
        try {
          const events = await fetchDiscoveryEventsWithRetry(sport.key);
          const ids = events.map((event) => event.id).filter(Boolean);
          const existing = ids.length
            ? await prisma.match.findMany({
                where: { externalId: { in: ids } },
                select: { externalId: true, status: true },
              })
            : [];
          const existingById = new Map(
            existing.map((match) => [match.externalId, match])
          );

          let localCreated = 0;
          let localUpdated = 0;
          let firstFutureKickoff: Date | null = null;
          let hasLive = false;

          for (const event of events) {
            if (!event.id || !event.homeTeam || !event.awayTeam) continue;
            const eventTime = new Date(event.commenceTime);
            if (!Number.isFinite(eventTime.getTime())) continue;

            const kickoffMs = eventTime.getTime();
            const ageMs = now.getTime() - kickoffMs;
            if (kickoffMs > now.getTime()) {
              if (!firstFutureKickoff || eventTime < firstFutureKickoff) {
                firstFutureKickoff = eventTime;
              }
            } else if (ageMs <= DISCOVERY_LIVE_WINDOW_MS) {
              hasLive = true;
            }

            const status =
              kickoffMs > now.getTime()
                ? "upcoming"
                : ageMs <= DISCOVERY_LIVE_WINDOW_MS
                  ? "live"
                  : "awaiting_result";
            const current = existingById.get(event.id);

            if (current) {
              if (!["finished", "cancelled", "postponed"].includes(current.status)) {
                await prisma.match.updateMany({
                  where: {
                    externalId: event.id,
                    status: { notIn: ["finished", "cancelled", "postponed"] },
                  },
                  data: {
                    sport: event.sportKey || sport.key,
                    league: event.sportTitle || sport.title,
                    homeTeam: event.homeTeam,
                    awayTeam: event.awayTeam,
                    commenceTime: eventTime,
                    status,
                    apiSource: "odds-api",
                  },
                });
                localUpdated++;
              }
              continue;
            }

            try {
              await prisma.match.create({
                data: {
                  externalId: event.id,
                  sport: event.sportKey || sport.key,
                  league: event.sportTitle || sport.title,
                  homeTeam: event.homeTeam,
                  awayTeam: event.awayTeam,
                  homeOdds: 0,
                  drawOdds: null,
                  awayOdds: 0,
                  commenceTime: eventTime,
                  status,
                  apiSource: "odds-api",
                  lastSyncedAt: null,
                },
              });
              localCreated++;
            } catch (error) {
              const raced = await prisma.match.findUnique({
                where: { externalId: event.id },
                select: { id: true },
              });
              if (!raced) throw error;
            }
          }

          return {
            ok: true as const,
            sport,
            events: events.length,
            created: localCreated,
            updated: localUpdated,
            candidate: {
              key: sport.key,
              title: sport.title,
              eventCount: events.length,
              firstFutureKickoff: firstFutureKickoff?.toISOString() ?? null,
              hasLive,
            } satisfies OddsDiscoveryCandidate,
          };
        } catch (error) {
          return {
            ok: false as const,
            sport,
            error: error instanceof Error ? error.message : "Unknown discovery error",
          };
        }
      })
    );

    for (const result of batchResults) {
      if (!result.ok) {
        errors.push(`${result.sport.key}: ${result.error}`);
        continue;
      }
      sportsScanned++;
      eventsDiscovered += result.events;
      created += result.created;
      updated += result.updated;
      if (result.candidate.eventCount > 0) {
        sportCandidates.push(result.candidate);
      }
    }

    if (
      index + FIXTURE_DISCOVERY_CONCURRENCY < sports.length &&
      FIXTURE_DISCOVERY_BATCH_DELAY_MS > 0
    ) {
      await sleep(FIXTURE_DISCOVERY_BATCH_DELAY_MS);
    }
  }

  sportCandidates.sort((left, right) => {
    if (left.hasLive !== right.hasLive) return left.hasLive ? -1 : 1;
    if (!left.firstFutureKickoff) return 1;
    if (!right.firstFutureKickoff) return -1;
    return left.firstFutureKickoff.localeCompare(right.firstFutureKickoff);
  });

  if (sportsScanned > 0) {
    await prisma.providerSyncState.upsert({
      where: { key: FIXTURE_DISCOVERY_STATE_KEY },
      update: {
        lastSuccessAt: new Date(),
        metadataJson: JSON.stringify({
          sportsScanned,
          eventsDiscovered,
          created,
          updated,
          errors: errors.length,
          sportCandidates,
        }),
      },
      create: {
        key: FIXTURE_DISCOVERY_STATE_KEY,
        provider: "odds-api",
        lastAttemptAt: now,
        lastSuccessAt: new Date(),
        metadataJson: JSON.stringify({
          sportsScanned,
          eventsDiscovered,
          created,
          updated,
          errors: errors.length,
          sportCandidates,
        }),
      },
    });
  }

  return {
    created,
    updated,
    sportsScanned,
    eventsDiscovered,
    skipped: false,
    errors,
    sportCandidates,
  };
}

async function syncOddsApiSettlements(): Promise<{
  updated: number;
  calls: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
  affectedCompetitions: Array<{ sport: string; league: string }>;
}> {
  const errors: string[] = [];
  const affectedCompetitionKeys = new Set<string>();
  const now = new Date();

  const state = await prisma.providerSyncState.findUnique({
    where: { key: SCORE_SETTLEMENT_STATE_KEY },
    select: {
      lastAttemptAt: true,
      lastSuccessAt: true,
      metadataJson: true,
    },
  });

  let previousUnresolvedCount = 0;
  if (state?.metadataJson) {
    try {
      const metadata = JSON.parse(state.metadataJson) as {
        unresolved?: unknown;
      };
      const parsed = Number(metadata.unresolved);
      previousUnresolvedCount = Number.isFinite(parsed) ? parsed : 0;
    } catch {
      previousUnresolvedCount = 0;
    }
  }

  const unresolved = await prisma.match.findMany({
    where: {
      apiSource: "odds-api",
      externalId: { not: null },
      commenceTime: {
        gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 90 * 60 * 1000),
      },
      AND: [
        {
          OR: [
            { lastSyncedAt: { not: null } },
            { status: { in: ["live", "awaiting_result"] } },
          ],
        },
        {
          OR: [{ homeScore: null }, { awayScore: null }],
        },
      ],
    },
    select: {
      externalId: true,
      sport: true,
      commenceTime: true,
    },
  });

  const earliestEligibleAt = unresolved.length
    ? new Date(
        Math.min(
          ...unresolved.map(
            (match) => match.commenceTime.getTime() + 90 * 60 * 1000
          )
        )
      )
    : null;

  const hasNewlyEligibleResults =
    unresolved.length > previousUnresolvedCount;

  if (
    unresolved.length > 0 &&
    !hasNewlyEligibleResults &&
    earliestEligibleAt &&
    state?.lastAttemptAt &&
    state.lastAttemptAt >= earliestEligibleAt &&
    now.getTime() - state.lastAttemptAt.getTime() <
      SCORE_SETTLEMENT_RETRY_INTERVAL_MS
  ) {
    return {
      updated: 0,
      calls: 0,
      skipped: true,
      reason: "Completed-score settlement retry backoff is still active",
      errors,
      affectedCompetitions: [],
    };
  }

  if (
    unresolved.length === 0 &&
    state?.lastSuccessAt &&
    now.getTime() - state.lastSuccessAt.getTime() <
      SCORE_SETTLEMENT_INTERVAL_MS
  ) {
    return {
      updated: 0,
      calls: 0,
      skipped: true,
      reason: "Completed-score settlement sync is still fresh and no unresolved matches are eligible",
      errors,
      affectedCompetitions: [],
    };
  }

  if (
    unresolved.length > 0 &&
    apiQuotaRemaining !== null &&
    apiQuotaRemaining < SCORE_SETTLEMENT_MIN_QUOTA
  ) {
    return {
      updated: 0,
      calls: 0,
      skipped: true,
      reason: `Odds API quota below score-settlement floor (${apiQuotaRemaining} < ${SCORE_SETTLEMENT_MIN_QUOTA})`,
      errors,
      affectedCompetitions: [],
    };
  }

  const bySport = new Map<string, string[]>();
  for (const match of unresolved) {
    if (!match.externalId) continue;
    const ids = bySport.get(match.sport) ?? [];
    ids.push(match.externalId);
    bySport.set(match.sport, ids);
  }

  let updated = 0;
  let calls = 0;

  await prisma.providerSyncState.upsert({
    where: { key: SCORE_SETTLEMENT_STATE_KEY },
    update: { lastAttemptAt: now },
    create: {
      key: SCORE_SETTLEMENT_STATE_KEY,
      provider: "odds-api",
      lastAttemptAt: now,
    },
  });

  for (const [sport, eventIds] of bySport) {
    try {
      const result = await fetchOddsApiCompletedScores(
        sport,
        eventIds,
        3
      );
      calls++;

      if (result.remainingRequests != null) {
        apiQuotaRemaining = result.remainingRequests;
        apiQuotaCheckedAt = new Date();
      }

      console.log(
        `[Sync] ${sport}: completed-score settlement call cost ${result.requestCost ?? "unknown"}; remaining ${result.remainingRequests ?? "unknown"}`
      );

      for (const event of result.events) {
        if (
          !event.id ||
          event.homeScore == null ||
          event.awayScore == null
        ) {
          continue;
        }

        if (event.completed) {
          const match = await prisma.match.findUnique({
            where: { externalId: event.id },
            select: {
              id: true,
              sport: true,
              league: true,
            },
          });
          if (!match) continue;

          await prisma.match.update({
            where: { id: match.id },
            data: {
              homeScore: event.homeScore,
              awayScore: event.awayScore,
              status: "finished",
              minute: null,
              lastSyncedAt: new Date(),
            },
          });
          updated++;
          affectedCompetitionKeys.add(
            JSON.stringify([match.sport, match.league])
          );
        }
      }
    } catch (error) {
      errors.push(
        `${sport}: ${error instanceof Error ? error.message : "Unknown score-settlement error"}`
      );
    }
  }

  if (errors.length === 0) {
    await prisma.providerSyncState.upsert({
      where: { key: SCORE_SETTLEMENT_STATE_KEY },
      update: {
        lastSuccessAt: new Date(),
        metadataJson: JSON.stringify({
          calls,
          updated,
          unresolved: unresolved.length,
          remainingRequests: apiQuotaRemaining,
        }),
      },
      create: {
        key: SCORE_SETTLEMENT_STATE_KEY,
        provider: "odds-api",
        lastAttemptAt: now,
        lastSuccessAt: new Date(),
        metadataJson: JSON.stringify({
          calls,
          updated,
          unresolved: unresolved.length,
          remainingRequests: apiQuotaRemaining,
        }),
      },
    });
  }

  const affectedCompetitions = Array.from(affectedCompetitionKeys).map(
    (key) => {
      const [sport, league] = JSON.parse(key) as [string, string];
      return { sport, league };
    }
  );

  return {
    updated,
    calls,
    skipped: false,
    errors,
    affectedCompetitions,
  };
}

export interface SyncResult {
  matchesSynced: number;
  matchesUpdated: number;
  source: "odds-api" | "api-football" | "demo" | "none";
  errors: string[];
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}

export async function syncMatchData(force: boolean = false): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let matchesSynced = 0;
  let matchesUpdated = 0;
  const dataSource = getPrimaryDataSource();
  let oddsDiscovery: OddsDiscoveryResult | null = null;

  if (dataSource === "odds-api") {
    await prisma.match.updateMany({
      where: {
        apiSource: "odds-api",
        status: "live",
        commenceTime: {
          lt: new Date(Date.now() - DISCOVERY_LIVE_WINDOW_MS),
        },
      },
      data: {
        status: "awaiting_result",
        minute: null,
      },
    });

    oddsDiscovery = await syncOddsApiFixtureDiscovery(force);
    matchesSynced += oddsDiscovery.created;
    matchesUpdated += oddsDiscovery.updated;
    if (oddsDiscovery.errors.length > 0) {
      errors.push(
        ...oddsDiscovery.errors.map((error) => `Odds API discovery: ${error}`)
      );
    }
    if (!oddsDiscovery.skipped) {
      console.log(
        `[Sync] Global football discovery scanned ${oddsDiscovery.sportsScanned} sports / ${oddsDiscovery.eventsDiscovered} events; created ${oddsDiscovery.created} fixtures and updated ${oddsDiscovery.updated}.`
      );
    }
  }

  if (!force && lastSyncAt && Date.now() - lastSyncAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    const minutesSincePaidSync = Math.round(
      (Date.now() - lastSyncAt.getTime()) / 60000
    );
    const discoveryNote =
      oddsDiscovery && !oddsDiscovery.skipped
        ? " Free fixture discovery refreshed."
        : "";

    return {
      matchesSynced,
      matchesUpdated,
      source:
        oddsDiscovery && !oddsDiscovery.skipped ? "odds-api" : "none",
      errors,
      durationMs: Date.now() - startTime,
      skipped: true,
      skipReason: `Paid sync ran ${minutesSincePaidSync}m ago (min interval: ${MIN_SYNC_INTERVAL_MS / 60000}m).${discoveryNote}`,
    };
  }

  if (dataSource === "none") {
    const existingCount = await prisma.match.count();
    if (existingCount > 0) {
      const oldestSync = await prisma.match.findFirst({
        where: { apiSource: "demo" },
        orderBy: { lastSyncedAt: "asc" },
        select: { lastSyncedAt: true },
      });

      if (oldestSync?.lastSyncedAt && Date.now() - oldestSync.lastSyncedAt.getTime() < 30 * 60 * 1000) {
        lastSyncAt = new Date();
        return {
          matchesSynced: 0,
          matchesUpdated: 0,
          source: "demo",
          errors: [],
          durationMs: Date.now() - startTime,
          skipped: true,
          skipReason: "Demo data still fresh (<30m old)",
        };
      }

      await prisma.match.deleteMany({ where: { apiSource: "demo" } });
    }

    const demoMatches = generateDemoMatches();
    for (const match of demoMatches) {
      try {
        await prisma.match.upsert({
          where: { externalId: match.externalId },
          update: {
            homeOdds: match.homeOdds,
            drawOdds: match.drawOdds,
            awayOdds: match.awayOdds,
            overUnderLine: match.overUnderLine,
            overOdds: match.overOdds,
            underOdds: match.underOdds,
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            minute: match.minute,
            lastSyncedAt: new Date(),
            apiSource: "demo",
          },
          create: {
            externalId: match.externalId,
            sport: match.sport,
            league: match.league,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeOdds: match.homeOdds,
            drawOdds: match.drawOdds,
            awayOdds: match.awayOdds,
            overUnderLine: match.overUnderLine,
            overOdds: match.overOdds,
            underOdds: match.underOdds,
            commenceTime: new Date(match.commenceTime),
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            minute: match.minute,
            apiSource: "demo",
            lastSyncedAt: new Date(),
          },
        });
        matchesSynced++;
      } catch (err) {
        errors.push(`Demo match: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    lastSyncAt = new Date();
    return {
      matchesSynced,
      matchesUpdated: 0,
      source: "demo",
      errors,
      durationMs: Date.now() - startTime,
      skipped: false,
    };
  }

  if (dataSource === "odds-api") {
    await refreshOddsApiQuotaEstimate();

    let paidOddsAllowed = true;
    if (!force && apiQuotaRemaining !== null && apiQuotaRemaining < QUOTA_LOW_THRESHOLD) {
      const quotaAge = apiQuotaCheckedAt
        ? Date.now() - apiQuotaCheckedAt.getTime()
        : Infinity;
      if (quotaAge < QUOTA_CHECK_INTERVAL_MS) {
        paidOddsAllowed = false;
        console.warn(
          `[Sync] Odds API quota low: ${apiQuotaRemaining} remaining. Continuing event discovery but pausing paid odds refresh.`
        );
      }
    }

    const discovery =
      oddsDiscovery ?? (await syncOddsApiFixtureDiscovery(force));

    if (!oddsDiscovery) {
      matchesSynced += discovery.created;
      matchesUpdated += discovery.updated;
      if (discovery.errors.length > 0) {
        errors.push(
          ...discovery.errors.map((error) => `Odds API discovery: ${error}`)
        );
      }
    }

    const nowMs = Date.now();
    const nearTermSports = discovery.sportCandidates
      .filter((candidate) => {
        if (candidate.hasLive) return true;
        if (!candidate.firstFutureKickoff) return false;
        const kickoff = new Date(candidate.firstFutureKickoff).getTime();
        return (
          Number.isFinite(kickoff) &&
          kickoff >= nowMs &&
          kickoff - nowMs <= NEAR_TERM_PRIORITY_MS
        );
      })
      .sort((left, right) => {
        if (left.hasLive !== right.hasLive) return left.hasLive ? -1 : 1;
        const leftAt = left.firstFutureKickoff
          ? new Date(left.firstFutureKickoff).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightAt = right.firstFutureKickoff
          ? new Date(right.firstFutureKickoff).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftAt - rightAt;
      })
      .map((candidate) => candidate.key);

    let capturePrioritySports: string[] = [];
    try {
      capturePrioritySports = await trainingCapturePrioritySports(new Date(nowMs));
    } catch (error) {
      console.warn(
        `[Sync] Could not rank training-capture odds gaps: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const { captureOnlyMode, sportsToFetch } = selectPaidOddsSports({
      quotaRemaining: apiQuotaRemaining,
      force,
      normalLimit: PAID_SPORTS_PER_SYNC,
      conserveThreshold: QUOTA_CONSERVE_THRESHOLD,
      captureOnlyThreshold: QUOTA_CAPTURE_ONLY_THRESHOLD,
      capturePrioritySports,
      nearTermSports,
      configuredPrioritySports: configuredPrioritySports(),
    });

    if (captureOnlyMode) {
      console.warn(
        `[Sync] Odds API conservation mode: ${apiQuotaRemaining} remaining. ` +
          (capturePrioritySports.length > 0
            ? "Restricting paid odds refresh to horizon-local training-capture gaps."
            : "No horizon-local capture gap is open, so routine paid odds enrichment is paused.")
      );
    }

    if (capturePrioritySports.length > 0) {
      console.log(
        `[Sync] Training-capture odds priorities: ${capturePrioritySports.join(", ")}`
      );
    }
    console.log(
      `[Sync] Paid odds enrichment targets: ${sportsToFetch.join(", ") || "none"}`
    );

    for (const sport of sportsToFetch) {
      try {
        const capturePriority = capturePrioritySports.includes(sport);
        let shouldFetchOdds = force || capturePriority;

        try {
          const events = await fetchDiscoveryEventsWithRetry(sport);
          const eventIds = events.map((event) => event.id).filter(Boolean);
          const existing = eventIds.length
            ? await prisma.match.findMany({
                where: { externalId: { in: eventIds } },
                select: { externalId: true, lastSyncedAt: true },
              })
            : [];
          const existingById = new Map(
            existing.map((match) => [match.externalId, match])
          );

          for (const event of events) {
            if (!existingById.has(event.id)) continue;
            const eventTime = new Date(event.commenceTime);
            const discoveredStatus =
              eventTime.getTime() <= Date.now() ? "live" : "upcoming";
            await prisma.match.updateMany({
              where: { externalId: event.id },
              data: {
                sport: event.sportKey,
                league: event.sportTitle,
                homeTeam: event.homeTeam,
                awayTeam: event.awayTeam,
                commenceTime: eventTime,
                status: discoveredStatus,
              },
            });
          }

          const hasNewFixture = events.some(
            (event) => !existingById.has(event.id)
          );
          const hasStaleOdds = existing.some(
            (match) =>
              !match.lastSyncedAt ||
              Date.now() - match.lastSyncedAt.getTime() >=
                ODDS_REFRESH_INTERVAL_MS
          );

          shouldFetchOdds =
            shouldFetchOdds || hasNewFixture || hasStaleOdds;

          if (capturePriority && !hasNewFixture && !hasStaleOdds) {
            console.log(
              `[Sync] ${sport}: forcing one paid odds refresh for a horizon-local training-capture gap.`
            );
          }

          if (!shouldFetchOdds) {
            console.log(
              `[Sync] ${sport}: discovered ${events.length} events; odds remain fresh, skipping paid odds refresh.`
            );
            continue;
          }
        } catch (eventError) {
          errors.push(
            `Odds API event discovery ${sport}: ${eventError instanceof Error ? eventError.message : "Unknown error"}`
          );
          shouldFetchOdds = true;
        }

        if (!paidOddsAllowed && !force) {
          console.log(
            `[Sync] ${sport}: paid odds refresh needed but quota is below threshold; keeping discovered fixture metadata only.`
          );
          continue;
        }

        const odds = await fetchOddsApiUpcoming(sport);

        if (apiQuotaRemaining === null || !apiQuotaCheckedAt ||
            Date.now() - apiQuotaCheckedAt.getTime() > QUOTA_CHECK_INTERVAL_MS) {
          try {
            const quotaRes = await fetch(
              `${config.apiUrls.oddsApi}/sports/?apiKey=${config.api.oddsApiKey}`,
              { next: { revalidate: 0 } }
            );
            const remaining = quotaRes.headers.get("x-requests-remaining");
            if (remaining) {
              apiQuotaRemaining = parseInt(remaining, 10);
              apiQuotaCheckedAt = new Date();
              console.log(`[Sync] Odds API quota: ${apiQuotaRemaining} requests remaining`);
            }
          } catch {
          }
        }

        for (const matchOdds of odds) {
          try {
            const matchData = convertOddsApiToMatch(matchOdds);
            const existing = await prisma.match.findUnique({
              where: { externalId: matchData.externalId },
            });

            const syncedMatch = await prisma.match.upsert({
              where: { externalId: matchData.externalId },
              update: {
                homeOdds: matchData.homeOdds,
                drawOdds: matchData.drawOdds,
                awayOdds: matchData.awayOdds,
                overUnderLine: matchData.overUnderLine,
                overOdds: matchData.overOdds,
                underOdds: matchData.underOdds,
                lastSyncedAt: new Date(),
                apiSource: "odds-api",
              },
              create: {
                externalId: matchData.externalId,
                sport: matchData.sport,
                league: matchData.league,
                homeTeam: matchData.homeTeam,
                awayTeam: matchData.awayTeam,
                homeOdds: matchData.homeOdds,
                drawOdds: matchData.drawOdds,
                awayOdds: matchData.awayOdds,
                overUnderLine: matchData.overUnderLine,
                overOdds: matchData.overOdds,
                underOdds: matchData.underOdds,
                commenceTime: new Date(matchData.commenceTime),
                status: "upcoming",
                apiSource: "odds-api",
                lastSyncedAt: new Date(),
              },
            });

            const capturedAt = new Date().toISOString();
            await Promise.all([
              persistOddsSnapshot(syncedMatch.id, {
                provider: "odds-api",
                providerFixtureId: matchData.externalId,
                capturedAt,
                bookmaker: "best-available",
                home: matchData.homeOdds,
                draw: matchData.drawOdds,
                away: matchData.awayOdds,
                over25:
                  matchData.overUnderLine === 2.5 ? matchData.overOdds : null,
                under25:
                  matchData.overUnderLine === 2.5 ? matchData.underOdds : null,
              }),
              persistOddsSnapshot(syncedMatch.id, {
                provider: "odds-api",
                providerFixtureId: matchData.externalId,
                capturedAt,
                bookmaker: "consensus",
                home: matchData.consensusHomeOdds,
                draw: matchData.consensusDrawOdds,
                away: matchData.consensusAwayOdds,
                over25: null,
                under25: null,
              }),
            ]);

            if (existing) matchesUpdated++;
            else matchesSynced++;
          } catch (err) {
            errors.push(`Odds API match: ${err instanceof Error ? err.message : "Unknown error"}`);
          }
        }
      } catch (err) {
        errors.push(`Odds API ${sport}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    try {
      const settlement = await syncOddsApiSettlements();
      matchesUpdated += settlement.updated;
      if (settlement.errors.length > 0) {
        errors.push(
          ...settlement.errors.map((error) => `Odds API settlement: ${error}`)
        );
      }
      if (!settlement.skipped && settlement.calls > 0) {
        console.log(
          `[Sync] Settled ${settlement.updated} completed matches using ${settlement.calls} score calls.`
        );
      }

      for (const competition of settlement.affectedCompetitions) {
        try {
          const rebuild = await rebuildLeagueEloSnapshots(
            competition.sport,
            competition.league
          );
          console.log(
            `[Sync] Rebuilt ${rebuild.snapshotsCreated} ELO snapshots for ${competition.league} after settlement.`
          );
        } catch (eloError) {
          errors.push(
            `ELO rebuild ${competition.league}: ${eloError instanceof Error ? eloError.message : "Unknown ELO rebuild error"}`
          );
        }
      }
    } catch (error) {
      errors.push(
        `Odds API settlement: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    try {
      const repair = await repairMissingCausalEloSnapshots();
      if (repair.competitionsRebuilt > 0) {
        console.log(
          `[Sync] Repaired causal ELO histories for ${repair.competitionsRebuilt} competitions.`
        );
      }
    } catch (repairError) {
      errors.push(
        `ELO repair: ${repairError instanceof Error ? repairError.message : "Unknown ELO repair error"}`
      );
    }

    try {
      const capture = await captureTrainingFeatureSnapshots();
      if (capture.captured > 0) {
        console.log(
          `[Sync] Captured ${capture.captured} first-party training feature snapshots.`
        );
      }
      if (capture.errors.length > 0) {
        errors.push(
          ...capture.errors.map((error) => `Training feature capture: ${error}`)
        );
      }
    } catch (error) {
      errors.push(
        `Training feature capture: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    await markStaleMatchesFinished();

    lastSyncAt = new Date();
    return {
      matchesSynced,
      matchesUpdated,
      source: "odds-api",
      errors,
      durationMs: Date.now() - startTime,
      skipped: false,
    };
  }

  if (dataSource === "api-football") {
    const leagues = [39, 135, 140, 61, 2];

    for (const league of leagues) {
      try {
        const fixtures = await fetchApiFootballFixtures(league, new Date().getFullYear());

        for (const fixture of fixtures) {
          try {
            const existing = await prisma.match.findUnique({
              where: { externalId: `af-${fixture.fixtureId}` },
            });

            await ensureFixtureIdentity({
              provider: "api-football",
              providerFixtureId: String(fixture.fixtureId),
              kickoffUtc: fixture.commenceTime,
              status: fixture.status as "upcoming" | "live" | "finished" | "postponed" | "cancelled",
              minute: fixture.minute,
              league: {
                provider: "api-football",
                providerLeagueId: String(fixture.leagueId),
                name: fixture.league,
                season: String(fixture.season),
              },
              home: {
                provider: "api-football",
                providerTeamId: String(fixture.homeTeamId),
                name: fixture.homeTeam,
              },
              away: {
                provider: "api-football",
                providerTeamId: String(fixture.awayTeamId),
                name: fixture.awayTeam,
              },
              score: {
                home: fixture.homeScore,
                away: fixture.awayScore,
              },
              lastProviderUpdate: new Date().toISOString(),
            });

            await prisma.match.upsert({
              where: { externalId: `af-${fixture.fixtureId}` },
              update: {
                homeScore: fixture.homeScore,
                awayScore: fixture.awayScore,
                minute: fixture.minute,
                status: fixture.status as "upcoming" | "live" | "finished",
                lastSyncedAt: new Date(),
              },
              create: {
                externalId: `af-${fixture.fixtureId}`,
                sport: "football",
                league: fixture.league,
                homeTeam: fixture.homeTeam,
                awayTeam: fixture.awayTeam,
                homeOdds: 2.0,
                awayOdds: 2.0,
                commenceTime: new Date(fixture.commenceTime),
                status: fixture.status as "upcoming" | "live" | "finished",
                homeScore: fixture.homeScore,
                awayScore: fixture.awayScore,
                minute: fixture.minute,
                apiSource: "api-football",
                lastSyncedAt: new Date(),
              },
            });

            if (existing) matchesUpdated++;
            else matchesSynced++;
          } catch (err) {
            errors.push(`API-Football match: ${err instanceof Error ? err.message : "Unknown error"}`);
          }
        }
      } catch (err) {
        errors.push(`API-Football league ${league}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    try {
      const liveFixtures = await fetchApiFootballLiveFixtures();
      for (const fixture of liveFixtures) {
        try {
          await ensureFixtureIdentity({
            provider: "api-football",
            providerFixtureId: String(fixture.fixtureId),
            kickoffUtc: fixture.commenceTime,
            status: "live",
            minute: fixture.minute,
            league: {
              provider: "api-football",
              providerLeagueId: String(fixture.leagueId),
              name: fixture.league,
              season: String(fixture.season),
            },
            home: {
              provider: "api-football",
              providerTeamId: String(fixture.homeTeamId),
              name: fixture.homeTeam,
            },
            away: {
              provider: "api-football",
              providerTeamId: String(fixture.awayTeamId),
              name: fixture.awayTeam,
            },
            score: {
              home: fixture.homeScore,
              away: fixture.awayScore,
            },
            lastProviderUpdate: new Date().toISOString(),
          });

          await prisma.match.upsert({
            where: { externalId: `af-${fixture.fixtureId}` },
            update: {
              homeScore: fixture.homeScore,
              awayScore: fixture.awayScore,
              minute: fixture.minute,
              status: "live",
              lastSyncedAt: new Date(),
            },
            create: {
              externalId: `af-${fixture.fixtureId}`,
              sport: "football",
              league: fixture.league,
              homeTeam: fixture.homeTeam,
              awayTeam: fixture.awayTeam,
              homeOdds: 2.0,
              awayOdds: 2.0,
              commenceTime: new Date(fixture.commenceTime),
              status: "live",
              homeScore: fixture.homeScore,
              awayScore: fixture.awayScore,
              minute: fixture.minute,
              apiSource: "api-football",
              lastSyncedAt: new Date(),
            },
          });
          matchesUpdated++;
        } catch (err) {
          errors.push(`API-Football live: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    } catch (err) {
      errors.push(`API-Football live: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    await markStaleMatchesFinished();

    lastSyncAt = new Date();
    return {
      matchesSynced,
      matchesUpdated,
      source: "api-football",
      errors,
      durationMs: Date.now() - startTime,
      skipped: false,
    };
  }

  lastSyncAt = new Date();
  return {
    matchesSynced: 0,
    matchesUpdated: 0,
    source: "none",
    errors: ["No supported data source configured"],
    durationMs: Date.now() - startTime,
    skipped: false,
  };
}

async function markStaleMatchesFinished(): Promise<number> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const result = await prisma.match.updateMany({
    where: {
      status: { in: ["upcoming", "live"] },
      commenceTime: { lt: threeHoursAgo },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    data: {
      status: "finished",
    },
  });

  return result.count;
}

export function getApiQuotaStatus(): { remaining: number | null; checkedAt: Date | null; lowThreshold: number } {
  return {
    remaining: apiQuotaRemaining,
    checkedAt: apiQuotaCheckedAt,
    lowThreshold: QUOTA_LOW_THRESHOLD,
  };
}
