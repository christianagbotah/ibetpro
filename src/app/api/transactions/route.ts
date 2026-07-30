import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

async function getDemoUserId(): Promise<string> {
  const user = await db.user.findFirst({ where: { email: "demo@ibetpro.com" } });
  return user?.id || "";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || await getDemoUserId();
    const type = searchParams.get("type");
    const limit = searchParams.get("limit");

    if (!userId) {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }

    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;

    const transactions = await db.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(limit ? { take: parseInt(limit, 10) } : {}),
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
