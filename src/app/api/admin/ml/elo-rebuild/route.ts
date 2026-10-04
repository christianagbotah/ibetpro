import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import { rebuildLeagueEloSnapshots } from "@/lib/prediction/elo-snapshots";

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
    const sport = String(body?.sport || "football").trim();
    const league = String(body?.league || "").trim();

    if (!league) {
      return NextResponse.json(
        { error: "League is required" },
        { status: 400 }
      );
    }

    const result = await rebuildLeagueEloSnapshots(sport, league);
    return NextResponse.json(result);
  } catch (error) {
    console.error("ELO snapshot rebuild failed:", error);
    return NextResponse.json(
      { error: "ELO snapshot rebuild failed" },
      { status: 500 }
    );
  }
}
