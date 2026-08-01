// ============================================================================
// iBetPro Track Tip API
// POST - Mark a tip as tracked ("I'm betting this") or untrack
// PATCH - Report user result (won/lost/void) + stake + profit
// ============================================================================

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/tips/track
 * Toggle tip tracking. Body: { tipId, tracked: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { tipId, tracked } = await request.json();

    if (!tipId) {
      return NextResponse.json({ error: "Tip ID is required" }, { status: 400 });
    }

    const tip = await prisma.tip.findUnique({
      where: { id: tipId },
    });

    if (!tip || tip.userId !== user.id) {
      return NextResponse.json({ error: "Tip not found" }, { status: 404 });
    }

    const updated = await prisma.tip.update({
      where: { id: tipId },
      data: { tracked: tracked !== false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error tracking tip:", error);
    return NextResponse.json({ error: "Failed to track tip" }, { status: 500 });
  }
}

/**
 * PATCH /api/tips/track
 * Report user result for a tracked tip.
 * Body: { tipId, userResult: "won"|"lost"|"void", userStake?: number, userProfit?: number }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { tipId, userResult, userStake, userProfit } = await request.json();

    if (!tipId || !userResult) {
      return NextResponse.json({ error: "Tip ID and user result are required" }, { status: 400 });
    }

    if (!["won", "lost", "void"].includes(userResult)) {
      return NextResponse.json({ error: "userResult must be 'won', 'lost', or 'void'" }, { status: 400 });
    }

    const tip = await prisma.tip.findUnique({
      where: { id: tipId },
    });

    if (!tip || tip.userId !== user.id) {
      return NextResponse.json({ error: "Tip not found" }, { status: 404 });
    }

    const updated = await prisma.tip.update({
      where: { id: tipId },
      data: {
        userResult,
        userStake: userStake ?? null,
        userProfit: userProfit ?? null,
        userResultAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error reporting tip result:", error);
    return NextResponse.json({ error: "Failed to report tip result" }, { status: 500 });
  }
}
