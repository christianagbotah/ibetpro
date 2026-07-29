import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;

    const matches = await db.match.findMany({
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
