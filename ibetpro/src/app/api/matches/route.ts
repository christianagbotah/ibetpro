import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
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

    const matches = await prisma.match.findMany({
      where,
      include: {
        bets: true,
      },
      orderBy: {
        commenceTime: "asc",
      },
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}
