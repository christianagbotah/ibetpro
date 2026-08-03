// ============================================================================
// iBetPro Server Startup Instrumentation
// Next.js calls this file once when the Node.js process starts.
// We use it to auto-recover any bot sessions that were running before a
// server restart (PM2 restart, crash, deploy, etc.).
//
// Without this, the BotEngine's in-memory setInterval timers are lost on
// every process restart, and Telegram alerts stop until someone manually
// visits the web app (which triggers /api/bot/init).
// ============================================================================

export async function register() {
  // Only run on the server side, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server starting — initializing bot engine recovery...");

    try {
      // Dynamic import to avoid pulling heavy deps at build time
      const { botEngine } = await import("./lib/bot-engine");
      const { prisma } = await import("./lib/db");

      // Check for any sessions marked as "running" in the DB
      const runningSessions = await prisma.botSession.findMany({
        where: { status: "running" },
        select: {
          userId: true,
          scanIntervalSec: true,
          startedAt: true,
          totalScans: true,
        },
      });

      if (runningSessions.length === 0) {
        console.log("[Instrumentation] No running bot sessions to recover.");
        return;
      }

      console.log(
        `[Instrumentation] Found ${runningSessions.length} running bot session(s) — recovering...`
      );

      let recovered = 0;
      for (const session of runningSessions) {
        try {
          const result = await botEngine.start(session.userId, session.scanIntervalSec || 30);
          if (result.success) {
            recovered++;
            console.log(
              `[Instrumentation] ✅ Recovered bot for user ${session.userId} (was running since ${session.startedAt?.toISOString()}, ${session.totalScans} prior scans)`
            );
          } else {
            console.warn(
              `[Instrumentation] ⚠️ Could not recover bot for user ${session.userId}: ${result.message}`
            );
            // Mark session as stopped so it doesn't keep trying
            await prisma.botSession.update({
              where: { userId: session.userId },
              data: {
                status: "stopped",
                stoppedAt: new Date(),
                stopReason: `recovery_failed: ${result.message}`,
              },
            });
          }
        } catch (err) {
          console.error(
            `[Instrumentation] ❌ Error recovering bot for user ${session.userId}:`,
            err
          );
          // Mark as stopped to prevent infinite retry loops
          await prisma.botSession.update({
            where: { userId: session.userId },
            data: {
              status: "stopped",
              stoppedAt: new Date(),
              stopReason: "recovery_error",
            },
          }).catch(() => {}); // don't fail if DB update also errors
        }
      }

      console.log(
        `[Instrumentation] Bot recovery complete: ${recovered}/${runningSessions.length} session(s) recovered.`
      );

      // Also sync match data so the bot has fresh data to scan
      try {
        const { syncMatchData } = await import("./lib/sync-service");
        const syncResult = await syncMatchData(true);
        console.log(
          `[Instrumentation] Match data synced: ${syncResult.source} — ${syncResult.matchesSynced} new, ${syncResult.matchesUpdated} updated`
        );
      } catch (syncErr) {
        console.warn("[Instrumentation] Match sync failed (non-fatal):", syncErr);
      }
    } catch (error) {
      console.error("[Instrumentation] Fatal error during bot recovery:", error);
    }
  }
}
