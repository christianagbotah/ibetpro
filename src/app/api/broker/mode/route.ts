// ============================================================================
// iBetPro Broker Mode Toggle API
// POST /api/broker/mode - Switch between demo and real broker mode
// GET /api/broker/mode - Get current broker mode
// ============================================================================

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { logBrokerEvent } from "@/lib/audit-log";

/**
 * GET - Get current broker mode for the authenticated user
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { brokerMode: true },
    });

    return NextResponse.json({
      mode: settings?.brokerMode || "demo",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker mode fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch broker mode" }, { status: 500 });
  }
}

/**
 * POST - Toggle broker mode between demo and real
 * Body: { mode: "demo" | "real" }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { mode } = body;

    if (!mode || !["demo", "real"].includes(mode)) {
      return NextResponse.json({
        error: "Invalid mode. Must be 'demo' or 'real'",
      }, { status: 400 });
    }

    // If switching to real mode, verify user has at least one connected broker
    if (mode === "real") {
      const connectedAccounts = await prisma.bettingAccount.count({
        where: {
          userId,
          isConnected: true,
        },
      });

      if (connectedAccounts === 0) {
        return NextResponse.json({
          error: "Connect at least one broker account before switching to Real mode",
          mode: "demo",
        }, { status: 400 });
      }
    }

    // Update the user's broker mode setting
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: { brokerMode: mode },
      create: {
        userId,
        brokerMode,
        autoBettingEnabled: true,
      },
    });

    // Log the mode change
    await logBrokerEvent({
      userId,
      action: "broker_mode_changed",
      brokerPlatform: "system",
      status: "success",
      metadata: { previousMode: mode === "real" ? "demo" : "real", newMode: mode },
    });

    return NextResponse.json({
      success: true,
      mode: settings.brokerMode,
      message: mode === "real"
        ? "Switched to Real mode. Live broker API connections will be used."
        : "Switched to Demo mode. Simulated broker connections will be used for testing.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Broker mode toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle broker mode" }, { status: 500 });
  }
}
