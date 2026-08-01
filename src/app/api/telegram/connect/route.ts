// ============================================================================
// Telegram Connect API
// User-facing API to check connection status, get deep link, and disconnect.
// All endpoints require authentication.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// ---------- GET: Connection status & deep link ----------

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { settings: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const connected = !!user.settings?.telegramChatId;

  // Build deep link: t.me/<bot>?start=<userId>
  let deepLink: string | null = null;
  let botUsername: string | null = null;

  if (BOT_TOKEN) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
      if (meRes.ok) {
        const meData = await meRes.json();
        botUsername = meData.result?.username || null;
        if (botUsername) {
          deepLink = `https://t.me/${botUsername}?start=${user.id}`;
        }
      }
    } catch {
      // Bot API unreachable — deep link unavailable
    }
  }

  return NextResponse.json({
    connected,
    chatId: connected ? user.settings?.telegramChatId : null,
    deepLink,
    botUsername,
    notificationsEnabled: user.settings?.notificationsEnabled ?? true,
  });
}

// ---------- POST: Manually set chat ID (fallback) ----------

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { chatId } = body;

  if (!chatId || typeof chatId !== "string") {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if this chatId is already linked to a different user
  const existingLink = await prisma.userSettings.findFirst({
    where: { telegramChatId: chatId },
  });

  if (existingLink && existingLink.userId !== user.id) {
    return NextResponse.json(
      { error: "This Telegram chat is already linked to another account" },
      { status: 409 }
    );
  }

  // Upsert the chat ID
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { telegramChatId: chatId },
    create: {
      userId: user.id,
      telegramChatId: chatId,
    },
  });

  return NextResponse.json({ success: true, chatId });
}

// ---------- DELETE: Disconnect Telegram ----------

export async function DELETE() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { settings: true },
  });

  if (!user?.settings?.telegramChatId) {
    return NextResponse.json({ error: "Telegram not connected" }, { status: 404 });
  }

  await prisma.userSettings.update({
    where: { id: user.settings.id },
    data: { telegramChatId: null },
  });

  return NextResponse.json({ success: true, disconnected: true });
}
