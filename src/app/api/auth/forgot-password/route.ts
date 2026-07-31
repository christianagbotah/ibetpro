// ============================================================================
// iBetPro Forgot Password API
// Generates a password reset token and returns the reset URL
// (In production, this would send an email; here we return the token for demo)
// ============================================================================

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per 60 seconds per IP
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = checkRateLimit(ip, RATE_LIMITS.auth);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 }
      );
    }

    // Always return success to prevent email enumeration attacks
    // An attacker should not be able to determine if an email is registered
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Return success even if user doesn't exist to prevent enumeration
      return NextResponse.json({
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // In production, you would send an email with a link like:
    // `${config.platform.url}/reset-password?token=${token}`
    //
    // For this demo/self-hosted app, we return the token in the response
    // so the user can use it directly. In a production deployment,
    // replace this with an actual email sending service.

    console.log(`[ForgotPassword] Reset token generated for ${email}. Reset URL: /reset-password?token=${token}`);

    return NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
      // Demo only: include token so the UI can redirect automatically
      // Remove this in production when sending real emails
      _demo_token: token,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
