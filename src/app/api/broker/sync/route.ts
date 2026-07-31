import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { fetchBrokerBalance, validateBrokerSession, refreshBrokerSession } from "@/lib/broker-integration";

/**
 * Broker Sync API
 * POST /api/broker/sync - Sync broker account balance and session
 * GET /api/broker/sync - Get sync status for all broker accounts
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { bettingAccountId } = body;

    if (!bettingAccountId) {
      return NextResponse.json({ error: "Betting account ID required" }, { status: 400 });
    }

    const account = await prisma.bettingAccount.findFirst({
      where: { id: bettingAccountId, userId },
    });

    if (!account) {
      return NextResponse.json({ error: "Betting account not found" }, { status: 404 });
    }

    if (!account.isConnected) {
      return NextResponse.json({ error: "Account is not connected" }, { status: 400 });
    }

    // Check session validity
    const session = validateBrokerSession(account.sessionToken, account.sessionExpiry);

    let accessToken = account.accessToken;

    // Refresh session if needed
    if (session.needsRefresh && account.refreshToken) {
      const refreshResult = await refreshBrokerSession(account.platform, account.refreshToken);
      if (refreshResult.success) {
        accessToken = refreshResult.accessToken || accessToken;
        await prisma.bettingAccount.update({
          where: { id: bettingAccountId },
          data: {
            accessToken: refreshResult.accessToken,
            refreshToken: refreshResult.refreshToken,
            sessionExpiry: refreshResult.sessionExpiry,
          },
        });
      }
    }

    // Fetch current balance from broker
    const balance = await fetchBrokerBalance(account.platform, accessToken || "");

    // Update the account
    const updatedAccount = await prisma.bettingAccount.update({
      where: { id: bettingAccountId },
      data: {
        balance: balance.total,
        lastSyncedAt: new Date(),
      },
    });

    // Get active bets for this account
    const activeBets = await prisma.bet.findMany({
      where: {
        userId,
        bettingAccountId,
        status: { in: ["pending", "partial_cashout"] },
      },
      include: { match: true },
    });

    const activeBetStake = activeBets.reduce((sum, b) => sum + b.stake, 0);

    return NextResponse.json({
      success: true,
      account: {
        id: updatedAccount.id,
        platform: updatedAccount.platform,
        balance: updatedAccount.balance,
        allocatedAmount: updatedAccount.allocatedAmount,
        sessionValid: session.isValid || !session.needsRefresh,
        lastSyncedAt: updatedAccount.lastSyncedAt,
      },
      balance: {
        available: balance.available,
        locked: balance.locked,
        total: balance.total,
        currency: balance.currency,
      },
      activeBets: {
        count: activeBets.length,
        totalStake: activeBetStake,
        bets: activeBets.map((b) => ({
          id: b.id,
          match: b.match ? `${b.match.homeTeam} vs ${b.match.awayTeam}` : "Unknown",
          selection: b.selection,
          odds: b.odds,
          stake: b.stake,
          status: b.status,
          isAutoPlaced: b.isAutoPlaced,
        })),
      },
      availableForAllocation: Math.max(0, balance.total - activeBetStake),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker sync error:", error);
    return NextResponse.json({ error: "Failed to sync broker account" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const accounts = await prisma.bettingAccount.findMany({
      where: { userId, isConnected: true },
    });

    const syncStatuses = accounts.map((account) => {
      const session = validateBrokerSession(account.sessionToken, account.sessionExpiry);
      return {
        id: account.id,
        platform: account.platform,
        accountName: account.accountName,
        balance: account.balance,
        allocatedAmount: account.allocatedAmount,
        sessionValid: session.isValid,
        needsRefresh: session.needsRefresh,
        sessionExpiry: account.sessionExpiry,
        lastSyncedAt: account.lastSyncedAt,
        lastBetPlacedAt: account.lastBetPlacedAt,
        totalBrokerBets: account.totalBrokerBets,
        totalBrokerProfit: account.totalBrokerProfit,
      };
    });

    return NextResponse.json({
      accounts: syncStatuses,
      totalAccounts: accounts.length,
      connectedAccounts: accounts.filter((a) => a.isConnected).length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Sync status error:", error);
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
