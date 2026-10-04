import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import { backfillFinishedFixtureStats } from "@/lib/football/fixture-stats-backfill";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requested = Number(body?.limit ?? 20);
    const limit = Number.isFinite(requested) ? requested : 20;

    const result = await backfillFinishedFixtureStats(limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Fixture-stat backfill failed:", error);
    return NextResponse.json(
      { error: "Fixture-stat backfill failed" },
      { status: 500 }
    );
  }
}
