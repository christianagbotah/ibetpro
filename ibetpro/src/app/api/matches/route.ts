import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { fetchMultiSportOdds, transformOddsApiMatch, fetchLiveMatches, transformFootballMatch, SPORT_KEYS } from "@/lib/external-apis";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport");
    const status = searchParams.get("status");
    const id = searchParams.get("id");
    const refresh = searchParams.get("refresh") === "true";

    // If a specific match ID is requested, return that single match
    if (id) {
      const match = await prisma.match.findUnique({
        where: { id },
        include: { bets: true },
      });

      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

      return NextResponse.json(match);
    }

    // Try to sync live data from external APIs (non-blocking)
    if (refresh || status === "live") {
      syncExternalData(sport || undefined).catch(() => {
        // Silently fail - we'll still return DB data
      });
    }

    // Fetch matches from database (which may have been synced from APIs)
    const where: Record<string, unknown> = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;

    const matches = await prisma.match.findMany({
      where,
      include: {
        bets: true,
      },
      orderBy: {
        commenceTime: "asc",
      },
    });

    // If no matches in DB and no sport filter, try to fetch from external APIs
    if (matches.length === 0 && !sport) {
      const externalMatches = await syncExternalData();
      return NextResponse.json(externalMatches);
    }

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}

/**
 * Sync data from external APIs into the database
 * Returns the matches that were synced
 */
async function syncExternalData(sport?: string): Promise<unknown[]> {
  const syncedMatches: unknown[] = [];

  try {
    // Determine which sports to fetch
    const sportsToFetch = sport && SPORT_KEYS[sport]
      ? SPORT_KEYS[sport]
      : Object.values(SPORT_KEYS).flat().slice(0, 3); // Limit to 3 sports by default

    // Fetch odds from The Odds API
    const oddsMatches = await fetchMultiSportOdds(sportsToFetch as string[]);

    for (const oddsMatch of oddsMatches) {
      try {
        const transformed = transformOddsApiMatch(oddsMatch);

        // Upsert match into database
        const match = await prisma.match.upsert({
          where: { externalId: oddsMatch.id },
          update: {
            homeOdds: transformed.homeOdds,
            drawOdds: transformed.drawOdds,
            awayOdds: transformed.awayOdds,
            overUnderLine: transformed.overUnderLine,
            overOdds: transformed.overOdds,
            underOdds: transformed.underOdds,
            lastSyncedAt: new Date(),
            apiSource: "odds_api",
          },
          create: {
            externalId: oddsMatch.id,
            sport: transformed.sport,
            league: transformed.league,
            homeTeam: transformed.homeTeam,
            awayTeam: transformed.awayTeam,
            homeOdds: transformed.homeOdds,
            drawOdds: transformed.drawOdds,
            awayOdds: transformed.awayOdds,
            overUnderLine: transformed.overUnderLine,
            overOdds: transformed.overOdds,
            underOdds: transformed.underOdds,
            commenceTime: new Date(transformed.commenceTime),
            status: "upcoming",
            apiSource: "odds_api",
            lastSyncedAt: new Date(),
          },
          include: { bets: true },
        });

        syncedMatches.push(match);
      } catch {
        // Skip individual match errors
      }
    }

    // Fetch live matches from API-Football
    const liveMatches = await fetchLiveMatches();
    for (const liveMatch of liveMatches) {
      try {
        const transformed = transformFootballMatch(liveMatch);
        const externalId = `football_${liveMatch.fixture.id}`;

        const match = await prisma.match.upsert({
          where: { externalId },
          update: {
            homeScore: transformed.homeScore,
            awayScore: transformed.awayScore,
            minute: transformed.minute,
            status: transformed.status,
            lastSyncedAt: new Date(),
          },
          create: {
            externalId,
            sport: transformed.sport,
            league: transformed.league,
            homeTeam: transformed.homeTeam,
            awayTeam: transformed.awayTeam,
            commenceTime: new Date(transformed.commenceTime),
            homeScore: transformed.homeScore,
            awayScore: transformed.awayScore,
            minute: transformed.minute,
            status: transformed.status,
            apiSource: "api_football",
            lastSyncedAt: new Date(),
            homeOdds: 2.0,
            awayOdds: 2.0,
          },
          include: { bets: true },
        });

        syncedMatches.push(match);
      } catch {
        // Skip individual match errors
      }
    }
  } catch (error) {
    console.error("Error syncing external data:", error);
  }

  return syncedMatches;
}
