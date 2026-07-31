import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { validateInput, syncSchema } from "@/lib/validation";
import {
  fetchOddsApiUpcoming,
  convertOddsApiToMatch,
  fetchApiFootballFixtures,
  fetchApiFootballLiveFixtures,
  checkApiHealth,
} from "@/lib/external-apis";
import { config, getPrimaryDataSource } from "@/lib/config";
import { generateDemoMatches } from "@/lib/demo-data";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateInput(syncSchema, body);
    if (!validation.success) return validation.error;

    const { source } = validation.data;

    let matchesSynced = 0;
    let teamStatsSynced = 0;
    const errors: string[] = [];

    // If no API keys configured, use demo data
    const dataSource = getPrimaryDataSource();
    if (dataSource === "none") {
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

      return NextResponse.json({
        success: true,
        matchesSynced,
        teamStatsSynced,
        source: "demo",
        demo: true,
        message: "Demo data loaded. Configure API keys (ODDS_API_KEY, API_FOOTBALL_KEY) for real live data.",
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Real API sync
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

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const health = await checkApiHealth();
    const adminSettings = await prisma.adminSettings.findFirst();
    const dataSource = getPrimaryDataSource();

    return NextResponse.json({
      health,
      lastSynced: adminSettings?.updatedAt || null,
      apiKeysConfigured: {
        oddsApi: !!config.api.oddsApiKey,
        apiFootball: !!config.api.apiFootballKey,
        sportmonks: !!config.api.sportmonksToken,
      },
      dataSource,
      demoMode: dataSource === "none",
      demoMessage: dataSource === "none"
        ? "Running in demo mode. Add ODDS_API_KEY or API_FOOTBALL_KEY to .env for real live data."
        : null,
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}

async function syncOddsApiData(): Promise<number> {
  if (!config.api.oddsApiKey) {
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
  if (!config.api.apiFootballKey) {
    throw new Error("API-Football key not configured");
  }

  let matchesSynced = 0;

  const leagues = [39, 135, 140, 61];
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
            homeOdds: 2.0,
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

  return { matches: matchesSynced, teamStats: 0 };
}
