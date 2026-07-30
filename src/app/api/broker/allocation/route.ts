import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { calculateAllocation, fetchBrokerBalance } from "@/lib/broker-integration";

/**
 * Broker Allocation API
 * POST /api/broker/allocation - Set or update allocation from broker account
 * GET /api/broker/allocation - Get allocation status
 * DELETE /api/broker/allocation - Release allocation back to broker
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { bettingAccountId, amount } = body;

    if (!bettingAccountId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Betting account ID and positive amount required" }, { status: 400 });
    }

    // Verify the account belongs to the user
    const account = await prisma.bettingAccount.findFirst({
      where: { id: bettingAccountId, userId },
    });

    if (!account) {
      return NextResponse.json({ error: "Betting account not found" }, { status: 404 });
    }

    if (!account.isConnected) {
      return NextResponse.json({ error: "Broker account is not connected" }, { status: 400 });
    }

    // Check if there are active bets using the current allocation
    const activeBets = await prisma.bet.findMany({
      where: {
        userId,
        bettingAccountId,
        status: { in: ["pending", "partial_cashout"] },
      },
    });

    const activeBetStake = activeBets.reduce((sum, b) => sum + b.stake, 0);

    // Fetch current broker balance
    const balance = await fetchBrokerBalance(account.platform, account.accessToken || "");

    // Calculate allocation
    const allocation = calculateAllocation(
      balance.total || account.balance,
      amount,
      activeBetStake
    );

    if (allocation.allocated < amount && activeBetStake > 0) {
      return NextResponse.json({
        error: "Cannot allocate requested amount - insufficient available balance after accounting for active bets",
        available: allocation.available,
        locked: allocation.locked,
        activeBetStake,
      }, { status: 400 });
    }

    // Create allocation record
    const allocationRecord = await prisma.allocation.create({
      data: {
        userId,
        bettingAccountId,
        amount: allocation.allocated,
        previousAmount: account.allocatedAmount,
        status: "active",
        usedAmount: activeBetStake,
        remainingAmount: allocation.available,
        activatedAt: new Date(),
      },
    });

    // Update the betting account with new allocation
    const updatedAccount = await prisma.bettingAccount.update({
      where: { id: bettingAccountId },
      data: {
        allocatedAmount: allocation.allocated,
        maxAllocation: Math.max(account.maxAllocation, allocation.allocated),
        allocationLock: activeBetStake > 0,
        balance: balance.total || account.balance,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      allocation: {
        id: allocationRecord.id,
        amount: allocationRecord.amount,
        usedAmount: allocationRecord.usedAmount,
        remainingAmount: allocationRecord.remainingAmount,
        status: allocationRecord.status,
        activatedAt: allocationRecord.activatedAt,
      },
      account: {
        id: updatedAccount.id,
        allocatedAmount: updatedAccount.allocatedAmount,
        balance: updatedAccount.balance,
        allocationLock: updatedAccount.allocationLock,
      },
      summary: {
        totalBalance: balance.total || account.balance,
        allocated: allocation.allocated,
        available: allocation.available,
        lockedInBets: allocation.locked,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Allocation error:", error);
    return NextResponse.json({ error: "Failed to set allocation" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const bettingAccountId = searchParams.get("bettingAccountId");

    const whereClause: Record<string, unknown> = { userId };
    if (bettingAccountId) {
      whereClause.bettingAccountId = bettingAccountId;
    }

    const allocations = await prisma.allocation.findMany({
      where: whereClause,
      include: {
        bettingAccount: {
          select: {
            id: true,
            platform: true,
            accountName: true,
            balance: true,
            allocatedAmount: true,
            allocationLock: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const activeAllocations = allocations.filter((a) => a.status === "active");
    const totalAllocated = activeAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalUsed = activeAllocations.reduce((sum, a) => sum + a.usedAmount, 0);
    const totalRemaining = activeAllocations.reduce((sum, a) => sum + a.remainingAmount, 0);
    const totalProfit = activeAllocations.reduce((sum, a) => sum + a.profitFromAlloc, 0);
    const totalCommission = activeAllocations.reduce((sum, a) => sum + a.commissionFromAlloc, 0);

    return NextResponse.json({
      allocations,
      summary: {
        totalAllocated: Math.round(totalAllocated * 100) / 100,
        totalUsed: Math.round(totalUsed * 100) / 100,
        totalRemaining: Math.round(totalRemaining * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        activeCount: activeAllocations.length,
        netAfterCommission: Math.round((totalProfit - totalCommission) * 100) / 100,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Allocation fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch allocations" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { allocationId, bettingAccountId } = body;

    if (!allocationId && !bettingAccountId) {
      return NextResponse.json({ error: "Allocation ID or betting account ID required" }, { status: 400 });
    }

    // Find the active allocation
    const whereClause: Record<string, unknown> = { userId, status: "active" };
    if (allocationId) whereClause.id = allocationId;
    if (bettingAccountId) whereClause.bettingAccountId = bettingAccountId;

    const allocation = await prisma.allocation.findFirst({ where: whereClause });

    if (!allocation) {
      return NextResponse.json({ error: "No active allocation found" }, { status: 404 });
    }

    // Check for active bets
    const activeBets = await prisma.bet.findMany({
      where: {
        userId,
        bettingAccountId: allocation.bettingAccountId,
        status: { in: ["pending", "partial_cashout"] },
      },
    });

    if (activeBets.length > 0) {
      return NextResponse.json({
        error: "Cannot release allocation while there are active bets",
        activeBets: activeBets.length,
        activeBetStake: activeBets.reduce((sum, b) => sum + b.stake, 0),
      }, { status: 400 });
    }

    // Release the allocation
    await prisma.allocation.update({
      where: { id: allocation.id },
      data: {
        status: "released",
        releasedAt: new Date(),
        remainingAmount: 0,
      },
    });

    // Update the betting account
    await prisma.bettingAccount.update({
      where: { id: allocation.bettingAccountId },
      data: {
        allocatedAmount: 0,
        allocationLock: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Allocation released successfully",
      releasedAmount: allocation.amount,
      profitFromAlloc: allocation.profitFromAlloc,
      commissionFromAlloc: allocation.commissionFromAlloc,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Allocation release error:", error);
    return NextResponse.json({ error: "Failed to release allocation" }, { status: 500 });
  }
}
