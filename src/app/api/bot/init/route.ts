// ============================================================================
// iBetPro Bot Engine Initialization API
// GET /api/bot/init - Initialize and recover running bots on server startup
// POST /api/bot/init - Admin: force recover all running bots + force sync
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { botEngine } from "@/lib/bot-engine";
import { requireAuth, isAdmin } from "@/lib/session";
import { syncMatchData } from "@/lib/sync-service";

import { prisma } from "@/lib/db";

// Track if initialization has been done
let initialized = false;

/**
 * GET - Initialize the bot engine on first request.
 * This is called by the frontend when the app loads to ensure the engine
 * is running, data is synced, and any bots from before a restart are recovered.
 *
 * Also detects "zombie" sessions — where the DB says "running" but the
 * in-memory engine is NOT running (e.g. after a PM2 restart that killed
 * the timers). These are recovered automatically.
 */
export async function GET() {
  try {
    // Always check for zombie sessions, even if we've initialized before.
    // This handles the case where the engine died but the module-level
    // `initialized` flag is still true.
    const zombieSessions = await prisma.botSession.findMany({
      where: { status: "running" },
      select: { userId: true, scanIntervalSec: true },
    });

    let zombiesRecovered = 0;
    for (const session of zombieSessions) {
      if (!botEngine.isRunning(session.userId)) {
        // DB says running, but engine is NOT — zombie session
        console.log(`[BotInit] Zombie session detected for user ${session.userId}, recovering...`);
        const result = await botEngine.start(session.userId, session.scanIntervalSec || 30);
        if (result.success) {
          zombiesRecovered++;
        } else {
          console.warn(`[BotInit] Could not recover zombie for user ${session.userId}: ${result.message}`);
          await prisma.botSession.update({
            where: { userId: session.userId },
            data: { status: "stopped", stoppedAt: new Date(), stopReason: `zombie_recovery_failed: ${result.message}` },
          }).catch(() => {});
        }
      }
    }

    if (!initialized) {
      initialized = true;
      console.log("[BotInit] Initializing bot engine...");

      // Sync match data (loads demo data or fetches from APIs)
      const syncResult = await syncMatchData(true);

      // Recover running bots (for any that weren't already caught as zombies)
      const recovered = await botEngine.recoverRunningBots();
      console.log(`[BotInit] Recovered ${recovered} running bot(s), ${zombiesRecovered} zombie(s) fixed`);

      return NextResponse.json({
        initialized: true,
        recovered,
        zombiesRecovered,
        runningBots: botEngine.getRunningCount(),
        sync: {
          source: syncResult.source,
          matchesSynced: syncResult.matchesSynced,
          matchesUpdated: syncResult.matchesUpdated,
          skipped: syncResult.skipped,
        },
        message: `Bot engine initialized. Recovered ${recovered} running bot(s), fixed ${zombiesRecovered} zombie(s). Data source: ${syncResult.source} (${syncResult.matchesSynced} new, ${syncResult.matchesUpdated} updated).`,
      });
    }

    return NextResponse.json({
      initialized: true,
      runningBots: botEngine.getRunningCount(),
      zombiesRecovered,
      message: zombiesRecovered > 0
        ? `Recovered ${zombiesRecovered} zombie bot session(s).`
        : "Bot engine already initialized.",
    });
  } catch (error) {
    console.error("[BotInit] Initialization error:", error);
    return NextResponse.json({ error: "Failed to initialize bot engine" }, { status: 500 });
  }
}

/**
 * POST - Admin: Force recover all running bots + force data sync
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const admin = await isAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Force sync match data
    const syncResult = await syncMatchData(true);

    // Recover bots
    const recovered = await botEngine.recoverRunningBots();

    return NextResponse.json({
      success: true,
      recovered,
      runningBots: botEngine.getRunningCount(),
      sync: {
        source: syncResult.source,
        matchesSynced: syncResult.matchesSynced,
        matchesUpdated: syncResult.matchesUpdated,
        errors: syncResult.errors,
        durationMs: syncResult.durationMs,
      },
      message: `Force recovered ${recovered} bot(s). Data source: ${syncResult.source} (${syncResult.matchesSynced} new, ${syncResult.matchesUpdated} updated).`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("[BotInit] Force recover error:", error);
    return NextResponse.json({ error: "Failed to force recover bots" }, { status: 500 });
  }
}
