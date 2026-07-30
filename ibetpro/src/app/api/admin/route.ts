import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";

// GET /api/admin - Get admin settings
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const settings = await prisma.adminSettings.findFirst();
    if (!settings) {
      return NextResponse.json({ error: "Admin settings not found" }, { status: 404 });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return NextResponse.json({ error: "Failed to fetch admin settings" }, { status: 500 });
  }
}

// PUT /api/admin - Update admin settings
export async function PUT(request: NextRequest) {
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
    const settings = await prisma.adminSettings.findFirst();

    if (!settings) {
      return NextResponse.json({ error: "Admin settings not found" }, { status: 404 });
    }

    const allowedFields = [
      "defaultCommissionRate",
      "platformName",
      "maintenanceMode",
      "maxUsers",
      "autoApproveAccounts",
      "oddsApiKey",
      "apiFootballKey",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    // Validate commission rate bounds
    if (data.defaultCommissionRate !== undefined) {
      const rate = data.defaultCommissionRate as number;
      if (rate < settings.minCommissionRate || rate > settings.maxCommissionRate) {
        return NextResponse.json(
          { error: `Commission rate must be between ${Math.round(settings.minCommissionRate * 100)}% and ${Math.round(settings.maxCommissionRate * 100)}%` },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.adminSettings.update({
      where: { id: settings.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating admin settings:", error);
    return NextResponse.json({ error: "Failed to update admin settings" }, { status: 500 });
  }
}
