import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { validateInput, updateSettingsSchema } from "@/lib/validation";
import { config } from "@/lib/config";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      const newSettings = await prisma.userSettings.create({
        data: {
          userId: user.id,
          autoBettingEnabled: true,
          maxBetAmount: 200,
          minOddsThreshold: 1.5,
          maxOddsThreshold: 5.0,
          riskLevel: "medium",
          autoCashoutEnabled: true,
          cashoutThreshold: 0.7,
          commissionRate: config.commission.defaultRate,
          preferredSports: "football,basketball,tennis",
          notificationsEnabled: true,
          dailyBetLimit: 500,
          kellyFraction: 0.25,
          minEdgeThreshold: 0.03,
        },
      });
      return NextResponse.json(newSettings);
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateInput(updateSettingsSchema, body);
    if (!validation.success) return validation.error;

    const data = validation.data;

    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: data,
      create: {
        userId: user.id,
        ...data,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
