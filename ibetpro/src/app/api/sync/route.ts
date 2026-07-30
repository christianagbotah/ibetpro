import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import {
  fetchOddsApiUpcoming,
  convertOddsApiToMatch,
  fetchApiFootballFixtures,
  fetchApiFootballLiveFixtures,
  fetchApiFootballTeamStats,
  checkApiHealth,
  syncFromBestSource,
} from "@/lib/external-apis";
import { config } from "@/lib/config";

// POST /api/sync - Sync data from external APIs
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { source } = body; // "odds-api", "api-football", "auto"

    let matchesSynced = 0;
    let teamStatsSynced = 0;
    const errors: string[] = [];

    if (source === "odds-api" || source === "auto") {
      try {
        matchesSynced += await syncOddsApiData();
      } catch (error) {
        errors.push(`Odds API: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (source === "api-football" || source === "auto") {
      try {
        const result = await syncApiFootballData();
        matchesSynced += result.matches;
        teamStatsSynced += result.teamStats;
      } catch (error) {
        errors.push(`API-Football: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Update last synced time
    await prisma.adminSettings.updateMany({
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      matchesSynced,
      teamStatsSynced,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

// GET /api/sync - Get sync status and API health
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const health = await checkApiHealth();
    const adminSettings = await prisma.adminSettings.findFirst();

    return NextResponse.json({
      health,
      lastSynced: adminSettings?.updatedAt || null,
      apiKeysConfigured: {
        oddsApi: !!config.apis.oddsApiKey,
        apiFootball: !!config.apis.apiFootballKey,
        sportmonks: !!config.apis.sportmonksToken,
      },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}

// ==================== SYNC HELPERS ====================

async function syncOddsApiData(): Promise<number> {
  if (!config.apis.oddsApiKey) {
    throw new Error("The Odds API key not configured");
  }

  const popularSports = [
    "soccer_epl",
    "soccer_germany_bundesliga",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "basketball_nba",
  ];

  let totalSynced = 0;

  for (const sport of popularSports) {
    try {
      const odds = await fetchOddsApiUpcoming(sport);

      for (const matchOdds of odds) {
        const matchData = convertOddsApiToMatch(matchOdds);

        // Upsert match
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

        totalSynced++;
      }
    } catch (error) {
      console.error(`Failed to sync ${sport}:`, error);
    }
  }

  return totalSynced;
}

async function syncApiFootballData(): Promise<{ matches: number; teamStats: number }> {
  if (!config.apis.apiFootballKey) {
    throw new Error("API-Football key not configured");
  }

  let matchesSynced = 0;
  let teamStatsSynced = 0;

  // Sync fixtures
  const leagues = [39, 135, 140, 61]; // EPL, Serie A, La Liga, Ligue 1
  for (const league of leagues) {
    try {
      const fixtures = await fetchApiFootballFixtures(league, 2024);

      for (const fixture of fixtures) {
        await prisma.match.upsert({
          where: { externalId: `af-${fixture.fixtureId}` },
          update: {
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore,
            minute: fixture.minute,
            status: fixture.status,
            lastSyncedAt: new Date(),
          },
          create: {
            externalId: `af-${fixture.fixtureId}`,
            sport: "football",
            league: fixture.league,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            homeOdds: 2.0, // Default odds, will be updated
            awayOdds: 2.0,
            commenceTime: new Date(fixture.commenceTime),
            status: fixture.status,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore,
            minute: fixture.minute,
            apiSource: "api-football",
            lastSyncedAt: new Date(),
          },
        });

        matchesSynced++;
      }
    } catch (error) {
      console.error(`Failed to sync league ${league}:`, error);
    }
  }

  // Sync live fixtures
  try {
    const liveFixtures = await fetchApiFootballLiveFixtures();
    for (const fixture of liveFixtures) {
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

      matchesSynced++;
    }
  } catch (error) {
    console.error("Failed to sync live fixtures:", error);
  }

  return { matches: matchesSynced, teamStats: teamStatsSynced };
}
