import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireAuth } from "@/lib/session";

// GET /api/accounts - List betting accounts for authenticated user
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const accounts = await prisma.bettingAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// POST /api/accounts - Connect a new betting account
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { platform, accountName, accountId, accessToken, refreshToken } = body;

    if (!platform || !accountName) {
      return NextResponse.json(
        { error: "Platform and account name are required" },
        { status: 400 }
      );
    }

    // Validate platform
    const supportedPlatforms = [
      "bet365", "betway", "1xbet", "sportybet", "stake", "pinnacle", "manual"
    ];

    if (!supportedPlatforms.includes(platform.toLowerCase())) {
      return NextResponse.json(
        { error: `Unsupported platform. Supported: ${supportedPlatforms.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if account already exists for this platform
    const existing = await prisma.bettingAccount.findFirst({
      where: {
        userId,
        platform: platform.toLowerCase(),
      },
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
        platform: platform.toLowerCase(),
        accountId: accountId || `${platform.toLowerCase()}-${Date.now()}`,
        accountName,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        balance: 0,
        currency: "USD",
        isConnected: true,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json(account, { status: 201 });
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

    await prisma.bettingAccount.update({
      where: { id: accountId },
      data: { isConnected: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error disconnecting account:", error);
    return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
  }
}
