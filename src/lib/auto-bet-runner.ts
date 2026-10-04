import { prisma } from "./db";
import {
  analyzeMatch,
  checkRiskLimits,
  isWithinBetSchedule,
  shouldAutoBet,
} from "./ai-engine-v2";
import { placeBetOnBroker } from "./broker-integration";
import {
  AutoPlacementAccountingError,
  recordAutoAccumulatorPlacement,
  recordAutoSinglePlacement,
} from "./auto-bet-placement";
import { sumTicketStake } from "./bet-accounting";
import { getRiskPeriodStarts } from "./risk-period-pnl";

export type AutoBetPlaced = {
  matchId: string;
  selection: string;
  odds: number;
  stake: number;
  confidence: number;
  reasoning: string;
  brokerBetId?: string;
};

export type AutoBetCycleResult = {
  statusCode: number;
  betsPlaced: number;
  bets: AutoBetPlaced[];
  matchesScanned: number;
  skipped: number;
  dailyStake: number;
  remainingDailyLimit: number;
  allocationUsed: number;
  remainingAllocation: number;
  broker?: string;
  currency?: string;
  message?: string;
  error?: string;
  code?: string;
  shouldStop?: boolean;
  stopReason?: string;
};

const runningCycles = new Set<string>();

const SPORT_CATEGORY_MAP: Record<string, string[]> = {
  football: [
    "football",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie",
    "soccer_turkey_super_league",
    "soccer_belgium_first_div",
    "soccer_scotland_prem",
    "soccer_championship",
    "soccer_league_one",
    "soccer_league_two",
    "soccer_efa_champions_league",
    "soccer_efa_europa_league",
    "soccer_efa_conference_league",
    "soccer_mls",
    "soccer_br_serie_a",
    "soccer_argentina_primera",
    "soccer_a_league",
    "soccer_j_league",
    "soccer_k_league",
    "soccer_china_super",
    "soccer_sa_aa",
    "soccer_kenya_prem",
    "soccer_ghana_prem",
    "soccer_nigeria_npfl",
  ],
  soccer: [
    "football",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie",
    "soccer_turkey_super_league",
    "soccer_belgium_first_div",
    "soccer_scotland_prem",
    "soccer_championship",
    "soccer_league_one",
    "soccer_league_two",
    "soccer_efa_champions_league",
    "soccer_efa_europa_league",
    "soccer_efa_conference_league",
    "soccer_mls",
    "soccer_br_serie_a",
    "soccer_argentina_primera",
    "soccer_a_league",
    "soccer_j_league",
    "soccer_k_league",
    "soccer_china_super",
    "soccer_sa_aa",
    "soccer_kenya_prem",
    "soccer_ghana_prem",
    "soccer_nigeria_npfl",
  ],
  basketball: [
    "basketball",
    "basketball_nba",
    "basketball_ncaab",
    "basketball_euroleague",
    "basketball_nbl",
  ],
  tennis: [
    "tennis",
    "tennis_atp_australian_open",
    "tennis_atp_french_open",
    "tennis_atp_wimbledon",
    "tennis_atp_us_open",
    "tennis_atp_masters",
    "tennis_wta_masters",
  ],
  americanfootball: [
    "americanfootball",
    "americanfootball_nfl",
    "americanfootball_ncaaf",
  ],
  cricket: ["cricket", "cricket_ipl", "cricket_big_bash", "cricket_caribbean_prem"],
  rugby: ["rugby", "rugby_union_six_nations", "rugby_union_prem"],
  icehockey: ["icehockey", "icehockey_nhl", "icehockey_sweden_hockey_league"],
  mma: ["mma", "mma_mixed_martial_arts"],
  boxing: ["boxing", "boxing_boxing"],
  motorsport: ["motorsport", "motorsport_f1"],
};

function expandSportKeys(value: string | null | undefined): string[] {
  const requested = (value || "football")
    .split(",")
    .map((sport) => sport.trim().toLowerCase())
    .filter(Boolean);
  const expanded = new Set<string>();

  for (const sport of requested.length ? requested : ["football"]) {
    const mapped = SPORT_CATEGORY_MAP[sport];
    if (mapped) mapped.forEach((key) => expanded.add(key));
    else expanded.add(sport);
  }

  return Array.from(expanded);
}

function recommendedSelection(
  recommended: string,
  homeTeam: string,
  awayTeam: string,
  overUnderLine = 2.5
) {
  return recommended === "home"
    ? homeTeam
    : recommended === "away"
      ? awayTeam
      : recommended === "draw"
        ? "Draw"
        : recommended === "over"
          ? `Over ${overUnderLine}`
          : `Under ${overUnderLine}`;
}

function emptyResult(overrides: Partial<AutoBetCycleResult> = {}): AutoBetCycleResult {
  return {
    statusCode: 200,
    betsPlaced: 0,
    bets: [],
    matchesScanned: 0,
    skipped: 0,
    dailyStake: 0,
    remainingDailyLimit: 0,
    allocationUsed: 0,
    remainingAllocation: 0,
    ...overrides,
  };
}

/**
 * Execute one atomic Demo AUTO scan for a user.
 *
 * This is the single execution implementation shared by the authenticated API
 * and the background scheduler. Real mode remains fail-closed until a genuine
 * broker adapter returns verifiable immutable execution identifiers.
 */
export async function runAutoBetCycle(userId: string): Promise<AutoBetCycleResult> {
  if (runningCycles.has(userId)) {
    return emptyResult({
      statusCode: 409,
      error: "An auto-bet scan is already running for this user",
      code: "AUTO_CYCLE_IN_PROGRESS",
    });
  }

  runningCycles.add(userId);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return emptyResult({
        statusCode: 404,
        error: "User or settings not found",
        code: "SETTINGS_MISSING",
        shouldStop: true,
        stopReason: "settings_missing",
      });
    }

    const settings = user.settings;

    if (settings.botMode !== "auto") {
      return emptyResult({
        statusCode: 409,
        error: "Auto-bet execution requires AUTO bot mode",
        code: "AUTO_MODE_DISABLED",
        shouldStop: true,
        stopReason: "auto_mode_disabled",
      });
    }

    if (settings.brokerMode === "real") {
      return emptyResult({
        statusCode: 409,
        error:
          "Automated Real-mode execution is disabled until verified broker bet execution is enabled.",
        code: "REAL_AUTO_EXECUTION_DISABLED",
        shouldStop: true,
        stopReason: "real_auto_execution_disabled",
      });
    }

    if (!settings.autoBettingEnabled) {
      return emptyResult({
        statusCode: 409,
        error: "Auto-betting is disabled",
        code: "AUTO_BETTING_DISABLED",
        shouldStop: true,
        stopReason: "auto_betting_disabled",
      });
    }

    if (
      !isWithinBetSchedule(
        settings.betScheduleStart,
        settings.betScheduleEnd,
        settings.timezone
      )
    ) {
      return emptyResult({
        message: `Outside betting schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd} ${settings.timezone || "local"})`,
        code: "OUTSIDE_BET_SCHEDULE",
      });
    }

    const riskCheck = checkRiskLimits(user.dailyPnl, user.weeklyPnl, {
      stopLossDaily: settings.stopLossDaily,
      stopLossWeekly: settings.stopLossWeekly,
      profitTargetDaily: settings.profitTargetDaily,
      profitTargetWeekly: settings.profitTargetWeekly,
    });

    if (!riskCheck.canBet) {
      const stopReason =
        user.dailyPnl <= -settings.stopLossDaily ? "stop_loss" : "profit_target";
      return emptyResult({
        statusCode: 409,
        error: riskCheck.reason,
        code: stopReason.toUpperCase(),
        shouldStop: true,
        stopReason,
      });
    }

    const bettingAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
      orderBy: { allocatedAmount: "desc" },
    });

    if (!bettingAccount) {
      return emptyResult({
        statusCode: 409,
        error: "No connected betting account found. Connect a Demo broker and set allocation.",
        code: "NO_CONNECTED_ACCOUNT",
        shouldStop: true,
        stopReason: "no_allocation",
      });
    }

    if (bettingAccount.allocatedAmount <= 0) {
      return emptyResult({
        statusCode: 409,
        error: "No allocation set. Allocate Demo funds before AUTO execution.",
        code: "NO_ALLOCATION",
        shouldStop: true,
        stopReason: "no_allocation",
        broker: bettingAccount.platform,
        currency: bettingAccount.currency || "USD",
      });
    }

    const activeAllocation = await prisma.allocation.findFirst({
      where: {
        userId,
        bettingAccountId: bettingAccount.id,
        status: "active",
      },
    });

    const availableAllocation =
      activeAllocation?.remainingAmount ?? bettingAccount.allocatedAmount;

    const { dayStart: todayStart } = getRiskPeriodStarts(settings.timezone);
    const todayBets = await prisma.bet.findMany({
      where: { userId, placedAt: { gte: todayStart } },
      select: { matchId: true, stake: true, accumulatorId: true },
    });
    const dailyStake = sumTicketStake(todayBets);
    const remainingDailyLimit = Math.max(
      0,
      Math.min(
        settings.dailyBetLimit - dailyStake,
        availableAllocation,
        user.balance
      )
    );

    if (dailyStake >= settings.dailyBetLimit) {
      return emptyResult({
        dailyStake,
        remainingDailyLimit: 0,
        remainingAllocation: availableAllocation,
        broker: bettingAccount.platform,
        currency: bettingAccount.currency || "USD",
        message: "Daily bet limit reached",
        code: "DAILY_LIMIT_REACHED",
      });
    }

    if (remainingDailyLimit < 5) {
      return emptyResult({
        dailyStake,
        remainingDailyLimit,
        remainingAllocation: availableAllocation,
        broker: bettingAccount.platform,
        currency: bettingAccount.currency || "USD",
        message: "Insufficient bankroll, allocation, or daily limit remaining",
        code: "INSUFFICIENT_AVAILABLE_STAKE",
      });
    }

    const existingBetMatchIds = todayBets.map((bet) => bet.matchId);
    const sportFilter = expandSportKeys(settings.preferredSports);
    const upcomingMatches = await prisma.match.findMany({
      where: {
        status: "upcoming",
        sport: { in: sportFilter },
        commenceTime: { gte: new Date() },
        homeOdds: { gt: 1 },
        awayOdds: { gt: 1 },
        id: { notIn: existingBetMatchIds },
      },
      orderBy: { commenceTime: "asc" },
      take: 20,
    });

    if (upcomingMatches.length === 0) {
      return emptyResult({
        dailyStake,
        remainingDailyLimit,
        remainingAllocation: availableAllocation,
        broker: bettingAccount.platform,
        currency: bettingAccount.currency || "USD",
        message: "No suitable matches found",
        code: "NO_SUITABLE_MATCHES",
      });
    }

    const betsPlaced: AutoBetPlaced[] = [];
    let skipped = 0;
    const accumulatorLegs: Array<{
      matchId: string;
      match: NonNullable<(typeof upcomingMatches)[0]>;
      prediction: ReturnType<typeof analyzeMatch>;
      selection: string;
      odds: number;
    }> = [];

    for (const match of upcomingMatches) {
      try {
        const [homeTeamStats, awayTeamStats] = await Promise.all([
          prisma.teamStats.findFirst({
            where: { teamName: match.homeTeam, sport: match.sport },
          }),
          prisma.teamStats.findFirst({
            where: { teamName: match.awayTeam, sport: match.sport },
          }),
        ]);

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
          user.bankroll,
          settings.kellyFraction
        );

        const autoBetCheck = shouldAutoBet(
          prediction,
          {
            minOddsThreshold: settings.minOddsThreshold,
            maxOddsThreshold: settings.maxOddsThreshold,
            minAiConfidence: settings.minAiConfidence,
            minEdgeThreshold: settings.minEdgeThreshold,
            riskLevel: settings.riskLevel,
            preferredSports: settings.preferredSports,
          },
          match.sport
        );

        const recOdds =
          prediction.recommended === "home"
            ? match.homeOdds
            : prediction.recommended === "away"
              ? match.awayOdds
              : prediction.recommended === "draw"
                ? match.drawOdds
                : prediction.recommended === "over"
                  ? match.overOdds
                  : prediction.recommended === "under"
                    ? match.underOdds
                    : null;

        if (
          recOdds == null ||
          !Number.isFinite(recOdds) ||
          recOdds <= 1 ||
          recOdds < settings.minOddsThreshold ||
          recOdds > settings.maxOddsThreshold ||
          !autoBetCheck.shouldPlace
        ) {
          skipped++;
          continue;
        }

        const betTypes = settings.betTypes.split(",");
        const selection = recommendedSelection(
          prediction.recommended,
          match.homeTeam,
          match.awayTeam,
          match.overUnderLine ?? 2.5
        );

        if (betTypes.includes("single")) {
          const usedThisCycle = betsPlaced.reduce((sum, bet) => sum + bet.stake, 0);
          const stake = Math.min(
            autoBetCheck.suggestedStake || settings.maxBetAmount * 0.5,
            settings.maxBetAmount,
            remainingDailyLimit - usedThisCycle
          );

          if (stake >= 5) {
            const potentialWin = Math.round(stake * recOdds * 100) / 100;
            const brokerResult = await placeBetOnBroker(
              bettingAccount.platform,
              bettingAccount.accessToken || "",
              {
                matchId: match.id,
                selection,
                odds: recOdds,
                stake,
                betType: "single",
              }
            );

            await recordAutoSinglePlacement({
              userId,
              bettingAccountId: bettingAccount.id,
              activeAllocationId: activeAllocation?.id,
              matchId: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              selection,
              odds: recOdds,
              stake,
              potentialWin,
              brokerBetId: brokerResult.brokerBetId,
              confidence: prediction.confidence,
              reasoning: autoBetCheck.reason,
              aiModelUsed: "v2_ensemble",
              kellyStake: prediction.kellyStake,
              valueEdge: prediction.valueEdge,
              riskScore: prediction.riskScore,
              aiHomeWinProb: prediction.homeWinProb,
              aiDrawProb: prediction.drawProb,
              aiAwayWinProb: prediction.awayWinProb,
              aiRecommended: prediction.recommended,
              aiAnalysis: prediction.analysis,
              aiRiskScore: prediction.riskScore,
              aiValueEdge: prediction.valueEdge,
              aiKellyStake: prediction.kellyStake,
            });

            betsPlaced.push({
              matchId: match.id,
              selection,
              odds: recOdds,
              stake,
              confidence: prediction.confidence,
              reasoning: autoBetCheck.reason,
              brokerBetId: brokerResult.brokerBetId,
            });
          }
        }

        if (betTypes.includes("accumulator") && prediction.confidence > 0.65) {
          accumulatorLegs.push({
            matchId: match.id,
            match,
            prediction,
            selection,
            odds: recOdds,
          });
        }
      } catch (error) {
        skipped++;
        if (error instanceof AutoPlacementAccountingError) {
          if (
            [
              "INSUFFICIENT_INTERNAL_BALANCE",
              "INSUFFICIENT_ALLOCATION",
              "INSUFFICIENT_BROKER_ALLOCATION",
            ].includes(error.code)
          ) {
            break;
          }
          continue;
        }
        console.error(`[AutoBetRunner] Match ${match.id} failed:`, error);
      }
    }

    if (
      accumulatorLegs.length >= 2 &&
      accumulatorLegs.length <= settings.maxAccumulatorLegs
    ) {
      const singlesStake = betsPlaced.reduce((sum, bet) => sum + bet.stake, 0);
      const accaStake = Math.min(
        settings.maxBetAmount * 0.3,
        remainingDailyLimit - singlesStake,
        Math.max(0, availableAllocation - singlesStake) * 0.3,
        Math.max(0, user.balance - singlesStake) * 0.3
      );

      if (accaStake >= 5) {
        try {
          const totalOdds = accumulatorLegs.reduce(
            (product, leg) => product * leg.odds,
            1
          );
          const roundedTotalOdds = Math.round(totalOdds * 100) / 100;
          const basePotentialWin = Math.round(accaStake * totalOdds * 100) / 100;
          const bonusThresholds = [
            { legs: 4, bonus: 5 },
            { legs: 5, bonus: 10 },
            { legs: 6, bonus: 20 },
          ];
          let bonusPercent = 0;
          for (const threshold of bonusThresholds) {
            if (accumulatorLegs.length >= threshold.legs) bonusPercent = threshold.bonus;
          }
          const totalPotentialWin = Math.round(
            (basePotentialWin + basePotentialWin * (bonusPercent / 100)) * 100
          ) / 100;

          const brokerResult = await placeBetOnBroker(
            bettingAccount.platform,
            bettingAccount.accessToken || "",
            {
              matchId: accumulatorLegs[0].matchId,
              selection: `${accumulatorLegs.length}-leg accumulator`,
              odds: roundedTotalOdds,
              stake: accaStake,
              betType: "accumulator",
            }
          );

          const placement = await recordAutoAccumulatorPlacement({
            userId,
            bettingAccountId: bettingAccount.id,
            activeAllocationId: activeAllocation?.id,
            stake: accaStake,
            totalOdds: roundedTotalOdds,
            potentialWin: totalPotentialWin,
            bonusPercent,
            brokerBetId: brokerResult.brokerBetId,
            legs: accumulatorLegs.map((leg) => ({
              matchId: leg.matchId,
              homeTeam: leg.match.homeTeam,
              awayTeam: leg.match.awayTeam,
              selection: leg.selection,
              odds: leg.odds,
              confidence: leg.prediction.confidence,
              reasoning: leg.prediction.analysis,
              kellyStake: leg.prediction.kellyStake,
              valueEdge: leg.prediction.valueEdge,
              riskScore: leg.prediction.riskScore,
            })),
          });

          betsPlaced.push({
            matchId: "accumulator",
            selection: `${accumulatorLegs.length}-leg accumulator`,
            odds: roundedTotalOdds,
            stake: accaStake,
            confidence: placement.averageConfidence,
            reasoning: `Auto-placed ${accumulatorLegs.length}-leg accumulator`,
            brokerBetId: brokerResult.brokerBetId,
          });
        } catch (error) {
          skipped++;
          if (!(error instanceof AutoPlacementAccountingError)) {
            console.error("[AutoBetRunner] Accumulator placement failed:", error);
          }
        }
      }
    }

    const newStake = betsPlaced.reduce((sum, bet) => sum + bet.stake, 0);
    return emptyResult({
      betsPlaced: betsPlaced.length,
      bets: betsPlaced,
      matchesScanned: upcomingMatches.length,
      skipped,
      dailyStake: Math.round((dailyStake + newStake) * 100) / 100,
      remainingDailyLimit: Math.max(
        0,
        Math.round((remainingDailyLimit - newStake) * 100) / 100
      ),
      allocationUsed: newStake,
      remainingAllocation: Math.max(
        0,
        Math.round((availableAllocation - newStake) * 100) / 100
      ),
      broker: bettingAccount.platform,
      currency: bettingAccount.currency || "USD",
      message:
        betsPlaced.length > 0
          ? `Placed ${betsPlaced.length} wager ticket(s)`
          : "No qualifying wagers placed",
    });
  } finally {
    runningCycles.delete(userId);
  }
}
