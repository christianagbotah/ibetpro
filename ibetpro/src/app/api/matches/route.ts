import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

// GET /api/matches - List matches with optional filters
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("id");
    const sport = searchParams.get("sport");
    const status = searchParams.get("status");
    const league = searchParams.get("league");
    const limit = searchParams.get("limit");
    const refresh = searchParams.get("refresh");

    // If specific match ID requested
    if (matchId) {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { bets: true },
      });

      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

      return NextResponse.json(match);
    }

    // Build where clause
    const where: Record<string, unknown> = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;
    if (league) where.league = { contains: league, mode: "insensitive" };

    const matches = await prisma.match.findMany({
      where,
      orderBy: { commenceTime: "asc" },
      ...(limit ? { take: parseInt(limit, 10) } : { take: 50 }),
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}
