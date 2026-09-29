import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return NextResponse.json({
    providers: {
      oddsApi: Boolean(process.env.ODDS_API_KEY),
      apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
      sportmonks: Boolean(
        process.env.SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_KEY
      ),
    },
    ml: {
      serviceUrlConfigured: Boolean(process.env.ML_SERVICE_URL),
      modelMode: process.env.ML_MODEL_MODE || "baseline",
    },
    guidance: {
      licensedHistoricalContext: "Sportmonks",
      licensedHistoricalOdds: "The Odds API",
      defaultHistoricalOddsExecution: "dry-run",
    },
  });
}
