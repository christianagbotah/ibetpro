import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { syncPlatformAccount } from "@/lib/betting-platforms";

/**
 * POST /api/accounts/sync - Sync balance from a connected betting platform
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId } = body as { accountId?: string };

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    // Fetch the account
    const account = await prisma.bettingAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!account.isConnected || !account.accessToken) {
      return NextResponse.json({ error: "Account is not connected — connect first" }, { status: 400 });
    }

    // Sync balance from the platform
    const syncResult = await syncPlatformAccount(account.platform, account.accessToken);

    // Update the account in the database
    const updated = await prisma.bettingAccount.update({
      where: { id: accountId },
      data: {
        balance: syncResult.balance,
        currency: syncResult.currency,
        lastSyncedAt: syncResult.lastSyncedAt,
      },
    });

    return NextResponse.json({
      success: true,
      account: updated,
      syncResult,
    });
  } catch (error) {
    console.error("Error syncing account:", error);
    return NextResponse.json({ error: "Failed to sync account" }, { status: 500 });
  }
}
