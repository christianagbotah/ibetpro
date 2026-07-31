// ============================================================================
// iBetPro Broker OAuth Callback
// Handles OAuth redirect callbacks from broker platforms
// After user authorizes on the broker's site, the broker redirects here
// ============================================================================

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { getBrokerAdapter } from "@/lib/broker-adapters";
import { getBrokerPlatform, getRegionCurrency } from "@/lib/broker-integration";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platformId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { platformId } = await params;

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth error from broker
    if (error) {
      const errorDesc = searchParams.get("error_description") || error;
      return NextResponse.redirect(
        new URL(`/accounts?error=${encodeURIComponent(errorDesc)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/accounts?error=No authorization code received", request.url)
      );
    }

    // Verify state matches user (prevent CSRF)
    if (state && state !== userId) {
      return NextResponse.redirect(
        new URL("/accounts?error=Invalid state parameter", request.url)
      );
    }

    // Get adapter and exchange code for tokens
    const adapter = getBrokerAdapter(platformId);
    if (!adapter) {
      return NextResponse.redirect(
        new URL(`/accounts?error=Unknown platform: ${platformId}`, request.url)
      );
    }

    const authResult = await adapter.authenticate({ token: code });

    if (!authResult.success) {
      return NextResponse.redirect(
        new URL(`/accounts?error=${encodeURIComponent(authResult.error || "Authentication failed")}`, request.url)
      );
    }

    // Get platform info
    const platform = getBrokerPlatform(platformId);
    const region = searchParams.get("region") || "ng";
    const currencyInfo = getRegionCurrency(region);

    // Update user's region if not set
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && (!user.region || user.region === "ng")) {
      await prisma.user.update({
        where: { id: userId },
        data: { region, currency: currencyInfo.code },
      });
    }

    // Create or update betting account
    const existingAccount = await prisma.bettingAccount.findFirst({
      where: {
        userId,
        platform: platformId,
        brokerUserId: authResult.brokerUserId || undefined,
      },
    });

    if (existingAccount) {
      await prisma.bettingAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          sessionToken: authResult.sessionToken,
          sessionExpiry: authResult.sessionExpiry,
          isConnected: true,
          brokerType: "oauth",
          brokerRegion: region,
          brokerUserId: authResult.brokerUserId,
          currency: currencyInfo.code,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      await prisma.bettingAccount.create({
        data: {
          userId,
          platform: platformId,
          accountId: `${platformId}_oauth_${authResult.brokerUserId || Date.now()}`,
          accountName: `${platform?.name || platformId} Account`,
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          sessionToken: authResult.sessionToken,
          sessionExpiry: authResult.sessionExpiry,
          isConnected: true,
          brokerType: "oauth",
          brokerRegion: region,
          brokerUserId: authResult.brokerUserId,
          currency: currencyInfo.code,
          lastSyncedAt: new Date(),
        },
      });
    }

    // Redirect back to accounts page with success
    return NextResponse.redirect(
      new URL("/accounts?connected=true", request.url)
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/accounts?error=Authentication failed", request.url)
    );
  }
}
