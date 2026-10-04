import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { sumTicketStake } from "@/lib/bet-accounting";
import { getRiskPeriodStarts } from "@/lib/risk-period-pnl";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const bets = await prisma.bet.findMany({
      where,
      include: {
        match: true,
        bettingAccount: true,
      },
      orderBy: {
        placedAt: "desc",
      },
    });

    return NextResponse.json(bets);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error fetching bets:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json();
    const {
      bettingAccountId: requestedAccountId,
      matchId,
      betType,
      selection,
      odds: quotedOdds,
      stake: rawStake,
      aiConfidence,
      aiReasoning,
    } = body;

    const stake = Number(rawStake);
    if (
      typeof matchId !== "string" ||
      !matchId ||
      typeof betType !== "string" ||
      !betType ||
      typeof selection !== "string" ||
      !selection ||
      !Number.isFinite(stake) ||
      stake <= 0
    ) {
      return NextResponse.json(
        { error: "Match, market, selection, and a positive stake are required" },
        { status: 400 }
      );
    }

    const [match, settings, user] = await Promise.all([
      prisma.match.findUnique({ where: { id: matchId } }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (!["upcoming", "live"].includes(match.status)) {
      return NextResponse.json(
        { error: "Betting is closed for this match" },
        { status: 409 }
      );
    }

    if (settings?.brokerMode === "real") {
      return NextResponse.json(
        {
          error:
            "Quick-bet recording is disabled in real-broker mode. Use the broker execution flow.",
        },
        { status: 409 }
      );
    }

    const normalizedSelection = selection.trim().toLowerCase();
    let authoritativeOdds: number | null = null;
    let canonicalSelection = selection.trim();

    if (betType === "match_winner" || betType === "single") {
      if (normalizedSelection === match.homeTeam.trim().toLowerCase()) {
        authoritativeOdds = match.homeOdds;
        canonicalSelection = match.homeTeam;
      } else if (normalizedSelection === match.awayTeam.trim().toLowerCase()) {
        authoritativeOdds = match.awayOdds;
        canonicalSelection = match.awayTeam;
      } else if (normalizedSelection === "draw") {
        authoritativeOdds = match.drawOdds;
        canonicalSelection = "Draw";
      }
    } else if (betType === "over_under") {
      const line = match.overUnderLine ?? 2.5;
      if (
        normalizedSelection === "over" ||
        normalizedSelection === `over ${line}`.toLowerCase()
      ) {
        authoritativeOdds = match.overOdds;
        canonicalSelection = `Over ${line}`;
      } else if (
        normalizedSelection === "under" ||
        normalizedSelection === `under ${line}`.toLowerCase()
      ) {
        authoritativeOdds = match.underOdds;
        canonicalSelection = `Under ${line}`;
      }
    } else {
      return NextResponse.json(
        { error: "This market is not available for direct betting yet" },
        { status: 409 }
      );
    }

    if (
      authoritativeOdds == null ||
      !Number.isFinite(authoritativeOdds) ||
      authoritativeOdds <= 1
    ) {
      return NextResponse.json(
        { error: "Real bookmaker odds are not available for this selection" },
        { status: 409 }
      );
    }

    if (quotedOdds != null) {
      const clientOdds = Number(quotedOdds);
      if (!Number.isFinite(clientOdds) || clientOdds <= 1) {
        return NextResponse.json({ error: "Invalid quoted odds" }, { status: 400 });
      }
      if (Math.abs(clientOdds - authoritativeOdds) > 0.0001) {
        return NextResponse.json(
          {
            error: "Odds changed. Please review the current price before placing the bet.",
            currentOdds: authoritativeOdds,
          },
          { status: 409 }
        );
      }
    }

    const maxBetAmount = settings?.maxBetAmount ?? 100;
    if (stake > maxBetAmount) {
      return NextResponse.json(
        { error: `Stake exceeds your maximum bet amount of ${maxBetAmount}` },
        { status: 400 }
      );
    }

    if (stake > user.balance) {
      return NextResponse.json(
        { error: "Insufficient demo balance for this stake" },
        { status: 400 }
      );
    }

    const { dayStart: todayStart } = getRiskPeriodStarts(settings?.timezone);
    const todayBets = await prisma.bet.findMany({
      where: { userId, placedAt: { gte: todayStart } },
      select: { stake: true, accumulatorId: true },
    });
    const dailyBetLimit = settings?.dailyBetLimit ?? 500;
    const usedToday = sumTicketStake(todayBets);
    if (usedToday + stake > dailyBetLimit) {
      return NextResponse.json(
        {
          error: "Daily bet limit would be exceeded",
          dailyBetLimit,
          usedToday,
        },
        { status: 409 }
      );
    }

    let bettingAccountId = requestedAccountId as string | undefined;
    if (bettingAccountId) {
      const ownedAccount = await prisma.bettingAccount.findFirst({
        where: { id: bettingAccountId, userId },
        select: { id: true, platform: true },
      });
      if (!ownedAccount) {
        return NextResponse.json(
          { error: "Betting account not found for this user" },
          { status: 404 }
        );
      }
      if (ownedAccount.platform !== "simulated") {
        return NextResponse.json(
          {
            error:
              "Direct quick bets are simulated only. Use the broker execution flow for connected accounts.",
          },
          { status: 409 }
        );
      }
    } else {
      let simulatedAccount = await prisma.bettingAccount.findFirst({
        where: { userId, platform: "simulated" },
      });
      if (!simulatedAccount) {
        simulatedAccount = await prisma.bettingAccount.create({
          data: {
            userId,
            platform: "simulated",
            accountId: `sim_${userId.slice(0, 8)}_${Date.now()}`,
            accountName: "Simulated Account",
            balance: 0,
            currency: "USD",
            isConnected: true,
            brokerType: "manual",
            lastSyncedAt: new Date(),
          },
        });
      }
      bettingAccountId = simulatedAccount.id;
    }

    const potentialWin = Math.round(authoritativeOdds * stake * 100) / 100;
    const safeConfidence =
      typeof aiConfidence === "number" && Number.isFinite(aiConfidence)
        ? Math.min(1, Math.max(0, aiConfidence))
        : 0;
    const safeReasoning =
      typeof aiReasoning === "string" ? aiReasoning.slice(0, 4000) : null;

    const bet = await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: { id: userId, balance: { gte: stake } },
        data: { balance: { decrement: stake } },
      });
      if (debit.count !== 1) {
        throw new Error("INSUFFICIENT_DEMO_BALANCE");
      }

      const created = await tx.bet.create({
        data: {
          userId,
          bettingAccountId: bettingAccountId!,
          matchId,
          betType,
          selection: canonicalSelection,
          odds: authoritativeOdds!,
          stake,
          potentialWin,
          isAutoPlaced: false,
          aiConfidence: safeConfidence,
          aiReasoning: safeReasoning,
        },
        include: {
          match: true,
          bettingAccount: true,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "bet_placed",
          amount: -stake,
          currency: created.bettingAccount?.currency || "USD",
          status: "completed",
          description: `${created.match?.homeTeam || "Match"} vs ${created.match?.awayTeam || "Opponent"} - ${canonicalSelection}`,
          betId: created.id,
        },
      });

      return created;
    });

    return NextResponse.json(bet, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_DEMO_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient demo balance for this stake" },
        { status: 409 }
      );
    }
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
