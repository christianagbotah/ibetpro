import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

async function getDemoUserId(): Promise<string> {
  const user = await prisma.user.findFirst({ where: { email: "demo@ibetpro.com" } });
  return user?.id || "";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || await getDemoUserId();

    if (!userId) {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }

    const accounts = await prisma.bettingAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, platform, accountName, accountId } = body;

    const uid = userId || await getDemoUserId();

    if (!uid || !platform || !accountName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const account = await prisma.bettingAccount.create({
      data: {
        userId: uid,
        platform,
        accountId: accountId || `${platform}_${Date.now()}`,
        accountName,
        balance: 0,
        currency: "USD",
        isConnected: false,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
