// ============================================================================
// iBetPro Notifications API
// Returns recent notifications for the authenticated user
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const notifications: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      timestamp: string;
      read: boolean;
      link?: string;
    }> = [];

    const wonBets = await prisma.bet.findMany({
      where: { userId: user.id, status: "won" },
      include: { match: true },
      orderBy: { settledAt: "desc" },
      take: 5,
    });

    for (const bet of wonBets) {
      notifications.push({
        id: `won-${bet.id}`,
        type: "success",
        title: "Bet Won!",
        message: `${bet.match.homeTeam} vs ${bet.match.awayTeam} - ${bet.selection} won! Profit: $${(bet.profit || 0).toFixed(2)}`,
        timestamp: (bet.settledAt || bet.placedAt).toISOString(),
        read: false,
        link: "/history",
      });
    }

    const lostBets = await prisma.bet.findMany({
      where: { userId: user.id, status: "lost" },
      include: { match: true },
      orderBy: { settledAt: "desc" },
      take: 3,
    });

    for (const bet of lostBets) {
      notifications.push({
        id: `lost-${bet.id}`,
        type: "warning",
        title: "Bet Lost",
        message: `${bet.match.homeTeam} vs ${bet.match.awayTeam} - ${bet.selection} lost. -$${bet.stake.toFixed(2)}`,
        timestamp: (bet.settledAt || bet.placedAt).toISOString(),
        read: false,
        link: "/history",
      });
    }

    const autoBets = await prisma.bet.findMany({
      where: { userId: user.id, isAutoPlaced: true, status: "pending" },
      include: { match: true },
      orderBy: { placedAt: "desc" },
      take: 3,
    });

    for (const bet of autoBets) {
      notifications.push({
        id: `auto-${bet.id}`,
        type: "info",
        title: "Auto-Bet Placed",
        message: `AI placed ${bet.selection} on ${bet.match.homeTeam} vs ${bet.match.awayTeam} @ ${bet.odds}`,
        timestamp: bet.placedAt.toISOString(),
        read: false,
        link: "/betting",
      });
    }

    const cashoutBets = await prisma.bet.findMany({
      where: {
        userId: user.id,
        status: "pending",
        cashoutAmount: { not: null },
      },
      include: { match: true },
      orderBy: { placedAt: "desc" },
      take: 3,
    });

    for (const bet of cashoutBets) {
      if (bet.cashoutAmount) {
        notifications.push({
          id: `cashout-${bet.id}`,
          type: "cashout",
          title: "Cashout Available",
          message: `${bet.match.homeTeam} vs ${bet.match.awayTeam} - Cashout $${bet.cashoutAmount.toFixed(2)} available`,
          timestamp: bet.placedAt.toISOString(),
          read: false,
          link: "/monitor",
        });
      }
    }

    notifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ notifications, unreadCount: notifications.length });
  } catch (error) {
    console.error("Notifications error:", error);
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}
