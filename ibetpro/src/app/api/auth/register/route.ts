import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Create user with settings
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: "user",
        balance: 0,
        bankroll: 1000,
        totalProfit: 0,
        totalLoss: 0,
        commissionPaid: 0,
        settings: {
          create: {
            autoBettingEnabled: false,
            maxBetAmount: 200,
            minOddsThreshold: 1.5,
            maxOddsThreshold: 5.0,
            riskLevel: "medium",
            autoCashoutEnabled: true,
            cashoutThreshold: 0.7,
            commissionRate: 0.10,
            preferredSports: "football,basketball,tennis",
            notificationsEnabled: true,
            dailyBetLimit: 500,
            kellyFraction: 0.25,
            minEdgeThreshold: 0.03,
          },
        },
      },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
