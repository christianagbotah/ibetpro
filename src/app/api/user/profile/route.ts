// ============================================================================
// User Profile API - GET: profile info, PATCH: update region/currency/timezone
// ============================================================================

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { getCurrencyForRegion, REGIONS } from "@/lib/regions";
import { detectRegionFromTimezone } from "@/lib/currency";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        role: true,
        region: true,
        currency: true,
        balance: true,
        bankroll: true,
        dailyPnl: true,
        weeklyPnl: true,
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get currency symbol from regions
    const regionInfo = REGIONS.find((r) => r.code === userData.region);
    const currencyInfo = REGIONS.find((r) => r.currencyCode === userData.currency);

    return NextResponse.json({
      ...userData,
      currencySymbol: currencyInfo?.currencySymbol || "$",
      regionName: regionInfo?.name || userData.region,
      regionFlag: regionInfo?.flag || "",
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { region, currency, timezone, name } = body;

    const updates: Record<string, unknown> = {};

    // Update name if provided
    if (name && typeof name === "string") {
      updates.name = name.trim().slice(0, 100);
    }

    // Update region and auto-set currency
    if (region && typeof region === "string") {
      const regionInfo = REGIONS.find((r) => r.code === region);
      if (regionInfo) {
        updates.region = region;
        // Auto-set currency based on region
        const currencyForRegion = getCurrencyForRegion(region);
        updates.currency = currencyForRegion.code;
      }
    }

    // Update currency manually (overrides region default)
    if (currency && typeof currency === "string") {
      const validCurrency = REGIONS.find((r) => r.currencyCode === currency);
      if (validCurrency) {
        updates.currency = currency;
      }
    }

    // Update timezone in UserSettings
    if (timezone && typeof timezone === "string") {
      // Validate timezone by trying to format with it
      try {
        new Date().toLocaleString("en-US", { timeZone: timezone });
        // Also update region based on timezone if region wasn't explicitly set
        if (!region) {
          const detectedRegion = detectRegionFromTimezone(timezone);
          updates.region = detectedRegion;
          const currencyForRegion = getCurrencyForRegion(detectedRegion);
          updates.currency = currencyForRegion.code;
        }
      } catch {
        return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    // Also update timezone in UserSettings if provided
    if (timezone) {
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { timezone },
        create: { userId: user.id, timezone },
      });
    }

    // Get updated currency symbol
    const currencyInfo = REGIONS.find((r) => r.currencyCode === updatedUser.currency);
    const regionInfo = REGIONS.find((r) => r.code === updatedUser.region);

    return NextResponse.json({
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      region: updatedUser.region,
      currency: updatedUser.currency,
      balance: updatedUser.balance,
      bankroll: updatedUser.bankroll,
      dailyPnl: updatedUser.dailyPnl,
      weeklyPnl: updatedUser.weeklyPnl,
      currencySymbol: currencyInfo?.currencySymbol || "$",
      regionName: regionInfo?.name || updatedUser.region,
      regionFlag: regionInfo?.flag || "",
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
