import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";

/**
 * POST /api/admin/commission
 * Propagate a commission rate change to ALL users' UserSettings.
 * Called from the admin panel after saving the default rate.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { commissionRate } = body;

    if (typeof commissionRate !== "number" || commissionRate < 0.01 || commissionRate > 0.5) {
      return NextResponse.json(
        { error: "Commission rate must be between 1% and 50%" },
        { status: 400 }
      );
    }

    // Update ALL users' commissionRate to the new platform rate
    const result = await prisma.userSettings.updateMany({
      data: { commissionRate },
    });

    console.log(
      `[Admin] Commission rate updated to ${Math.round(commissionRate * 100)}% for ${result.count} user(s)`
    );

    return NextResponse.json({
      success: true,
      commissionRate,
      usersUpdated: result.count,
    });
  } catch (error) {
    console.error("Error propagating commission rate:", error);
    return NextResponse.json(
      { error: "Failed to propagate commission rate" },
      { status: 500 }
    );
  }
}
