import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import { buildPredictionPerformanceScorecard } from "@/lib/prediction/performance-scorecard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

    const daysRaw = Number(request.nextUrl.searchParams.get("days") || 30);
    const days = Number.isFinite(daysRaw)
      ? Math.min(3650, Math.max(1, Math.floor(daysRaw)))
      : 30;
    const modelVersion =
      request.nextUrl.searchParams.get("modelVersion")?.trim() || undefined;

    const scorecard = await buildPredictionPerformanceScorecard({
      days,
      modelVersion,
    });

    return NextResponse.json(scorecard, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[ModelPerformance] Failed:", error);
    return NextResponse.json(
      {
        error: "Failed to build model performance scorecard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
