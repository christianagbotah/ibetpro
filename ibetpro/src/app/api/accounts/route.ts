import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireAuth } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { validateInput, createAccountSchema, deleteAccountSchema } from "@/lib/validation";
import { verifyPlatformConnection } from "@/lib/betting-platforms";

// GET /api/accounts - List betting accounts for authenticated user
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const accounts = await prisma.bettingAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(accounts, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// POST /api/accounts - Connect a new betting account
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const rateLimit = checkRateLimit(userId, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const body = await request.json();
    const validation = validateInput(createAccountSchema, body);
    if (!validation.success) return validation.error;

    const { platform, accountName, accountId, accessToken, refreshToken, balance, currency } = validation.data;

    // Verify the platform connection if access token provided
    if (accessToken) {
      const connectionResult = await verifyPlatformConnection(platform, accessToken);
      if (!connectionResult.connected) {
        return NextResponse.json(
          { error: `Platform connection failed: ${connectionResult.error}` },
          { status: 400 }
        );
      }
    }

    // Check if account already exists for this platform
    const existing = await prisma.bettingAccount.findFirst({
      where: { userId, platform },
    });

    if (existing) {
      return NextResponse.json(
        { error: `You already have a ${platform} account connected` },
        { status: 409 }
      );
    }

    const account = await prisma.bettingAccount.create({
      data: {
        userId,
        platform,
        accountId: accountId || `${platform}-${Date.now()}`,
        accountName,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        balance: balance ?? 0,
        currency: currency ?? "USD",
        isConnected: !!accessToken,
        lastSyncedAt: accessToken ? new Date() : null,
      },
    });

    return NextResponse.json(account, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error connecting account:", error);
    return NextResponse.json({ error: "Failed to connect account" }, { status: 500 });
  }
}

// DELETE /api/accounts - Disconnect a betting account
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const rateLimit = checkRateLimit(userId, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("id");

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    // Verify ownership
    const account = await prisma.bettingAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Check for active bets on this account
    const activeBets = await prisma.bet.count({
      where: { bettingAccountId: accountId, status: "pending" },
    });

    if (activeBets > 0) {
      return NextResponse.json(
        { error: `Cannot disconnect: ${activeBets} active bets on this account` },
        { status: 400 }
      );
    }

    await prisma.bettingAccount.update({
      where: { id: accountId },
      data: { isConnected: false },
    });

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error disconnecting account:", error);
    return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
  }
}
