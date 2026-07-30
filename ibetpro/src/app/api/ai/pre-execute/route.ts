import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { runPreExecutionAnalysis } from "@/lib/pre-execution";

/**
 * POST /api/ai/pre-execute
 * Runs comprehensive pre-execution analysis right before a bet is placed
 * Returns a go/no-go decision with full reasoning
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Rate limit
    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.ai);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const body = await request.json();
    const { matchId, selection, stake, bettingAccountId } = body;

    if (!matchId || !selection || !stake || !bettingAccountId) {
      return NextResponse.json(
        { error: "matchId, selection, stake, and bettingAccountId are required" },
        { status: 400 }
      );
    }

    const result = await runPreExecutionAnalysis(
      user.id,
      matchId,
      selection,
      parseFloat(stake),
      bettingAccountId
    );

    return NextResponse.json(result, {
      headers: rateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error("Pre-execution analysis error:", error);
    return NextResponse.json(
      { error: "Pre-execution analysis failed" },
      { status: 500 }
    );
  }
}
