// ============================================================================
// iBetPro Bot Engine - Background AI Advisor & Auto-Betting Engine
// Phase 1 (Advisor): AI scans matches → generates tips → sends Telegram alerts
// Phase 2 (Auto):   AI scans matches → places bets automatically via broker
// Runs continuously on the server using setInterval, independent of frontend.
// ============================================================================

import { prisma } from "./db";
import { analyzeMatch, shouldAutoBet, checkRiskLimits, isWithinBetSchedule } from "./ai-engine-v2";
import { placeBetOnBroker } from "./broker-integration";
import { sendTipAlert, type TipAlert } from "./notifications/telegram";
import { syncMatchData } from "./sync-service";

// ==================== SPORT KEY MAPPING ====================

/**
 * Expand category-level sport names (e.g. "football") to all matching DB sport keys
 * (e.g. "soccer_epl", "soccer_spain_la_liga", etc.) so the bot can find matches
 * regardless of whether the user settings use category names or specific keys.
 */
const SPORT_CATEGORY_MAP: Record<string, string[]> = {
  football: [
    "football", "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga",
    "soccer_italy_serie_a", "soccer_france_ligue_one", "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie", "soccer_turkey_super_league", "soccer_belgium_first_div",
    "soccer_scotland_prem", "soccer_championship", "soccer_league_one", "soccer_league_two",
    "soccer_efa_champions_league", "soccer_efa_europa_league", "soccer_efa_conference_league",
    "soccer_mls", "soccer_br_serie_a", "soccer_argentina_primera", "soccer_a_league",
    "soccer_j_league", "soccer_k_league", "soccer_china_super", "soccer_sa_aa",
    "soccer_kenya_prem", "soccer_ghana_prem", "soccer_nigeria_npfl",
  ],
  basketball: [
    "basketball", "basketball_nba", "basketball_ncaab", "basketball_euroleague", "basketball_nbl",
  ],
  tennis: [
    "tennis", "tennis_atp_australian_open", "tennis_atp_french_open", "tennis_atp_wimbledon",
    "tennis_atp_us_open", "tennis_atp_masters", "tennis_wta_masters",
  ],
  americanfootball: ["americanfootball", "americanfootball_nfl", "americanfootball_ncaaf"],
  cricket: ["cricket", "cricket_ipl", "cricket_big_bash", "cricket_caribbean_prem"],
  rugby: ["rugby", "rugby_union_six_nations", "rugby_union_prem"],
  icehockey: ["icehockey", "icehockey_nhl", "icehockey_sweden_hockey_league"],
  mma: ["mma", "mma_mixed_martial_arts"],
  boxing: ["boxing", "boxing_boxing"],
  motorsport: ["motorsport", "motorsport_f1"],
  soccer: ["football", "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga",
    "soccer_italy_serie_a", "soccer_france_ligue_one", "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie", "soccer_turkey_super_league", "soccer_belgium_first_div",
    "soccer_scotland_prem", "soccer_championship", "soccer_league_one", "soccer_league_two",
    "soccer_efa_champions_league", "soccer_efa_europa_league", "soccer_efa_conference_league",
    "soccer_mls", "soccer_br_serie_a", "soccer_argentina_primera", "soccer_a_league",
    "soccer_j_league", "soccer_k_league", "soccer_china_super", "soccer_sa_aa",
    "soccer_kenya_prem", "soccer_ghana_prem", "soccer_nigeria_npfl"],
};

function expandSportKeys(sports: string[]): string[] {
  const expanded = new Set<string>();
  for (const sport of sports) {
    const lower = sport.toLowerCase().trim();
    if (SPORT_CATEGORY_MAP[lower]) {
      for (const key of SPORT_CATEGORY_MAP[lower]) {
        expanded.add(key);
      }
    } else {
      // Keep the original key as-is (might be a specific key like "soccer_epl")
      expanded.add(lower);
    }
  }
  return Array.from(expanded);
}

// ==================== TYPES ====================

interface ScanResult {
  betsPlaced: number;
  tipsGenerated: number;
  totalStake: number;
  matches: number;
  skipped: number;
  error?: string;
}

interface BotEngineStats {
  userId: string;
  status: "running" | "stopped" | "paused";
  scanIntervalSec: number;
  totalScans: number;
  totalBetsPlaced: number;
  totalStakeUsed: number;
  totalProfit: number;
  lastScanAt: Date | null;
  lastBetAt: Date | null;
  startedAt: Date | null;
  errorCount: number;
  lastError: string | null;
}

// ==================== SINGLETON ENGINE ====================

/**
 * BotEngine is a singleton that manages all running bot instances.
 * Each user has their own timer that runs scan cycles on a configurable interval.
 *
 * The engine is designed to:
 * - Run independently of the frontend (no polling required)
 * - Auto-recover from errors (continues running after failed scans)
 * - Auto-stop on risk limits, schedule violations, or no allocation
 * - Persist state in the database (BotSession) for recovery after restarts
 * - Support graceful shutdown
 */
class BotEngine {
  private static instance: BotEngine | null = null;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private runningUsers: Map<string, BotEngineStats> = new Map();
  private isShuttingDown = false;

  private constructor() {
    // Register graceful shutdown handlers
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  static getInstance(): BotEngine {
    if (!BotEngine.instance) {
      BotEngine.instance = new BotEngine();
    }
    return BotEngine.instance;
  }

  // ==================== LIFECYCLE ====================

  /**
   * Start the bot for a specific user. Creates a timer that runs scan cycles
   * on the configured interval (default 30 seconds).
   */
  async start(userId: string, scanIntervalSec: number = 30): Promise<{ success: boolean; message: string }> {
    // Don't start if already running
    if (this.timers.has(userId)) {
      return { success: false, message: "Bot is already running for this user" };
    }

    // Validate prerequisites
    const validation = await this.validatePrerequisites(userId);
    if (!validation.valid) {
      return { success: false, message: validation.error! };
    }

    // Initialize stats tracking
    const stats: BotEngineStats = {
      userId,
      status: "running",
      scanIntervalSec,
      totalScans: 0,
      totalBetsPlaced: 0,
      totalStakeUsed: 0,
      totalProfit: 0,
      lastScanAt: null,
      lastBetAt: null,
      startedAt: new Date(),
      errorCount: 0,
      lastError: null,
    };
    this.runningUsers.set(userId, stats);

    // Run the first scan immediately
    try {
      const result = await this.runScanCycle(userId);
      stats.totalScans++;
      stats.totalBetsPlaced += result.betsPlaced;
      stats.totalStakeUsed += result.totalStake;
      stats.lastScanAt = new Date();
      if (result.betsPlaced > 0 || result.tipsGenerated > 0) {
        stats.lastBetAt = new Date();
      }
      if (result.error) {
        stats.errorCount++;
        stats.lastError = result.error;
      }
    } catch (error) {
      console.error(`[BotEngine] First scan failed for user ${userId}:`, error);
      stats.errorCount++;
      stats.lastError = error instanceof Error ? error.message : "Unknown error";
    }

    // Set up the recurring timer
    const timer = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const currentStats = this.runningUsers.get(userId);
        if (!currentStats || currentStats.status !== "running") {
          // Bot was stopped externally, clean up
          this.stop(userId, "auto_stopped");
          return;
        }

        // Check if the session is still running in the DB
        const session = await prisma.botSession.findUnique({ where: { userId } });
        if (!session || session.status !== "running") {
          this.stop(userId, "session_expired");
          return;
        }

        const result = await this.runScanCycle(userId);

        currentStats.totalScans++;
        currentStats.totalBetsPlaced += result.betsPlaced;
        currentStats.totalStakeUsed += result.totalStake;
        currentStats.lastScanAt = new Date();
        currentStats.lastError = null; // Clear error on success

        if (result.betsPlaced > 0) {
          currentStats.lastBetAt = new Date();
        }

        if (result.error) {
          currentStats.errorCount++;
          currentStats.lastError = result.error;
        }

        // Update session stats in DB
        await prisma.botSession.update({
          where: { userId },
          data: {
            totalScans: { increment: 1 },
            totalBetsPlaced: { increment: result.betsPlaced },
            totalStakeUsed: { increment: result.totalStake },
            lastScanAt: new Date(),
            lastBetAt: result.betsPlaced > 0 ? new Date() : undefined,
          },
        });

        // Log scan activity periodically (every 10 scans)
        if (currentStats.totalScans % 10 === 0) {
          await prisma.botLog.create({
            data: {
              userId,
              action: "bot_scan",
              reasoning: `Auto-scan #${currentStats.totalScans}: ${result.matches} matches found, ${result.betsPlaced} bets placed, ${result.skipped} skipped`,
              details: JSON.stringify({
                scanNumber: currentStats.totalScans,
                betsPlaced: result.betsPlaced,
                totalStake: result.totalStake,
                matches: result.matches,
                skipped: result.skipped,
              }),
            },
          });
        }

        // Auto-settle finished matches every 3rd scan
        if (currentStats.totalScans % 3 === 0) {
          try {
            await this.autoSettle(userId);
          } catch (settleError) {
            console.error(`[BotEngine] Auto-settle error for user ${userId}:`, settleError);
          }
        }

        // Auto-cashout evaluation every 5th scan
        if (currentStats.totalScans % 5 === 0) {
          try {
            await this.autoCashoutEvaluation(userId);
          } catch (cashoutError) {
            console.error(`[BotEngine] Auto-cashout error for user ${userId}:`, cashoutError);
          }
        }
      } catch (error) {
        console.error(`[BotEngine] Scan cycle error for user ${userId}:`, error);
        const currentStats = this.runningUsers.get(userId);
        if (currentStats) {
          currentStats.errorCount++;
          currentStats.lastError = error instanceof Error ? error.message : "Unknown error";

          // Auto-stop after too many consecutive errors
          if (currentStats.errorCount >= 10) {
            console.error(`[BotEngine] Too many errors for user ${userId}, stopping bot`);
            await this.stop(userId, "too_many_errors");
          }
        }
      }
    }, scanIntervalSec * 1000);

    // Prevent Node.js from keeping the process alive just for this timer
    if (timer.unref) {
      timer.unref();
    }

    this.timers.set(userId, timer);

    console.log(`[BotEngine] Bot started for user ${userId} with interval ${scanIntervalSec}s`);

    // Log bot start
    await prisma.botLog.create({
      data: {
        userId,
        action: "bot_started",
        reasoning: `Bot engine started in background mode. Scanning every ${scanIntervalSec}s.`,
        details: JSON.stringify({
          mode: "background",
          scanIntervalSec,
          broker: validation.connectedAccount?.platform,
          allocation: validation.connectedAccount?.allocatedAmount,
        }),
      },
    });

    return {
      success: true,
      message: stats.tipsGenerated > 0
        ? `Advisor started! Generated ${stats.tipsGenerated} tip(s) in first scan. Running in background.`
        : stats.betsPlaced > 0
        ? `Bot started! Placed ${stats.betsPlaced} bet(s) in first scan. Running in background.`
        : "Bot started! Scanning for matches in background. Will generate tips automatically.",
    };
  }

  /**
   * Stop the bot for a specific user. Clears the timer and updates the session.
   */
  async stop(userId: string, reason: string = "user_stopped"): Promise<void> {
    const timer = this.timers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(userId);
    }

    const stats = this.runningUsers.get(userId);
    if (stats) {
      stats.status = "stopped";
      this.runningUsers.delete(userId);
    }

    // Update the database session
    try {
      await prisma.botSession.upsert({
        where: { userId },
        update: {
          status: "stopped",
          stoppedAt: new Date(),
          stopReason: reason,
        },
        create: {
          userId,
          status: "stopped",
          stoppedAt: new Date(),
          stopReason: reason,
        },
      });

      // Log bot stop
      await prisma.botLog.create({
        data: {
          userId,
          action: "bot_stopped",
          reasoning: `Bot engine stopped. Reason: ${reason}`,
          details: JSON.stringify({
            reason,
            totalScans: stats?.totalScans || 0,
            totalBetsPlaced: stats?.totalBetsPlaced || 0,
            totalStakeUsed: stats?.totalStakeUsed || 0,
            totalProfit: stats?.totalProfit || 0,
            runDuration: stats?.startedAt
              ? Math.round((Date.now() - stats.startedAt.getTime()) / 60000)
              : 0,
            errorCount: stats?.errorCount || 0,
          }),
        },
      });
    } catch (error) {
      console.error(`[BotEngine] Error stopping bot for user ${userId}:`, error);
    }

    console.log(`[BotEngine] Bot stopped for user ${userId}. Reason: ${reason}`);
  }

  /**
   * Gracefully shut down all running bots.
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`[BotEngine] Shutting down ${this.timers.size} running bots...`);

    for (const [userId] of this.timers) {
      await this.stop(userId, "server_shutdown");
    }

    this.timers.clear();
    this.runningUsers.clear();
  }

  /**
   * Recover bots that were running before a server restart.
   * Checks the database for sessions with status "running" and restarts them.
   */
  async recoverRunningBots(): Promise<number> {
    try {
      const runningSessions = await prisma.botSession.findMany({
        where: { status: "running" },
      });

      console.log(`[BotEngine] Found ${runningSessions.length} running sessions to recover`);

      let recovered = 0;
      for (const session of runningSessions) {
        try {
          const result = await this.start(session.userId, session.scanIntervalSec || 30);
          if (result.success) {
            recovered++;
            console.log(`[BotEngine] Recovered bot for user ${session.userId}`);
          } else {
            console.warn(`[BotEngine] Could not recover bot for user ${session.userId}: ${result.message}`);
          }
        } catch (error) {
          console.error(`[BotEngine] Error recovering bot for user ${session.userId}:`, error);
        }
      }

      return recovered;
    } catch (error) {
      console.error("[BotEngine] Error recovering bots:", error);
      return 0;
    }
  }

  // ==================== STATUS ====================

  /**
   * Get the current status of a user's bot.
   */
  getStatus(userId: string): BotEngineStats | null {
    return this.runningUsers.get(userId) || null;
  }

  /**
   * Check if a user's bot is currently running.
   */
  isRunning(userId: string): boolean {
    return this.timers.has(userId) && (this.runningUsers.get(userId)?.status === "running");
  }

  /**
   * Get all running bot stats.
   */
  getAllRunningStats(): BotEngineStats[] {
    return Array.from(this.runningUsers.values());
  }

  /**
   * Get the number of currently running bots.
   */
  getRunningCount(): number {
    return this.timers.size;
  }

  // ==================== SCAN CYCLE ====================

  /**
   * Run a single scan cycle - analyze matches and generate tips or place bets.
   * In advisor mode: AI finds value bets → creates Tip → sends Telegram alert.
   * In auto mode: AI finds value bets → places bet via broker → creates Tip.
   */
  private async runScanCycle(userId: string): Promise<ScanResult> {
    const result: ScanResult = { betsPlaced: 0, tipsGenerated: 0, totalStake: 0, matches: 0, skipped: 0 };

    try {
      // Refresh match data from external APIs (throttled to avoid rate limits)
      try {
        await syncMatchData(false);
      } catch (syncErr) {
        console.warn("[BotEngine] Match sync failed, continuing with existing data:", syncErr);
      }

      // Get user settings
      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      if (!settings) {
        result.error = "Settings not found";
        return result;
      }

      const isAdvisorMode = settings.botMode === "advisor";

      if (!settings.autoBettingEnabled && !isAdvisorMode) {
        result.error = "Auto-betting is disabled";
        await this.stop(userId, "auto_betting_disabled");
        return result;
      }

      // Check schedule
      if (!isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd)) {
        return result;
      }

      // Check risk limits
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const riskCheck = checkRiskLimits(user?.dailyPnl || 0, user?.weeklyPnl || 0, {
        stopLossDaily: settings.stopLossDaily,
        stopLossWeekly: settings.stopLossWeekly,
        profitTargetDaily: settings.profitTargetDaily,
        profitTargetWeekly: settings.profitTargetWeekly,
      });

      if (!riskCheck.canBet) {
        const reason = (user?.dailyPnl ?? 0) <= -settings.stopLossDaily ? "stop_loss" : "profit_target";
        await this.stop(userId, reason);
        await prisma.botLog.create({
          data: {
            userId,
            action: reason === "stop_loss" ? "stop_loss_hit" : "profit_target_hit",
            reasoning: riskCheck.reason,
          },
        });
        return result;
      }

      // ---- Advisor mode: no broker required ----
      // ---- Auto mode: need connected broker ----
      let bettingAccount: Awaited<ReturnType<typeof prisma.bettingAccount.findFirst>> = null;
      let activeAllocation: Awaited<ReturnType<typeof prisma.allocation.findFirst>> = null;
      let remainingDailyLimit = settings.dailyBetLimit;
      let existingBetMatchIds: string[] = [];

      if (!isAdvisorMode) {
        bettingAccount = await prisma.bettingAccount.findFirst({
          where: { userId, isConnected: true },
          orderBy: { allocatedAmount: "desc" },
        });

        if (!bettingAccount || bettingAccount.allocatedAmount <= 0) {
          await this.stop(userId, "no_allocation");
          await prisma.botLog.create({
            data: {
              userId,
              action: "bot_scan",
              reasoning: "No connected broker or allocation available. Stopping bot.",
            },
          });
          return result;
        }

        // Check daily limit
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayBets = await prisma.bet.findMany({
          where: {
            userId,
            placedAt: { gte: todayStart },
            status: { in: ["pending", "won", "lost", "cashed_out", "partial_cashout"] },
          },
        });
        const dailyStake = todayBets.reduce((sum, b) => sum + b.stake, 0);
        existingBetMatchIds = todayBets.map((b) => b.matchId);

        if (dailyStake >= settings.dailyBetLimit) {
          return result;
        }

        remainingDailyLimit = Math.min(
          settings.dailyBetLimit - dailyStake,
          bettingAccount.allocatedAmount
        );

        if (remainingDailyLimit < 5) {
          return result;
        }

        activeAllocation = await prisma.allocation.findFirst({
          where: { userId, bettingAccountId: bettingAccount.id, status: "active" },
        });
      } else {
        // In advisor mode, check for existing tips to avoid duplicates
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTips = await prisma.tip.findMany({
          where: { userId, createdAt: { gte: todayStart } },
          select: { matchId: true },
        });
        existingBetMatchIds = todayTips.map((t) => t.matchId);
      }

      // Get upcoming matches
      // tipSports may contain category names (e.g. "football") or sport keys (e.g. "soccer_epl")
      // We need to match both — expand category names to include all sub-keys
      const rawSports = isAdvisorMode
        ? (settings.tipSports?.split(",") || ["football"])
        : (settings.preferredSports?.split(",") || ["football"]);

      const sportFilter = expandSportKeys(rawSports);

      const upcomingMatches = await prisma.match.findMany({
        where: {
          status: "upcoming",
          sport: { in: sportFilter },
          commenceTime: { gte: new Date() },
          id: { notIn: existingBetMatchIds },
        },
        orderBy: { commenceTime: "asc" },
        take: 20,
      });

      result.matches = upcomingMatches.length;

      if (upcomingMatches.length === 0) {
        return result;
      }

      // Analyze matches
      for (const match of upcomingMatches) {
        try {
          const homeTeamStats = await prisma.teamStats.findFirst({
            where: { teamName: match.homeTeam, sport: match.sport },
          });
          const awayTeamStats = await prisma.teamStats.findFirst({
            where: { teamName: match.awayTeam, sport: match.sport },
          });

          const prediction = analyzeMatch(
            {
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              sport: match.sport,
              league: match.league,
              homeOdds: match.homeOdds,
              drawOdds: match.drawOdds ?? undefined,
              awayOdds: match.awayOdds,
              overOdds: match.overOdds ?? undefined,
              underOdds: match.underOdds ?? undefined,
              overUnderLine: match.overUnderLine ?? undefined,
              status: match.status,
              commenceTime: match.commenceTime.toISOString(),
            },
            homeTeamStats,
            awayTeamStats,
            user?.bankroll || 1000,
            settings.kellyFraction
          );

          // In advisor mode, use minTipConfidence; in auto mode, use minAiConfidence
          const minConfidence = isAdvisorMode ? settings.minTipConfidence : settings.minAiConfidence;

          const autoBetCheck = shouldAutoBet(prediction, {
            minOddsThreshold: settings.minOddsThreshold,
            maxOddsThreshold: settings.maxOddsThreshold,
            minAiConfidence: minConfidence,
            minEdgeThreshold: settings.minEdgeThreshold,
            riskLevel: settings.riskLevel,
            preferredSports: isAdvisorMode ? settings.tipSports : settings.preferredSports,
          }, match.sport);

          const recOdds = prediction.recommended === "home" ? match.homeOdds
            : prediction.recommended === "away" ? match.awayOdds
            : match.drawOdds || 3.0;

          // Check odds range
          if (recOdds < settings.minOddsThreshold || recOdds > settings.maxOddsThreshold) {
            result.skipped++;
            continue;
          }

          if (!autoBetCheck.shouldPlace) {
            result.skipped++;
            continue;
          }

          const selection = prediction.recommended === "home" ? match.homeTeam
            : prediction.recommended === "away" ? match.awayTeam
            : prediction.recommended === "draw" ? "Draw"
            : prediction.recommended === "over" ? "Over 2.5"
            : "Under 2.5";

          // ============ ADVISOR MODE ============
          if (isAdvisorMode) {
            // Create a Tip (recommendation) — no bet placed
            const tip = await prisma.tip.create({
              data: {
                userId,
                matchId: match.id,
                sport: match.sport,
                league: match.league,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                selection,
                odds: recOdds,
                aiConfidence: prediction.confidence,
                valueEdge: prediction.valueEdge,
                kellyStake: prediction.kellyStake,
                riskLevel: prediction.riskLevel || settings.riskLevel,
                aiReasoning: prediction.analysis,
                commencesAt: match.commenceTime,
              },
            });

            // Send Telegram + in-app notification
            try {
              const tipAlert: TipAlert = {
                sport: match.sport,
                league: match.league,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                selection,
                odds: recOdds,
                confidence: prediction.confidence,
                valueEdge: prediction.valueEdge,
                kellyStake: prediction.kellyStake,
                riskLevel: prediction.riskLevel || settings.riskLevel,
                matchTime: new Date(match.commenceTime).toLocaleString(),
                matchId: match.id,
              };
              const notifyResult = await sendTipAlert(userId, tipAlert);

              // Update tip with delivery status
              await prisma.tip.update({
                where: { id: tip.id },
                data: {
                  telegramSent: notifyResult.telegram,
                  telegramSentAt: notifyResult.telegram ? new Date() : undefined,
                },
              });
            } catch (tipError) {
              console.error("[BotEngine] Failed to send tip notification:", tipError);
            }

            // Update match AI data
            await prisma.match.update({
              where: { id: match.id },
              data: {
                aiHomeWinProb: prediction.homeWinProb,
                aiDrawProb: prediction.drawProb,
                aiAwayWinProb: prediction.awayWinProb,
                aiConfidence: prediction.confidence,
                aiRecommended: prediction.recommended,
                aiAnalysis: prediction.analysis,
                aiRiskScore: prediction.riskScore,
                aiValueEdge: prediction.valueEdge,
                aiKellyStake: prediction.kellyStake,
              },
            });

            // Log the tip
            await prisma.botLog.create({
              data: {
                userId,
                action: "tip_generated",
                matchId: match.id,
                details: JSON.stringify({
                  tipId: tip.id,
                  odds: recOdds,
                  selection,
                  confidence: prediction.confidence,
                  valueEdge: prediction.valueEdge,
                  mode: "advisor",
                }),
                reasoning: autoBetCheck.reason,
                confidence: prediction.confidence,
              },
            });

            result.tipsGenerated++;
            console.log(`[BotEngine] Advisor tip generated for ${match.homeTeam} vs ${match.awayTeam}`);
          }
          // ============ AUTO MODE ============
          else {
            const stake = Math.min(
              autoBetCheck.suggestedStake || settings.maxBetAmount * 0.5,
              settings.maxBetAmount,
              remainingDailyLimit - result.totalStake
            );

            if (stake < 5) continue;

            const potentialWin = Math.round(stake * recOdds * 100) / 100;

            // Place bet on broker
            const brokerResult = await placeBetOnBroker(
              bettingAccount!.platform,
              bettingAccount!.accessToken || "",
              {
                matchId: match.id,
                selection,
                odds: recOdds,
                stake,
                betType: "single",
              }
            );

            // Create bet record
            const bet = await prisma.bet.create({
              data: {
                userId,
                bettingAccountId: bettingAccount!.id,
                matchId: match.id,
                betType: "single",
                selection,
                odds: recOdds,
                stake,
                potentialWin,
                isAutoPlaced: true,
                aiConfidence: prediction.confidence,
                aiReasoning: prediction.analysis,
                aiModelUsed: "v2_ensemble",
                kellyStake: prediction.kellyStake,
                valueEdge: prediction.valueEdge,
                riskScore: prediction.riskScore,
              },
            });

            // Update allocation
            if (activeAllocation) {
              await prisma.allocation.update({
                where: { id: activeAllocation.id },
                data: {
                  usedAmount: { increment: stake },
                  remainingAmount: { decrement: stake },
                },
              });
            }

            // Update betting account
            await prisma.bettingAccount.update({
              where: { id: bettingAccount!.id },
              data: {
                allocatedAmount: { decrement: stake },
                lastBetPlacedAt: new Date(),
                totalBrokerBets: { increment: 1 },
              },
            });

            // Create transaction
            await prisma.transaction.create({
              data: {
                userId,
                type: "bet_placed",
                amount: -stake,
                currency: bettingAccount!.currency || "USD",
                status: "completed",
                description: `Auto-bet via ${bettingAccount!.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${selection} @ ${recOdds}`,
                betId: bet.id,
              },
            });

            // Update match AI data
            await prisma.match.update({
              where: { id: match.id },
              data: {
                aiHomeWinProb: prediction.homeWinProb,
                aiDrawProb: prediction.drawProb,
                aiAwayWinProb: prediction.awayWinProb,
                aiConfidence: prediction.confidence,
                aiRecommended: prediction.recommended,
                aiAnalysis: prediction.analysis,
                aiRiskScore: prediction.riskScore,
                aiValueEdge: prediction.valueEdge,
                aiKellyStake: prediction.kellyStake,
              },
            });

            // Log the bet
            await prisma.botLog.create({
              data: {
                userId,
                action: "bet_placed",
                matchId: match.id,
                betId: bet.id,
                details: JSON.stringify({
                  stake,
                  odds: recOdds,
                  selection,
                  potentialWin,
                  broker: bettingAccount!.platform,
                  brokerBetId: brokerResult.brokerBetId,
                }),
                reasoning: autoBetCheck.reason,
                confidence: prediction.confidence,
                profitImpact: -stake,
              },
            });

            // Also create a Tip for the auto-placed bet
            try {
              const tip = await prisma.tip.create({
                data: {
                  userId,
                  matchId: match.id,
                  sport: match.sport,
                  league: match.league,
                  homeTeam: match.homeTeam,
                  awayTeam: match.awayTeam,
                  selection,
                  odds: recOdds,
                  aiConfidence: prediction.confidence,
                  valueEdge: prediction.valueEdge,
                  kellyStake: prediction.kellyStake,
                  riskLevel: settings.riskLevel,
                  aiReasoning: prediction.analysis,
                  tracked: true, // auto-placed = tracked
                  commencesAt: match.commenceTime,
                },
              });

              // Send Telegram + in-app notification
              const tipAlert: TipAlert = {
                sport: match.sport,
                league: match.league,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                selection,
                odds: recOdds,
                confidence: prediction.confidence,
                valueEdge: prediction.valueEdge,
                kellyStake: prediction.kellyStake,
                riskLevel: settings.riskLevel,
                matchTime: new Date(match.commenceTime).toLocaleString(),
                matchId: match.id,
              };
              await sendTipAlert(userId, tipAlert);
            } catch (tipError) {
              console.error("[BotEngine] Failed to create tip/notification for auto-bet:", tipError);
            }

            result.betsPlaced++;
            result.totalStake += stake;
          }
        } catch (matchError) {
          console.error(`[BotEngine] Error processing match ${match.id}:`, matchError);
          result.skipped++;
        }
      }

      // Log scan summary
      if (result.betsPlaced === 0 && result.tipsGenerated === 0 && result.skipped > 0) {
        await prisma.botLog.create({
          data: {
            userId,
            action: "bot_scan",
            reasoning: `Scan completed: ${result.matches} matches found, ${result.skipped} skipped (no qualifying ${isAdvisorMode ? "tips" : "bets"})`,
          },
        });
      }

    } catch (error) {
      console.error(`[BotEngine] Scan cycle error for user ${userId}:`, error);
      result.error = error instanceof Error ? error.message : "Unknown error";
    }

    return result;
  }

  // ==================== VALIDATION ====================

  private async validatePrerequisites(userId: string): Promise<{
    valid: boolean;
    error?: string;
    connectedAccount?: { platform: string; allocatedAmount: number };
  }> {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      return { valid: false, error: "Settings not found. Please configure your settings first." };
    }

    const isAdvisorMode = settings.botMode === "advisor";

    if (!settings.autoBettingEnabled && !isAdvisorMode) {
      return { valid: false, error: "Auto-betting is disabled. Enable it first." };
    }

    // In advisor mode, no broker is required — just need settings
    if (isAdvisorMode) {
      return { valid: true };
    }

    // Auto mode requires a connected broker
    const connectedAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
    });

    if (!connectedAccount) {
      return { valid: false, error: "No connected broker account. Connect a broker and set allocation first." };
    }

    if (connectedAccount.allocatedAmount <= 0) {
      return { valid: false, error: "No allocation set. Allocate funds from your broker account first." };
    }

    return {
      valid: true,
      connectedAccount: {
        platform: connectedAccount.platform,
        allocatedAmount: connectedAccount.allocatedAmount,
      },
    };
  }

  // ==================== AUTO SETTLEMENT ====================

  /**
   * Automatically settle bets for finished matches.
   * Called periodically by the engine (every 3rd scan cycle).
   */
  private async autoSettle(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user) return 0;

    const commissionRate = user.settings?.commissionRate || 0.10;

    // Find pending bets for finished matches
    const unsettledBets = await prisma.bet.findMany({
      where: {
        userId,
        status: "pending",
        match: { status: "finished" },
      },
      include: { match: true, bettingAccount: true },
    });

    if (unsettledBets.length === 0) return 0;

    let settledCount = 0;

    for (const bet of unsettledBets) {
      if (!bet.match) continue;

      const match = bet.match;
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;

      let betWon = false;
      let resultReason = "";

      if (bet.betType === "single" || bet.betType === "accumulator_leg") {
        if (bet.selection === match.homeTeam) {
          betWon = homeScore > awayScore;
          resultReason = betWon
            ? `${match.homeTeam} won ${homeScore}-${awayScore}`
            : `${match.homeTeam} did not win (${homeScore}-${awayScore})`;
        } else if (bet.selection === match.awayTeam) {
          betWon = awayScore > homeScore;
          resultReason = betWon
            ? `${match.awayTeam} won ${awayScore}-${homeScore}`
            : `${match.awayTeam} did not win (${awayScore}-${homeScore})`;
        } else if (bet.selection === "Draw") {
          betWon = homeScore === awayScore;
          resultReason = betWon
            ? `Match drawn ${homeScore}-${awayScore}`
            : `Match not drawn (${homeScore}-${awayScore})`;
        } else if (bet.selection === "Over 2.5") {
          const totalGoals = homeScore + awayScore;
          betWon = totalGoals > 2.5;
          resultReason = betWon
            ? `Total goals ${totalGoals} > 2.5`
            : `Total goals ${totalGoals} <= 2.5`;
        } else if (bet.selection === "Under 2.5") {
          const totalGoals = homeScore + awayScore;
          betWon = totalGoals < 2.5;
          resultReason = betWon
            ? `Total goals ${totalGoals} < 2.5`
            : `Total goals ${totalGoals} >= 2.5`;
        }
      }

      const now = new Date();

      if (betWon) {
        const effectiveStake = bet.partialCashoutAmount ? bet.stake - bet.partialCashoutAmount : bet.stake;
        const grossProfit = bet.potentialWin - effectiveStake;
        const commission = grossProfit * commissionRate;
        const netProfit = grossProfit - commission;

        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: "won",
            profit: Math.round(netProfit * 100) / 100,
            commission: Math.round(commission * 100) / 100,
            settledAt: now,
            settlementReason: "match_finished",
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            balance: { increment: bet.potentialWin },
            totalProfit: { increment: netProfit },
            commissionPaid: { increment: commission },
            dailyPnl: { increment: netProfit },
            weeklyPnl: { increment: netProfit },
          },
        });

        await prisma.transaction.create({
          data: {
            userId,
            type: "bet_won",
            amount: bet.potentialWin,
            currency: "USD",
            status: "completed",
            description: `Auto-settled: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds} (profit: $${netProfit.toFixed(2)})`,
            betId: bet.id,
          },
        });

        if (commission > 0 && bet.bettingAccountId) {
          await prisma.commissionLedger.create({
            data: {
              userId,
              bettingAccountId: bet.bettingAccountId,
              betId: bet.id,
              accumulatorId: bet.accumulatorId,
              grossProfit,
              commissionRate,
              commissionAmount: commission,
              netProfit,
              status: "pending",
            },
          });
        }

        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_settled",
            betId: bet.id,
            matchId: match.id,
            accumulatorId: bet.accumulatorId,
            details: JSON.stringify({ result: "won", profit: netProfit, commission, autoSettled: true }),
            reasoning: resultReason,
            profitImpact: netProfit,
          },
        });
      } else {
        const effectiveStake = bet.partialCashoutAmount ? bet.stake - bet.partialCashoutAmount : bet.stake;

        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: "lost",
            profit: -effectiveStake,
            settledAt: now,
            settlementReason: "match_finished",
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            totalLoss: { increment: effectiveStake },
            dailyPnl: { decrement: effectiveStake },
            weeklyPnl: { decrement: effectiveStake },
          },
        });

        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_settled",
            betId: bet.id,
            matchId: match.id,
            accumulatorId: bet.accumulatorId,
            details: JSON.stringify({ result: "lost", loss: effectiveStake, autoSettled: true }),
            reasoning: resultReason,
            profitImpact: -effectiveStake,
          },
        });
      }

      settledCount++;
    }

    if (settledCount > 0) {
      console.log(`[BotEngine] Auto-settled ${settledCount} bet(s) for user ${userId}`);
    }

    return settledCount;
  }

  // ==================== AUTO CASHOUT EVALUATION ====================

  /**
   * Evaluate live bets for cashout opportunities.
   * Called periodically by the engine (every 5th scan cycle).
   * Uses the AI engine's cashout recommendation system.
   */
  private async autoCashoutEvaluation(userId: string): Promise<number> {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings?.autoCashoutEnabled) return 0;

    // Find live bets that could be cashed out
    const liveBets = await prisma.bet.findMany({
      where: {
        userId,
        status: "pending",
        isAutoPlaced: true,
        match: { status: "live" },
      },
      include: { match: true },
    });

    if (liveBets.length === 0) return 0;

    let cashoutCount = 0;

    for (const bet of liveBets) {
      if (!bet.match) continue;

      // Simple cashout evaluation based on match state
      const match = bet.match;
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;
      const minute = match.minute ?? 0;

      // Determine if the bet is winning
      let isWinning = false;
      if (bet.selection === match.homeTeam) {
        isWinning = homeScore > awayScore;
      } else if (bet.selection === match.awayTeam) {
        isWinning = awayScore > homeScore;
      } else if (bet.selection === "Draw") {
        isWinning = homeScore === awayScore;
      } else if (bet.selection === "Over 2.5") {
        isWinning = (homeScore + awayScore) > 2.5;
      } else if (bet.selection === "Under 2.5") {
        isWinning = (homeScore + awayScore) < 2.5;
      }

      // Cashout logic: if the bet is winning and we're past 70 minutes,
      // and the cashout threshold is met, execute cashout
      if (isWinning && minute >= 70) {
        const cashoutOdds = 1 + (1 / bet.odds) * (minute / 90);
        const cashoutAmount = Math.round(bet.stake * cashoutOdds * 100) / 100;

        if (cashoutAmount > bet.stake * (1 + settings.cashoutThreshold)) {
          // Execute partial or full cashout based on settings
          if (settings.partialCashoutEnabled) {
            // Partial cashout: take 50% profit, keep the rest riding
            const partialAmount = Math.round(cashoutAmount * settings.partialCashoutPercent * 100) / 100;

            await prisma.bet.update({
              where: { id: bet.id },
              data: {
                status: "partial_cashout",
                partialCashoutAmount,
                partialCashoutPercent: settings.partialCashoutPercent,
                cashoutOdds,
                cashedOutAt: new Date(),
              },
            });

            await prisma.user.update({
              where: { id: userId },
              data: {
                balance: { increment: partialAmount },
                dailyPnl: { increment: partialAmount - bet.stake * settings.partialCashoutPercent },
                weeklyPnl: { increment: partialAmount - bet.stake * settings.partialCashoutPercent },
              },
            });

            await prisma.transaction.create({
              data: {
                userId,
                type: "partial_cashout",
                amount: partialAmount,
                currency: "USD",
                status: "completed",
                description: `Auto partial cashout: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} ($${partialAmount.toFixed(2)})`,
                betId: bet.id,
              },
            });

            await prisma.botLog.create({
              data: {
                userId,
                action: "cashout_executed",
                betId: bet.id,
                matchId: match.id,
                details: JSON.stringify({
                  type: "partial",
                  amount: partialAmount,
                  percent: settings.partialCashoutPercent,
                  minute,
                  autoCashout: true,
                }),
                reasoning: `Auto partial cashout at ${minute}' - bet winning. ${Math.round(settings.partialCashoutPercent * 100)}% cashed out for $${partialAmount.toFixed(2)}`,
                profitImpact: partialAmount - bet.stake * settings.partialCashoutPercent,
              },
            });
          } else {
            // Full cashout
            await prisma.bet.update({
              where: { id: bet.id },
              data: {
                status: "cashed_out",
                cashoutAmount,
                cashoutOdds,
                profit: cashoutAmount - bet.stake,
                cashedOutAt: new Date(),
                settlementReason: "cashout",
              },
            });

            await prisma.user.update({
              where: { id: userId },
              data: {
                balance: { increment: cashoutAmount },
                totalProfit: { increment: cashoutAmount - bet.stake },
                dailyPnl: { increment: cashoutAmount - bet.stake },
                weeklyPnl: { increment: cashoutAmount - bet.stake },
              },
            });

            await prisma.transaction.create({
              data: {
                userId,
                type: "cashout",
                amount: cashoutAmount,
                currency: "USD",
                status: "completed",
                description: `Auto cashout: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} ($${cashoutAmount.toFixed(2)})`,
                betId: bet.id,
              },
            });

            await prisma.botLog.create({
              data: {
                userId,
                action: "cashout_executed",
                betId: bet.id,
                matchId: match.id,
                details: JSON.stringify({
                  type: "full",
                  amount: cashoutAmount,
                  minute,
                  autoCashout: true,
                }),
                reasoning: `Auto cashout at ${minute}' - bet winning. Full cashout for $${cashoutAmount.toFixed(2)}`,
                profitImpact: cashoutAmount - bet.stake,
              },
            });
          }

          cashoutCount++;
        }
      }
    }

    if (cashoutCount > 0) {
      console.log(`[BotEngine] Auto-cashout executed for ${cashoutCount} bet(s) for user ${userId}`);
    }

    return cashoutCount;
  }
}

// ==================== EXPORT ====================

// Export the singleton instance
export const botEngine = BotEngine.getInstance();

// Also export the class for testing
export { BotEngine };
