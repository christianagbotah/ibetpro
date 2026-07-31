// ============================================================================
// iBetPro Bot Engine Initialization API
// GET /api/bot/init - Initialize and recover running bots on server startup
// POST /api/bot/init - Admin: force recover all running bots
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { botEngine } from "@/lib/bot-engine";
import { requireAuth, isAdmin } from "@/lib/session";

// Track if initialization has been done
let initialized = false;

/**
 * GET - Initialize the bot engine on first request.
 * This is called by the frontend when the app loads to ensure the engine
 * is running and recover any bots that were running before a restart.
 */
export async function GET() {
  try {
    if (!initialized) {
      initialized = true;
      console.log("[BotInit] Initializing bot engine...");

      const recovered = await botEngine.recoverRunningBots();
      console.log(`[BotInit] Recovered ${recovered} running bot(s)`);

      return NextResponse.json({
        initialized: true,
        recovered,
        runningBots: botEngine.getRunningCount(),
        message: `Bot engine initialized. Recovered ${recovered} running bot(s).`,
      });
    }

    return NextResponse.json({
      initialized: true,
      runningBots: botEngine.getRunningCount(),
      message: "Bot engine already initialized.",
    });
  } catch (error) {
    console.error("[BotInit] Initialization error:", error);
    return NextResponse.json({ error: "Failed to initialize bot engine" }, { status: 500 });
  }
}

/**
 * POST - Admin: Force recover all running bots
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const admin = await isAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const recovered = await botEngine.recoverRunningBots();

    return NextResponse.json({
      success: true,
      recovered,
      runningBots: botEngine.getRunningCount(),
      message: `Force recovered ${recovered} bot(s). ${botEngine.getRunningCount()} bot(s) now running.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("[BotInit] Force recover error:", error);
    return NextResponse.json({ error: "Failed to force recover bots" }, { status: 500 });
  }
}
