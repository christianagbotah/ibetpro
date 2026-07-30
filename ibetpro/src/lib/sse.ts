// ============================================================================
// iBetPro Real-Time SSE (Server-Sent Events) Stream
// Provides live match updates, bet status changes, and cashout alerts
// ============================================================================

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export interface SSEEvent {
  event: string;
  data: unknown;
  id?: string;
  timestamp: number;
}

type SSEListener = (event: SSEEvent) => void;

// In-memory connection manager for SSE
const connections = new Map<string, Set<SSEListener>>();

function getConnections(userId: string): Set<SSEListener> {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  return connections.get(userId)!;
}

/**
 * Subscribe a user to real-time events
 */
export function subscribe(userId: string, listener: SSEListener): () => void {
  const userConns = getConnections(userId);
  userConns.add(listener);
  return () => {
    userConns.delete(listener);
    if (userConns.size === 0) {
      connections.delete(userId);
    }
  };
}

/**
 * Broadcast an event to all connections for a user
 */
export function broadcastToUser(userId: string, event: SSEEvent): void {
  const userConns = getConnections(userId);
  userConns.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Connection might be closed
      userConns.delete(listener);
    }
  });
}

/**
 * Broadcast an event to all connected users
 */
export function broadcastToAll(event: SSEEvent): void {
  for (const [userId] of connections) {
    broadcastToUser(userId, event);
  }
}

// ==================== EVENT TYPES ====================

export const SSE_EVENTS = {
  MATCH_UPDATE: "match_update",
  MATCH_LIVE: "match_live",
  MATCH_FINISHED: "match_finished",
  BET_PLACED: "bet_placed",
  BET_WON: "bet_won",
  BET_LOST: "bet_lost",
  BET_CASHOUT_AVAILABLE: "cashout_available",
  BET_CASHOUT_URGENT: "cashout_urgent",
  ODDS_CHANGE: "odds_change",
  AI_PREDICTION: "ai_prediction",
  BALANCE_UPDATE: "balance_update",
  SYNC_COMPLETE: "sync_complete",
} as const;

/**
 * Notify a user about a match update
 */
export function notifyMatchUpdate(userId: string, match: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  homeOdds: number;
  awayOdds: number;
}) {
  broadcastToUser(userId, {
    event: match.status === "live" ? SSE_EVENTS.MATCH_LIVE :
           match.status === "finished" ? SSE_EVENTS.MATCH_FINISHED :
           SSE_EVENTS.MATCH_UPDATE,
    data: match,
    id: `match-${match.id}-${Date.now()}`,
    timestamp: Date.now(),
  });
}

/**
 * Notify a user about a cashout opportunity
 */
export function notifyCashoutOpportunity(
  userId: string,
  betId: string,
  cashoutAmount: number,
  urgency: "low" | "medium" | "high",
  reasoning: string
) {
  broadcastToUser(userId, {
    event: urgency === "high" ? SSE_EVENTS.BET_CASHOUT_URGENT : SSE_EVENTS.BET_CASHOUT_AVAILABLE,
    data: { betId, cashoutAmount, urgency, reasoning },
    id: `cashout-${betId}-${Date.now()}`,
    timestamp: Date.now(),
  });
}

/**
 * Notify a user about odds change
 */
export function notifyOddsChange(
  userId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  oldOdds: { home: number; away: number },
  newOdds: { home: number; away: number }
) {
  broadcastToUser(userId, {
    event: SSE_EVENTS.ODDS_CHANGE,
    data: { matchId, homeTeam, awayTeam, oldOdds, newOdds },
    id: `odds-${matchId}-${Date.now()}`,
    timestamp: Date.now(),
  });
}

/**
 * Notify a user about balance update
 */
export function notifyBalanceUpdate(userId: string, balance: number, change: number, reason: string) {
  broadcastToUser(userId, {
    event: SSE_EVENTS.BALANCE_UPDATE,
    data: { balance, change, reason },
    id: `balance-${userId}-${Date.now()}`,
    timestamp: Date.now(),
  });
}

/**
 * Poll live matches and push updates to connected users
 * Called by the sync/cron system
 */
export async function pollAndPushLiveUpdates(): Promise<void> {
  try {
    const liveMatches = await prisma.match.findMany({
      where: { status: "live" },
    });

    // Get all users with active bets on live matches
    const usersWithLiveBets = await prisma.user.findMany({
      where: {
        bets: {
          some: {
            match: { status: "live" },
            status: "pending",
          },
        },
      },
      select: { id: true },
    });

    for (const user of usersWithLiveBets) {
      for (const match of liveMatches) {
        notifyMatchUpdate(user.id, {
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: match.minute,
          homeOdds: match.homeOdds,
          awayOdds: match.awayOdds,
        });
      }
    }
  } catch (error) {
    console.error("Error polling live updates:", error);
  }
}
