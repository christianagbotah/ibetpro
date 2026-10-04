import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { analyzeMatch, generateDetailedAnalysis } from "@/lib/ai-engine";
import { getAuthUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.homeOdds <= 1 || match.awayOdds <= 1) {
      return NextResponse.json({
        matchId,
        detailedAnalysis: null,
        warning: "Detailed bookmaker analysis will be available after market odds are enriched.",
      });
    }

    // Get team stats
    const homeTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.homeTeam, sport: match.sport },
    });

    const awayTeamStats = await prisma.teamStats.findFirst({
      where: { teamName: match.awayTeam, sport: match.sport },
    });

    // Run AI analysis
    const prediction = analyzeMatch(
      {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds ?? undefined,
        awayOdds: match.awayOdds,
        status: match.status,
      },
      homeTeamStats,
      awayTeamStats
    );

    // Generate detailed analysis
    const detailedAnalysis = generateDetailedAnalysis(
      {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds ?? undefined,
        awayOdds: match.awayOdds,
        status: match.status,
      },
      homeTeamStats,
      awayTeamStats,
      prediction
    );

    return NextResponse.json({
      matchId,
      detailedAnalysis,
    });
  } catch (error) {
    console.error("Error generating detailed analysis:", error);
    return NextResponse.json({ error: "Failed to generate detailed analysis" }, { status: 500 });
  }
}
