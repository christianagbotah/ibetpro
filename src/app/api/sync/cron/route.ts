// ============================================================================
// iBetPro Cron Sync Endpoint
// GET /api/sync/cron - Auto-sync match data (called by VPS cron or bot engine)
// Protected by a CRON_SECRET to prevent unauthorized access
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { syncMatchData } from "@/lib/sync-service";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(request: NextRequest) {
  // Verify cron secret (if configured)
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "") || "";
    if (providedSecret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncMatchData(false);

    return NextResponse.json({
      success: true,
      matchesSynced: result.matchesSynced,
      matchesUpdated: result.matchesUpdated,
      source: result.source,
      durationMs: result.durationMs,
      skipped: result.skipped,
      skipReason: result.skipReason,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CronSync] Error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST - Force sync (ignores throttle)
export async function POST(request: NextRequest) {
  // Verify cron secret (if configured)
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "") || "";
    if (providedSecret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncMatchData(true);

    return NextResponse.json({
      success: true,
      matchesSynced: result.matchesSynced,
      matchesUpdated: result.matchesUpdated,
      source: result.source,
      durationMs: result.durationMs,
      skipped: result.skipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CronSync] Force sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
