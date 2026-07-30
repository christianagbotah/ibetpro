import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || "demo@ibetpro.com";

    const user = await prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    });

    if (!user) {
      return NextResponse.json({
        balance: 0,
        totalProfit: 0,
        totalLoss: 0,
        commissionPaid: 0,
        bankroll: 1000,
      });
    }

    return NextResponse.json({
      balance: user.balance,
      totalProfit: user.totalProfit,
      totalLoss: user.totalLoss,
      commissionPaid: user.commissionPaid,
      bankroll: user.bankroll,
      settings: user.settings,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
