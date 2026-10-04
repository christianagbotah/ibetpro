import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { transferCommissionToAdmin } from "@/lib/broker-integration";

/**
 * Commission API
 *
 * Commission creation is intentionally owned by settlement/cashout transactions.
 * This route only exposes the ledger and explicit transfer of already-created
 * pending commission entries. The legacy `process` mutation is disabled to
 * prevent duplicate profit/commission accounting.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const { action } = body;

    if (action === "process") {
      return NextResponse.json(
        {
          error:
            "Direct commission processing is disabled. Commission is created atomically by settlement or cashout.",
          code: "COMMISSION_SINGLE_WRITER",
        },
        { status: 409 }
      );
    }

    // Transfer already-created pending commissions to the configured admin wallet.
    if (action === "transfer_all") {
      const pendingCommissions = await prisma.commissionLedger.findMany({
        where: { userId, status: "pending" },
        include: { bettingAccount: true },
      });

      const adminSettings = await prisma.adminSettings.findFirst();
      const minPayout = adminSettings?.minimumCommissionPayout || 10;

      const totalPending = pendingCommissions.reduce(
        (sum, commission) => sum + commission.commissionAmount,
        0
      );

      if (totalPending < minPayout) {
        return NextResponse.json({
          message: `Total pending commission (${totalPending.toFixed(2)}) is below the minimum payout (${minPayout})`,
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
            data: {
              status: "failed",
              failureReason: "No access token or admin wallet",
            },
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
              failureReason: null,
            },
          });
          transferred++;
        } else {
          await prisma.commissionLedger.update({
            where: { id: entry.id },
            data: {
              status: "failed",
              failureReason: result.error || "Commission transfer failed",
            },
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
    return NextResponse.json(
      { error: "Failed to process commission request" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const period = searchParams.get("period") || "all";

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
          select: {
            platform: true,
            accountName: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalGrossProfit = ledger.reduce(
      (sum, commission) => sum + commission.grossProfit,
      0
    );
    const totalCommission = ledger.reduce(
      (sum, commission) => sum + commission.commissionAmount,
      0
    );
    const totalNetProfit = ledger.reduce(
      (sum, commission) => sum + commission.netProfit,
      0
    );
    const pendingCommission = ledger
      .filter((commission) => commission.status === "pending")
      .reduce((sum, commission) => sum + commission.commissionAmount, 0);
    const transferredCommission = ledger
      .filter((commission) => commission.status === "transferred")
      .reduce((sum, commission) => sum + commission.commissionAmount, 0);

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
    return NextResponse.json(
      { error: "Failed to fetch commission ledger" },
      { status: 500 }
    );
  }
}
