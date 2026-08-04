// ============================================================================
// iBetPro Live Data Sync Service
// Fetches real-time match data from external APIs and syncs to the database.
// Called by the bot engine before each scan cycle and by the cron sync endpoint.
// Falls back to demo data when no API keys are configured.
// ============================================================================

import { prisma } from "./db";
import { config, getPrimaryDataSource } from "./config";
import {
  fetchOddsApiUpcoming,
  convertOddsApiToMatch,
  fetchApiFootballFixtures,
  fetchApiFootballLiveFixtures,
} from "./external-apis";
import { generateDemoMatches } from "./demo-data";

// Track last sync time to avoid excessive API calls
let lastSyncAt: Date | null = null;

// Sync interval: 30 minutes default to conserve API quota (500 req/month free tier)
// Each sync costs N API calls (1 per sport). 10 sports × 48 syncs/day = 480 calls/day.
// With 30-min interval: 10 sports × 48 syncs/day = 480 calls/day — STILL too much.
// Solution: use a single multi-sport call + 30-min interval = ~48 calls/day = ~1,440/month
// Override with SYNC_INTERVAL_MIN env var if you have a paid API plan.
const MIN_SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MIN || "30", 10) * 60 * 1000;

// API quota tracking
let apiQuotaRemaining: number | null = null;
let apiQuotaCheckedAt: Date | null = null;
const QUOTA_CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-check quota every hour
const QUOTA_LOW_THRESHOLD = 20; // stop syncing when fewer than this many requests remain

export interface SyncResult {
  matchesSynced: number;
  matchesUpdated: number;
  source: "odds-api" | "api-football" | "demo" | "none";
  errors: string[];
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Sync upcoming match data from external APIs.
 * Automatically uses the best available data source (Odds API → API-Football → Demo).
 * Throttled to avoid hitting API rate limits (minimum 5 min between syncs).
 */
export async function syncMatchData(force: boolean = false): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let matchesSynced = 0;
  let matchesUpdated = 0;

  // Throttle: skip if synced recently (unless forced)
  if (!force && lastSyncAt && Date.now() - lastSyncAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return {
      matchesSynced: 0,
      matchesUpdated: 0,
      source: "none",
      errors: [],
      durationMs: Date.now() - startTime,
      skipped: true,
      skipReason: `Synced ${Math.round((Date.now() - lastSyncAt.getTime()) / 60000)}m ago (min interval: ${MIN_SYNC_INTERVAL_MS / 60000}m)`,
    };
  }

  const dataSource = getPrimaryDataSource();

  // ---- No API keys: use demo data ----
  if (dataSource === "none") {
    const existingCount = await prisma.match.count();
    if (existingCount > 0) {
      // Demo data already loaded — just refresh if stale
      const oldestSync = await prisma.match.findFirst({
        where: { apiSource: "demo" },
        orderBy: { lastSyncedAt: "asc" },
        select: { lastSyncedAt: true },
      });

      if (oldestSync?.lastSyncedAt && Date.now() - oldestSync.lastSyncedAt.getTime() < 30 * 60 * 1000) {
        // Demo data is less than 30 minutes old — skip
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

      // Delete old demo data and regenerate
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

  // ---- The Odds API: fetch real-time odds ----
  if (dataSource === "odds-api") {
    // Check API quota before making calls
    if (!force && apiQuotaRemaining !== null && apiQuotaRemaining < QUOTA_LOW_THRESHOLD) {
      const quotaAge = apiQuotaCheckedAt ? Date.now() - apiQuotaCheckedAt.getTime() : Infinity;
      if (quotaAge < QUOTA_CHECK_INTERVAL_MS) {
        console.warn(`[Sync] Odds API quota low: ${apiQuotaRemaining} requests remaining. Skipping sync.`);
        lastSyncAt = new Date();
        return {
          matchesSynced: 0,
          matchesUpdated: 0,
          source: "odds-api",
          errors: [],
          durationMs: Date.now() - startTime,
          skipped: true,
          skipReason: `API quota low: ${apiQuotaRemaining} remaining (threshold: ${QUOTA_LOW_THRESHOLD})`,
        };
      }
    }

    // Use only priority sports to conserve API quota.
    // Each sport = 1 API call. With 500/month free tier and 30-min sync interval:
    //   3 sports × 48 syncs/day = 144 calls/day = ~4,320/month (over limit)
    //   So we also use a single "upcoming" catch-all when quota is getting low.
    const prioritySports = [
      "soccer_epl",
      "soccer_germany_bundesliga",
      "soccer_spain_la_liga",
    ];
    // When quota is below 100, only fetch EPL to stretch remaining calls
    const sportsToFetch = (apiQuotaRemaining !== null && apiQuotaRemaining < 100)
      ? ["soccer_epl"]
      : prioritySports;

    for (const sport of sportsToFetch) {
      try {
        const odds = await fetchOddsApiUpcoming(sport);

        // Track API quota from response headers (fetchOddsApiUpcoming doesn't expose them,
        // so we do a lightweight quota check on the first call only)
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
            // Quota check failed — don't block sync
          }
        }

        for (const matchOdds of odds) {
          try {
            const matchData = convertOddsApiToMatch(matchOdds);
            const existing = await prisma.match.findUnique({
              where: { externalId: matchData.externalId },
            });

            await prisma.match.upsert({
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

    // Also mark old matches as finished
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

  // ---- API-Football: fetch fixtures ----
  if (dataSource === "api-football") {
    const leagues = [39, 135, 140, 61, 2]; // EPL, Serie A, La Liga, Ligue 1, UCL

    for (const league of leagues) {
      try {
        const fixtures = await fetchApiFootballFixtures(league, new Date().getFullYear());

        for (const fixture of fixtures) {
          try {
            const existing = await prisma.match.findUnique({
              where: { externalId: `af-${fixture.fixtureId}` },
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

    // Also fetch live fixtures
    try {
      const liveFixtures = await fetchApiFootballLiveFixtures();
      for (const fixture of liveFixtures) {
        try {
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

  // ---- SportMonks: future support ----
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

/**
 * Mark matches that started more than 3 hours ago as "finished"
 * if they're still in "upcoming" or "live" status (data cleanup).
 */
async function markStaleMatchesFinished(): Promise<number> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const result = await prisma.match.updateMany({
    where: {
      status: { in: ["upcoming", "live"] },
      commenceTime: { lt: threeHoursAgo },
    },
    data: {
      status: "finished",
    },
  });

  return result.count;
}

/**
 * Get current API quota status (for admin/monitor display).
 */
export function getApiQuotaStatus(): { remaining: number | null; checkedAt: Date | null; lowThreshold: number } {
  return {
    remaining: apiQuotaRemaining,
    checkedAt: apiQuotaCheckedAt,
    lowThreshold: QUOTA_LOW_THRESHOLD,
  };
}
