import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { config, getPrimaryDataSource } from "@/lib/config";
import { generateDemoMatches, updateLiveDemoMatches } from "@/lib/demo-data";

// Cache demo matches in memory for the session (refreshed periodically)
let cachedDemoMatches: Array<Record<string, unknown>> | null = null;
let lastDemoRefresh = 0;
const DEMO_REFRESH_INTERVAL = 60000; // 1 minute

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport");
    const status = searchParams.get("status");
    const id = searchParams.get("id");

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

    const where: Record<string, unknown> = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;

    // Try to get matches from database first
    const dbMatches = await prisma.match.findMany({
      where,
      include: { bets: true },
      orderBy: { commenceTime: "asc" },
    });

    // If we have real data from API sync, use it
    const dataSource = getPrimaryDataSource();
    if (dataSource !== "none" && dbMatches.length > 0) {
      return NextResponse.json(dbMatches);
    }

    // If no API keys configured and no DB matches, use smart demo data
    if (dataSource === "none") {
      const now = Date.now();

      // Refresh demo data periodically
      if (!cachedDemoMatches || now - lastDemoRefresh > DEMO_REFRESH_INTERVAL) {
        const demoMatches = generateDemoMatches();

        // Update live matches for realistic progression
        const updatedMatches = updateLiveDemoMatches(
          demoMatches.map((m) => ({
            ...m,
            minute: m.minute as number | null,
          }))
        );

        // Seed demo matches into the database for persistence
        for (const match of updatedMatches) {
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
          } catch (err) {
            console.error("Failed to upsert demo match:", err);
          }
        }

        // Re-fetch from DB with proper relations
        cachedDemoMatches = await prisma.match.findMany({
          where,
          include: { bets: true },
          orderBy: { commenceTime: "asc" },
        });
        lastDemoRefresh = now;
      }

      // Apply filters
      let filtered = cachedDemoMatches || [];
      if (sport) {
        filtered = filtered.filter((m: Record<string, unknown>) => m.sport === sport);
      }
      if (status) {
        filtered = filtered.filter((m: Record<string, unknown>) => m.status === status);
      }

      return NextResponse.json(filtered, {
        headers: { "X-Data-Source": "demo" },
      });
    }

    return NextResponse.json(dbMatches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}
