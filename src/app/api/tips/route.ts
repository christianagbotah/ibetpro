// ============================================================================
// iBetPro Tips API - GET: list tips, POST: generate tips from AI analysis
// ============================================================================

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") || "all"; // all | pending | tracked | settled
    const sport = url.searchParams.get("sport") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const where: Record<string, unknown> = { userId: user.id };

    if (filter === "pending") {
      where.outcome = null;
    } else if (filter === "tracked") {
      where.tracked = true;
    } else if (filter === "settled") {
      where.outcome = { not: null };
    }

    if (sport) {
      where.sport = sport;
    }

    const [tips, stats] = await Promise.all([
      prisma.tip.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          match: {
            select: {
              status: true,
              homeScore: true,
              awayScore: true,
              commenceTime: true,
            },
          },
        },
      }),
      // Performance stats (AI outcome)
      prisma.tip.aggregate({
        where: { userId: user.id, outcome: { not: null } },
        _count: true,
        _sum: { profit: true },
      }),
    ]);

    // Tracked tips performance (user-reported)
    const trackedStats = await prisma.tip.aggregate({
      where: { userId: user.id, tracked: true, userResult: { not: null } },
      _count: true,
      _sum: { userProfit: true },
    });
    const trackedWon = await prisma.tip.count({
      where: { userId: user.id, tracked: true, userResult: "won" },
    });

    // Calculate win rate
    const wonCount = await prisma.tip.count({
      where: { userId: user.id, outcome: "won" },
    });
    const totalSettled = stats._count || 0;
    const winRate = totalSettled > 0 ? (wonCount / totalSettled) * 100 : 0;
    const totalProfit = stats._sum.profit || 0;
    const roi = totalSettled > 0 ? (totalProfit / totalSettled) * 100 : 0;

    // Tracked stats
    const trackedSettled = trackedStats._count || 0;
    const trackedWinRate = trackedSettled > 0 ? (trackedWon / trackedSettled) * 100 : 0;
    const trackedProfit = trackedStats._sum.userProfit || 0;

    return NextResponse.json({
      tips,
      performance: {
        totalSettled,
        won: wonCount,
        lost: totalSettled - wonCount,
        winRate: Math.round(winRate * 10) / 10,
        totalProfit: Math.round(totalProfit * 100) / 100,
        roi: Math.round(roi * 10) / 10,
        // User-reported tracked stats
        trackedSettled,
        trackedWon,
        trackedWinRate: Math.round(trackedWinRate * 10) / 10,
        trackedProfit: Math.round(trackedProfit * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Error fetching tips:", error);
    return NextResponse.json({ error: "Failed to fetch tips" }, { status: 500 });
  }
}
