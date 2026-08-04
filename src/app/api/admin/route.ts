import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import { validateInput, updateAdminSettingsSchema } from "@/lib/validation";

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

    // Auto-create AdminSettings row if it doesn't exist (first admin visit)
    let settings = await prisma.adminSettings.findFirst();
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {
          defaultCommissionRate: 0.10,
          minCommissionRate: 0.05,
          maxCommissionRate: 0.25,
          platformName: "iBetPro",
          maintenanceMode: false,
          maxUsers: 10000,
          autoApproveAccounts: true,
        },
      });
      console.log("[Admin] Created default AdminSettings row");
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return NextResponse.json({ error: "Failed to fetch admin settings" }, { status: 500 });
  }
}

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
    const validation = validateInput(updateAdminSettingsSchema, body);
    if (!validation.success) return validation.error;

    const data = validation.data;

    // Auto-create AdminSettings row if it doesn't exist
    let settings = await prisma.adminSettings.findFirst();
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {
          defaultCommissionRate: 0.10,
          minCommissionRate: 0.05,
          maxCommissionRate: 0.25,
          platformName: "iBetPro",
          maintenanceMode: false,
          maxUsers: 10000,
          autoApproveAccounts: true,
        },
      });
      console.log("[Admin] Created default AdminSettings row");
    }

    if (data.defaultCommissionRate !== undefined) {
      const minRate = data.minCommissionRate ?? settings.minCommissionRate;
      const maxRate = data.maxCommissionRate ?? settings.maxCommissionRate;
      if (data.defaultCommissionRate < minRate || data.defaultCommissionRate > maxRate) {
        return NextResponse.json(
          { error: `Commission rate must be between ${Math.round(minRate * 100)}% and ${Math.round(maxRate * 100)}%` },
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
