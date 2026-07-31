import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import {
  getBrokerPlatform,
  validateBrokerSession,
  getAvailablePlatforms,
  getRegionCurrency,
} from "@/lib/broker-integration";
import {
  getBrokerAdapter,
} from "@/lib/broker-adapters";
import {
  REGIONS,
  getPlatformsForRegion,
  getContinents,
} from "@/lib/regions";
import { logBrokerEvent } from "@/lib/audit-log";

/**
 * Broker Connect API
 * POST /api/broker/connect - Connect a broker account
 * GET /api/broker/connect - Get available regions, platforms, and connection status
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { platformId, credentials, region, accountName } = body;

    if (!platformId) {
      return NextResponse.json({ error: "Platform ID required" }, { status: 400 });
    }

    if (!region) {
      return NextResponse.json({ error: "Region is required" }, { status: 400 });
    }

    const platform = getBrokerPlatform(platformId);
    if (!platform) {
      return NextResponse.json({ error: `Unknown platform: ${platformId}` }, { status: 400 });
    }

    // Verify platform is available in the user's region
    const platformsInRegion = getAvailablePlatforms(region);
    if (!platformsInRegion.find((p) => p.id === platformId)) {
      return NextResponse.json({
        error: `${platform.name} is not available in your region`,
      }, { status: 400 });
    }

    // Use the new adapter framework for authentication
    const adapter = getBrokerAdapter(platformId);
    if (!adapter) {
      return NextResponse.json({
        error: `No adapter available for platform: ${platformId}`,
      }, { status: 400 });
    }

    const authResult = await adapter.authenticate(credentials || {});

    if (!authResult.success) {
      // Log failed auth
      await logBrokerEvent({
        userId,
        action: "broker_auth_failed",
        brokerPlatform: platformId,
        status: "failed",
        error: authResult.error,
      });

      return NextResponse.json({
        error: authResult.error || "Authentication failed",
        platform: platformId,
      }, { status: 401 });
    }

    // Get currency for the region
    const currencyInfo = getRegionCurrency(region);

    // Update user's region and currency
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && (!user.region || user.region === "ng")) {
      await prisma.user.update({
        where: { id: userId },
        data: { region, currency: currencyInfo.code },
      });
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
      account = await prisma.bettingAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          sessionToken: authResult.sessionToken,
          sessionExpiry: authResult.sessionExpiry,
          isConnected: true,
          brokerType: platform.authType,
          brokerRegion: region,
          brokerUserId: authResult.brokerUserId,
          accountName: accountName || `${platform.name} Account`,
          currency: currencyInfo.code,
          lastSyncedAt: new Date(),
        },
      });
    } else {
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
          brokerRegion: region,
          brokerUserId: authResult.brokerUserId,
          currency: currencyInfo.code,
          lastSyncedAt: new Date(),
        },
      });
    }

    // Log successful connection
    await logBrokerEvent({
      userId,
      action: "broker_connected",
      brokerPlatform: platformId,
      brokerUserId: authResult.brokerUserId,
      status: "success",
      metadata: {
        region,
        authType: platform.authType,
        accountId: account.id,
      },
    });

    // Try to fetch real balance from the broker
    let balance = null;
    try {
      const brokerBalance = await adapter.getBalance(authResult.accessToken || "", region);
      // Update account balance in DB
      await prisma.bettingAccount.update({
        where: { id: account.id },
        data: { balance: brokerBalance.total },
      });
      balance = brokerBalance;
    } catch (error) {
      console.error("Failed to fetch broker balance:", error);
      // Non-fatal - connection succeeded, balance fetch failed
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
        currency: account.currency,
        allocatedAmount: account.allocatedAmount,
        balance: balance?.total ?? account.balance,
        sessionExpiry: account.sessionExpiry,
      },
      balance,
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

    // Check session validity for each account and try to refresh if needed
    const accountsWithStatus = await Promise.all(
      accounts.map(async (account) => {
        const session = validateBrokerSession(account.sessionToken, account.sessionExpiry);
        const platform = getBrokerPlatform(account.platform);

        // If session needs refresh, try to refresh it
        if (session.needsRefresh && account.refreshToken) {
          try {
            const adapter = getBrokerAdapter(account.platform);
            if (adapter) {
              const refreshResult = await adapter.refreshSession(account.refreshToken);
              if (refreshResult.success) {
                await prisma.bettingAccount.update({
                  where: { id: account.id },
                  data: {
                    accessToken: refreshResult.accessToken,
                    refreshToken: refreshResult.refreshToken,
                    sessionExpiry: refreshResult.sessionExpiry,
                    lastSyncedAt: new Date(),
                  },
                });

                // Log session refresh
                await logBrokerEvent({
                  userId,
                  action: "broker_session_refreshed",
                  brokerPlatform: account.platform,
                  status: "success",
                });
              }
            }
          } catch (error) {
            console.error("Session refresh failed:", error);
          }
        }

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
          currency: account.currency,
          allocatedAmount: account.allocatedAmount,
          allocationLock: account.allocationLock,
          totalBrokerBets: account.totalBrokerBets,
          totalBrokerProfit: account.totalBrokerProfit,
          lastBetPlacedAt: account.lastBetPlacedAt,
          features: platform?.features || null,
        };
      })
    );

    // Return regions data and available platforms
    const regions = REGIONS.map((r) => ({
      code: r.code,
      name: r.name,
      flag: r.flag,
      currencyCode: r.currencyCode,
      currencySymbol: r.currencySymbol,
      currencyName: r.currencyName,
      continent: r.continent,
      platformCount: getPlatformsForRegion(r.code).length,
    }));

    const continents = getContinents();

    return NextResponse.json({
      accounts: accountsWithStatus,
      regions,
      continents,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker status error:", error);
    return NextResponse.json({ error: "Failed to fetch broker status" }, { status: 500 });
  }
}
