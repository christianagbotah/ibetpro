// ============================================================================
// iBetPro Bot Engine Initialization API
// GET /api/bot/init - Initialize and recover running bots on server startup
// POST /api/bot/init - Admin: force recover all running bots + sync demo data
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { botEngine } from "@/lib/bot-engine";
import { requireAuth, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { generateDemoMatches } from "@/lib/demo-data";
import { getPrimaryDataSource } from "@/lib/config";

// Track if initialization has been done
let initialized = false;

/**
 * Ensure matches exist in the database.
 * If no matches and no API keys configured, load demo data.
 */
async function ensureMatchesExist(): Promise<{ synced: number; source: string }> {
  const matchCount = await prisma.match.count();

  if (matchCount > 0) {
    return { synced: 0, source: "existing" };
  }

  const dataSource = getPrimaryDataSource();
  if (dataSource !== "none") {
    // Real API keys are configured — skip demo data
    return { synced: 0, source: dataSource };
  }

  // No matches and no API keys — load demo data
  console.log("[BotInit] No matches in DB and no API keys configured. Loading demo data...");
  const demoMatches = generateDemoMatches();
  let synced = 0;

  for (const match of demoMatches) {
    try {
      await prisma.match.upsert({
        where: { externalId: match.externalId },
        update: {
          homeOdds: match.homeOdds,
          drawOdds: match.drawOdds,
          awayOdds: match.awayOdds,
          overUnderLine: match.overUnderLine,
          overOdds: match.overOdds,
          underOdds: match.underOdds,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: match.minute,
          lastSyncedAt: new Date(),
          apiSource: "demo",
        },
        create: {
          externalId: match.externalId,
          sport: match.sport,
          league: match.league,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeOdds: match.homeOdds,
          drawOdds: match.drawOdds,
          awayOdds: match.awayOdds,
          overUnderLine: match.overUnderLine,
          overOdds: match.overOdds,
          underOdds: match.underOdds,
          commenceTime: new Date(match.commenceTime),
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: match.minute,
          apiSource: "demo",
          lastSyncedAt: new Date(),
        },
      });
      synced++;
    } catch (err) {
      console.error("[BotInit] Demo match upsert error:", err);
    }
  }

  console.log(`[BotInit] Loaded ${synced} demo matches`);
  return { synced, source: "demo" };
}

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

      // Ensure matches exist in DB
      const matchResult = await ensureMatchesExist();

      // Recover running bots
      const recovered = await botEngine.recoverRunningBots();
      console.log(`[BotInit] Recovered ${recovered} running bot(s)`);

      return NextResponse.json({
        initialized: true,
        recovered,
        runningBots: botEngine.getRunningCount(),
        matches: matchResult,
        message: `Bot engine initialized. Recovered ${recovered} running bot(s). ${matchResult.synced > 0 ? `Loaded ${matchResult.synced} demo matches.` : ""}`,
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
 * POST - Admin: Force recover all running bots + ensure demo data
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const admin = await isAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Ensure matches exist
    const matchResult = await ensureMatchesExist();

    // Recover bots
    const recovered = await botEngine.recoverRunningBots();

    return NextResponse.json({
      success: true,
      recovered,
      runningBots: botEngine.getRunningCount(),
      matches: matchResult,
      message: `Force recovered ${recovered} bot(s). ${botEngine.getRunningCount()} bot(s) now running. ${matchResult.synced > 0 ? `Loaded ${matchResult.synced} demo matches.` : ""}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("[BotInit] Force recover error:", error);
    return NextResponse.json({ error: "Failed to force recover bots" }, { status: 500 });
  }
}
