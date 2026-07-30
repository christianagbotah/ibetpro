import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import {
  authenticateBroker,
  getBrokerPlatform,
  validateBrokerSession,
  BROKER_PLATFORMS,
} from "@/lib/broker-integration";

/**
 * Broker Connect API
 * POST /api/broker/connect - Connect a broker account
 * GET /api/broker/connect - Get available broker platforms and connection status
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { platformId, credentials, region, accountName } = body;

    if (!platformId) {
      return NextResponse.json({ error: "Platform ID required" }, { status: 400 });
    }

    const platform = getBrokerPlatform(platformId);
    if (!platform) {
      return NextResponse.json({ error: `Unknown platform: ${platformId}` }, { status: 400 });
    }

    // Authenticate with the broker
    const authResult = await authenticateBroker(platformId, credentials || {});

    if (!authResult.success) {
      return NextResponse.json({
        error: authResult.error || "Authentication failed",
        platform: platformId,
      }, { status: 401 });
    }

    // Create or update the betting account with broker connection
    const existingAccount = await prisma.bettingAccount.findFirst({
      where: {
        userId,
        platform: platformId,
        brokerUserId: authResult.brokerUserId || undefined,
      },
    });

    let account;
    if (existingAccount) {
      // Update existing account
      account = await prisma.bettingAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          sessionToken: authResult.sessionToken,
          sessionExpiry: authResult.sessionExpiry,
          isConnected: true,
          brokerType: platform.authType,
          brokerRegion: region || platform.regions[0],
          brokerUserId: authResult.brokerUserId,
          accountName: accountName || `${platform.name} Account`,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      // Create new account
      account = await prisma.bettingAccount.create({
        data: {
          userId,
          platform: platformId,
          accountId: `${platformId}_${authResult.brokerUserId || Date.now()}`,
          accountName: accountName || `${platform.name} Account`,
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          sessionToken: authResult.sessionToken,
          sessionExpiry: authResult.sessionExpiry,
          isConnected: true,
          brokerType: platform.authType,
          brokerRegion: region || platform.regions[0],
          brokerUserId: authResult.brokerUserId,
          lastSyncedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        platform: account.platform,
        accountName: account.accountName,
        isConnected: account.isConnected,
        brokerType: account.brokerType,
        brokerRegion: account.brokerRegion,
        allocatedAmount: account.allocatedAmount,
        balance: account.balance,
        sessionExpiry: account.sessionExpiry,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker connect error:", error);
    return NextResponse.json({ error: "Failed to connect broker" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();

    // Get user's connected accounts
    const accounts = await prisma.bettingAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Check session validity for each account
    const accountsWithStatus = accounts.map((account) => {
      const session = validateBrokerSession(account.sessionToken, account.sessionExpiry);
      const platform = getBrokerPlatform(account.platform);

      return {
        id: account.id,
        platform: account.platform,
        platformName: platform?.name || account.platform,
        accountName: account.accountName,
        isConnected: account.isConnected,
        sessionValid: session.isValid,
        needsRefresh: session.needsRefresh,
        sessionExpiry: account.sessionExpiry,
        brokerType: account.brokerType,
        brokerRegion: account.brokerRegion,
        balance: account.balance,
        allocatedAmount: account.allocatedAmount,
        allocationLock: account.allocationLock,
        totalBrokerBets: account.totalBrokerBets,
        totalBrokerProfit: account.totalBrokerProfit,
        lastBetPlacedAt: account.lastBetPlacedAt,
        features: platform?.features || null,
      };
    });

    // Available platforms
    const availablePlatforms = BROKER_PLATFORMS.map((p) => ({
      id: p.id,
      name: p.name,
      regions: p.regions,
      authType: p.authType,
      supportedSports: p.supportedSports,
      features: p.features,
    }));

    return NextResponse.json({
      accounts: accountsWithStatus,
      availablePlatforms,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker status error:", error);
    return NextResponse.json({ error: "Failed to fetch broker status" }, { status: 500 });
  }
}
