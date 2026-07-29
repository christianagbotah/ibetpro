import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { analyzeMatch } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    const match = await db.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Get team stats
    const homeTeamStats = await db.teamStats.findFirst({
      where: {
        teamName: match.homeTeam,
        sport: match.sport,
      },
    });

    const awayTeamStats = await db.teamStats.findFirst({
      where: {
        teamName: match.awayTeam,
        sport: match.sport,
      },
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

    // Update match with AI analysis
    await db.match.update({
      where: { id: matchId },
      data: {
        aiHomeWinProb: prediction.homeWinProb,
        aiDrawProb: prediction.drawProb,
        aiAwayWinProb: prediction.awayWinProb,
        aiConfidence: prediction.confidence,
        aiRecommended: prediction.recommended,
        aiAnalysis: prediction.analysis,
      },
    });

    return NextResponse.json({
      matchId,
      prediction,
      homeTeamStats,
      awayTeamStats,
    });
  } catch (error) {
    console.error("Error analyzing match:", error);
    return NextResponse.json({ error: "Failed to analyze match" }, { status: 500 });
  }
}
