import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { logBrokerEvent } from "@/lib/audit-log";
import { config } from "@/lib/config";

/**
 * GET /api/user/broker-mode - Get the current user's broker mode setting
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { brokerMode: true, autoBettingEnabled: true, botMode: true },
    });

    const mode = settings?.brokerMode;
    const brokerMode: "demo" | "real" = mode === "real" || mode === "demo" ? mode : "demo";

    return NextResponse.json({
      brokerMode,
      autoBettingEnabled: settings?.autoBettingEnabled ?? false,
      botMode: settings?.botMode || "advisor",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Get broker mode error:", error);
    return NextResponse.json({ brokerMode: "demo" }, { status: 200 });
  }
}

/**
 * PATCH /api/user/broker-mode - Update the current user's broker mode setting
 * Body: { brokerMode: "demo" | "real" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { brokerMode } = body;

    if (!brokerMode || (brokerMode !== "demo" && brokerMode !== "real")) {
      return NextResponse.json(
        { error: "brokerMode must be 'demo' or 'real'" },
        { status: 400 }
      );
    }

    if (brokerMode === "real") {
      const connectedAccounts = await prisma.bettingAccount.count({
        where: { userId, isConnected: true },
      });
      if (connectedAccounts === 0) {
        return NextResponse.json(
          { error: "Connect at least one broker account before switching to Real mode" },
          { status: 409 }
        );
      }
    }

    const updateData =
      brokerMode === "real"
        ? {
            brokerMode,
            autoBettingEnabled: false,
            botMode: "advisor",
          }
        : { brokerMode };

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        brokerMode,
        autoBettingEnabled: brokerMode === "demo",
        botMode: "advisor",
        riskLevel: "medium",
        commissionRate: config.commission.defaultRate,
      },
    });

    await logBrokerEvent({
      userId,
      action: "broker_mode_changed",
      brokerPlatform: "system",
      status: "success",
      metadata: { brokerMode, previousMode: brokerMode === "demo" ? "real" : "demo" },
    });

    return NextResponse.json({
      success: true,
      brokerMode: settings.brokerMode,
      autoBettingEnabled: settings.autoBettingEnabled,
      botMode: settings.botMode,
      realExecutionEnabled: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Update broker mode error:", error);
    return NextResponse.json({ error: "Failed to update broker mode" }, { status: 500 });
  }
}
