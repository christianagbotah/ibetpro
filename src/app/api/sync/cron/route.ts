// ============================================================================
// iBetPro Cron Sync Endpoint
// GET /api/sync/cron - Auto-sync match data (called by VPS cron or bot engine)
// Protected by a CRON_SECRET to prevent unauthorized access
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { syncMatchData } from "@/lib/sync-service";
import { captureTrainingFeatureSnapshots } from "@/lib/prediction/training-corpus";
import { settleAllFinishedBets } from "@/lib/settlement";
import { capturePredictionPerformanceEvidence } from "@/lib/prediction/performance-capture";

const CRON_SECRET = process.env.CRON_SECRET || "";

async function captureFirstPartySafely() {
  try {
    return {
      ok: true as const,
      result: await captureTrainingFeatureSnapshots(new Date()),
    };
  } catch (error) {
    console.error("[CronSync] First-party capture error:", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown capture error",
    };
  }
}

async function capturePredictionEvidenceSafely() {
  try {
    return {
      ok: true as const,
      result: await capturePredictionPerformanceEvidence(new Date()),
    };
  } catch (error) {
    console.error("[CronSync] Prediction evidence capture error:", error);
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unknown prediction evidence error",
    };
  }
}

async function settleFinishedBetsSafely() {
  try {
    const results = await settleAllFinishedBets();
    const settled = results.filter((result) => result.settled);
    return {
      ok: true as const,
      checked: results.length,
      settled: settled.length,
      skipped: results.length - settled.length,
      totalProfit: settled.reduce(
        (sum, result) => sum + (result.profit || 0),
        0
      ),
      totalCommission: settled.reduce(
        (sum, result) => sum + (result.commission || 0),
        0
      ),
    };
  } catch (error) {
    console.error("[CronSync] Bet settlement sweep error:", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown settlement error",
    };
  }
}

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
    const trainingCapture = await captureFirstPartySafely();
    const predictionEvidence = await capturePredictionEvidenceSafely();
    const betSettlement = await settleFinishedBetsSafely();

    return NextResponse.json({
      success: true,
      matchesSynced: result.matchesSynced,
      matchesUpdated: result.matchesUpdated,
      source: result.source,
      durationMs: result.durationMs,
      skipped: result.skipped,
      skipReason: result.skipReason,
      errors: result.errors.length > 0 ? result.errors : undefined,
      trainingCapture,
      predictionEvidence,
      betSettlement,
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
    const trainingCapture = await captureFirstPartySafely();
    const predictionEvidence = await capturePredictionEvidenceSafely();
    const betSettlement = await settleFinishedBetsSafely();

    return NextResponse.json({
      success: true,
      matchesSynced: result.matchesSynced,
      matchesUpdated: result.matchesUpdated,
      source: result.source,
      durationMs: result.durationMs,
      skipped: result.skipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
      trainingCapture,
      predictionEvidence,
      betSettlement,
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
