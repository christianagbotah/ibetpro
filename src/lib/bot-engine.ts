import { prisma } from "./db";
import {
  botEngine as legacyBotEngine,
  BotEngine as LegacyBotEngine,
} from "./bot-engine-legacy";
import { atomicAutoEngine } from "./atomic-auto-engine";

const originalLegacyStart = legacyBotEngine.start.bind(legacyBotEngine);
const originalLegacyShutdown = legacyBotEngine.shutdown.bind(legacyBotEngine);

async function routedStart(
  userId: string,
  scanIntervalSec = 30
): Promise<{ success: boolean; message: string }> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { botMode: true },
  });

  if (settings?.botMode === "auto") {
    return atomicAutoEngine.start(userId, scanIntervalSec);
  }

  return originalLegacyStart(userId, scanIntervalSec);
}

// The legacy engine owns a five-minute zombie heartbeat. It calls `this.start`
// internally, so route that method too: AUTO zombie recovery can never enter
// legacy placement/cashout logic, while Advisor recovery remains unchanged.
legacyBotEngine.start = routedStart;

class HybridBotEngine {
  async start(userId: string, scanIntervalSec = 30) {
    return routedStart(userId, scanIntervalSec);
  }

  async stop(userId: string, reason = "user_stopped"): Promise<void> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { botMode: true },
    });

    if (settings?.botMode === "auto" || atomicAutoEngine.isRunning(userId)) {
      await atomicAutoEngine.stop(userId, reason);
      return;
    }

    await legacyBotEngine.stop(userId, reason);
  }

  isRunning(userId: string): boolean {
    return atomicAutoEngine.isRunning(userId) || legacyBotEngine.isRunning(userId);
  }

  getStatus(userId: string) {
    return atomicAutoEngine.getStatus(userId) || legacyBotEngine.getStatus(userId);
  }

  getAllRunningStats() {
    return [
      ...atomicAutoEngine.getAllRunningStats(),
      ...legacyBotEngine.getAllRunningStats(),
    ];
  }

  getRunningCount(): number {
    return this.getAllRunningStats().length;
  }

  async recoverRunningBots(): Promise<number> {
    const runningSessions = await prisma.botSession.findMany({
      where: { status: "running" },
      select: { userId: true, scanIntervalSec: true },
    });

    let recovered = 0;
    for (const session of runningSessions) {
      if (this.isRunning(session.userId)) continue;
      try {
        const result = await routedStart(
          session.userId,
          session.scanIntervalSec || 30
        );
        if (result.success) recovered++;
        else {
          await prisma.botSession.update({
            where: { userId: session.userId },
            data: {
              status: "stopped",
              stoppedAt: new Date(),
              stopReason: `recovery_failed: ${result.message}`,
            },
          });
        }
      } catch (error) {
        console.error(
          `[HybridBotEngine] Recovery failed for ${session.userId}:`,
          error
        );
        await prisma.botSession
          .update({
            where: { userId: session.userId },
            data: {
              status: "stopped",
              stoppedAt: new Date(),
              stopReason: "recovery_error",
            },
          })
          .catch(() => {});
      }
    }
    return recovered;
  }

  async shutdown(): Promise<void> {
    await atomicAutoEngine.shutdown();
    await originalLegacyShutdown();
  }
}

const hybridBotEngine = new HybridBotEngine();

// The legacy constructor registered SIGTERM/SIGINT handlers that dynamically
// call its `shutdown` method. Patch that method so graceful shutdown also
// clears atomic timers before the process exits.
legacyBotEngine.shutdown = hybridBotEngine.shutdown.bind(hybridBotEngine);

export const botEngine = hybridBotEngine;
export { HybridBotEngine as BotEngine, LegacyBotEngine };
