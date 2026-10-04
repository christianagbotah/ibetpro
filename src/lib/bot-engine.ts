import { prisma } from "./db";
import {
  botEngine as legacyBotEngine,
  BotEngine,
} from "./bot-engine-legacy";

const originalStart = legacyBotEngine.start.bind(legacyBotEngine);
let autoGuardInstalled = false;

/**
 * Temporary fail-closed guard around the legacy background engine.
 *
 * Advisor mode is safe and continues to use the proven legacy scheduler.
 * Background AUTO mode is blocked because the legacy loop still contains
 * pre-atomic placement/cashout accounting. Automated placement remains
 * available through the atomic /api/auto-bet path until the scheduler is
 * migrated onto the shared transactional writers.
 */
function installAtomicAccountingGuard() {
  if (autoGuardInstalled) return;
  autoGuardInstalled = true;

  legacyBotEngine.start = async (
    userId: string,
    scanIntervalSec: number = 30
  ): Promise<{ success: boolean; message: string }> => {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { botMode: true },
    });

    if (settings?.botMode === "auto") {
      const message =
        "Background AUTO execution is temporarily fail-closed while its scheduler is migrated to atomic placement/cashout accounting. Advisor mode and the atomic auto-bet API remain available.";

      await prisma.botSession
        .upsert({
          where: { userId },
          update: {
            status: "stopped",
            stoppedAt: new Date(),
            stopReason: "background_auto_accounting_guard",
          },
          create: {
            userId,
            status: "stopped",
            stoppedAt: new Date(),
            stopReason: "background_auto_accounting_guard",
            scanIntervalSec,
          },
        })
        .catch(() => {});

      await prisma.botLog
        .create({
          data: {
            userId,
            action: "bot_stopped",
            reasoning: message,
            details: JSON.stringify({
              guard: "background_auto_accounting_guard",
              advisorAvailable: true,
              atomicApiAvailable: true,
            }),
          },
        })
        .catch(() => {});

      return { success: false, message };
    }

    return originalStart(userId, scanIntervalSec);
  };
}

installAtomicAccountingGuard();

export const botEngine = legacyBotEngine;
export { BotEngine };
