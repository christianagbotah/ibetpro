// ============================================================================
// Change Password API
// Allows authenticated users to change their password
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await getToken({
    req: request,
    secret: config.nextauth.secret,
  });

  if (!token?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required" },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password must be different from current password" },
      { status: 400 }
    );
  }

  // Get the user from DB
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // For admin accounts using env-configured credentials, verify against config password
  const isAdminEnvLogin =
    user.email === config.admin.email &&
    user.role === "admin";

  if (isAdminEnvLogin) {
    // Admin can change password — verify against env or stored hash
    const currentIsEnvPassword = currentPassword === config.admin.password;
    const currentIsHashMatch = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!currentIsEnvPassword && !currentIsHashMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }
  } else {
    // Regular user — verify against stored hash
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }
  }

  // Hash and save new password
  const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptSaltRounds);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashedPassword },
  });

  return NextResponse.json({
    success: true,
    message: "Password changed successfully",
  });
}
