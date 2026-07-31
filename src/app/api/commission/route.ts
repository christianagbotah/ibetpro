import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { calculateCommission, transferCommissionToAdmin } from "@/lib/broker-integration";
import { config } from "@/lib/config";

/**
 * Commission API
 * POST /api/commission - Process commission for a settled bet (auto-called by settle/cashout)
 * GET /api/commission - Get commission ledger for user or admin
 * POST /api/commission/transfer - Trigger manual transfer of pending commissions to admin
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { action, bettingAccountId, betId, accumulatorId, grossProfit } = body;

    // Action: process commission for a specific bet
    if (action === "process" && bettingAccountId && grossProfit > 0) {
      // Get user settings for commission rate
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      const commissionRate = userSettings?.commissionRate || config.commission.defaultRate;

      // Calculate commission
      const commission = calculateCommission(grossProfit, commissionRate);

      // Create commission ledger entry
      const ledgerEntry = await prisma.commissionLedger.create({
        data: {
          userId,
          bettingAccountId,
          betId: betId || null,
          accumulatorId: accumulatorId || null,
          grossProfit: commission.grossProfit,
          commissionRate,
          commissionAmount: commission.commission,
          netProfit: commission.netProfit,
          status: "pending",
        },
      });

      // Update the user's commission paid
      await prisma.user.update({
        where: { id: userId },
        data: {
          commissionPaid: { increment: commission.commission },
          totalProfit: { increment: commission.netProfit },
        },
      });

      // Create transaction for commission deduction
      await prisma.transaction.create({
        data: {
          userId,
          type: "commission",
          amount: -commission.commission,
          currency: "USD",
          status: "completed",
          description: `Commission ${Math.round(commissionRate * 100)}% on $${grossProfit.toFixed(2)} profit`,
          betId: betId || undefined,
          accumulatorId: accumulatorId || undefined,
        },
      });

      // Update the allocation if exists
      const activeAllocation = await prisma.allocation.findFirst({
        where: { userId, bettingAccountId, status: "active" },
      });

      if (activeAllocation) {
        await prisma.allocation.update({
          where: { id: activeAllocation.id },
          data: {
            profitFromAlloc: { increment: commission.grossProfit },
            commissionFromAlloc: { increment: commission.commission },
          },
        });
      }

      // Try auto-transfer to admin
      const adminSettings = await prisma.adminSettings.findFirst();
      if (adminSettings?.autoCommissionTransfer) {
        const account = await prisma.bettingAccount.findUnique({
          where: { id: bettingAccountId },
        });

        if (account?.accessToken && adminSettings.adminWalletAddress) {
          const transferResult = await transferCommissionToAdmin(
            account.platform,
            account.accessToken,
            commission.commission,
            adminSettings.adminWalletAddress,
            ledgerEntry.id
          );

          if (transferResult.success) {
            await prisma.commissionLedger.update({
              where: { id: ledgerEntry.id },
              data: {
                status: "transferred",
                transferRef: transferResult.transferRef,
                transferredAt: new Date(),
              },
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        commission: {
          id: ledgerEntry.id,
          grossProfit: commission.grossProfit,
          commissionRate,
          commissionAmount: commission.commission,
          netProfit: commission.netProfit,
          status: ledgerEntry.status,
        },
      });
    }

    // Action: transfer all pending commissions to admin
    if (action === "transfer_all") {
      const pendingCommissions = await prisma.commissionLedger.findMany({
        where: { userId, status: "pending" },
        include: { bettingAccount: true },
      });

      const adminSettings = await prisma.adminSettings.findFirst();
      const minPayout = adminSettings?.minimumCommissionPayout || 10;

      const totalPending = pendingCommissions.reduce((sum, c) => sum + c.commissionAmount, 0);

      if (totalPending < minPayout) {
        return NextResponse.json({
          message: `Total pending commission ($${totalPending.toFixed(2)}) below minimum payout ($${minPayout})`,
          totalPending,
          minimumPayout: minPayout,
        });
      }

      let transferred = 0;
      let failed = 0;

      for (const entry of pendingCommissions) {
        if (!entry.bettingAccount.accessToken || !adminSettings?.adminWalletAddress) {
          await prisma.commissionLedger.update({
            where: { id: entry.id },
            data: { status: "failed", failureReason: "No access token or admin wallet" },
          });
          failed++;
          continue;
        }

        const result = await transferCommissionToAdmin(
          entry.bettingAccount.platform,
          entry.bettingAccount.accessToken,
          entry.commissionAmount,
          adminSettings.adminWalletAddress,
          entry.id
        );

        if (result.success) {
          await prisma.commissionLedger.update({
            where: { id: entry.id },
            data: {
              status: "transferred",
              transferRef: result.transferRef,
              transferredAt: new Date(),
            },
          });
          transferred++;
        } else {
          await prisma.commissionLedger.update({
            where: { id: entry.id },
            data: { status: "failed", failureReason: result.error },
          });
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        transferred,
        failed,
        totalAmount: totalPending,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Commission error:", error);
    return NextResponse.json({ error: "Failed to process commission" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const period = searchParams.get("period") || "all"; // "all" | "daily" | "weekly" | "monthly"

    const whereClause: Record<string, unknown> = { userId };
    if (status) whereClause.status = status;

    if (period !== "all") {
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case "daily":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "weekly":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }
      whereClause.createdAt = { gte: startDate };
    }

    const ledger = await prisma.commissionLedger.findMany({
      where: whereClause,
      include: {
        bettingAccount: {
          select: { platform: true, accountName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalGrossProfit = ledger.reduce((sum, c) => sum + c.grossProfit, 0);
    const totalCommission = ledger.reduce((sum, c) => sum + c.commissionAmount, 0);
    const totalNetProfit = ledger.reduce((sum, c) => sum + c.netProfit, 0);
    const pendingCommission = ledger.filter((c) => c.status === "pending").reduce((sum, c) => sum + c.commissionAmount, 0);
    const transferredCommission = ledger.filter((c) => c.status === "transferred").reduce((sum, c) => sum + c.commissionAmount, 0);

    return NextResponse.json({
      ledger,
      summary: {
        totalEntries: ledger.length,
        totalGrossProfit: Math.round(totalGrossProfit * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalNetProfit: Math.round(totalNetProfit * 100) / 100,
        pendingCommission: Math.round(pendingCommission * 100) / 100,
        transferredCommission: Math.round(transferredCommission * 100) / 100,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Commission fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch commission ledger" }, { status: 500 });
  }
}
