// ============================================================================
// Telegram Webhook Handler
// Receives POST updates from Telegram (messages, callbacks, etc.)
// This route MUST be public (no auth) — Telegram sends updates directly.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- Helper: Send a message back to the user ----------

async function replyToChat(chatId: string, text: string, parseMode: "HTML" | "MarkdownV2" = "HTML") {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[Telegram Webhook] replyToChat error:", err);
  }
}

// ---------- GET: Webhook info (for debugging) ----------

export async function GET() {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  try {
    const [webhookRes, meRes] = await Promise.all([
      fetch(`${TELEGRAM_API}/getWebhookInfo`),
      fetch(`${TELEGRAM_API}/getMe`),
    ]);

    const webhookInfo = await webhookRes.json();
    const botInfo = await meRes.json();

    return NextResponse.json({
      bot: botInfo.result?.username || "unknown",
      webhook: webhookInfo.result,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch bot info" }, { status: 500 });
  }
}

// ---------- POST: Main webhook handler ----------

export async function POST(request: NextRequest) {
  // Verify token is configured
  if (!BOT_TOKEN) {
    console.error("[Telegram Webhook] BOT_TOKEN not set");
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle callback queries (button presses)
  const callbackQuery = body.callback_query as Record<string, unknown> | undefined;
  if (callbackQuery) {
    const chatId = (callbackQuery.message as Record<string, unknown>)?.chat as Record<string, unknown> | undefined;
    const data = callbackQuery.data as string | undefined;
    // Acknowledge the callback
    if (callbackQuery.id) {
      try {
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: callbackQuery.id }),
        });
      } catch {}
    }
    // Handle callback data if needed (future: tip tracking buttons)
    console.log(`[Telegram Webhook] Callback: ${data} from chat ${chatId}`);
    return NextResponse.json({ ok: true });
  }

  // Handle regular messages
  const message = body.message as Record<string, unknown> | undefined;
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const chatId = String(chat?.id || "");
  const text = (message.text as string || "").trim();

  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  // ---- /start <userId> — Deep link account linking ----
  if (text.startsWith("/start ")) {
    const userId = text.slice(7).trim();
    if (!userId) {
      await replyToChat(chatId, "Invalid link. Please use the connect button from your iBetPro settings.");
      return NextResponse.json({ ok: true });
    }

    // Verify the user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await replyToChat(chatId, "Account not found. Please make sure you're logged in to iBetPro and try again.");
      return NextResponse.json({ ok: true });
    }

    // Check if this chat is already linked to another user
    const existingLink = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
    });
    if (existingLink && existingLink.userId !== userId) {
      await replyToChat(chatId, "This Telegram chat is already linked to another iBetPro account. Disconnect it first from that account's settings.");
      return NextResponse.json({ ok: true });
    }

    // Upsert the chat ID onto the user's settings
    await prisma.userSettings.upsert({
      where: { userId },
      update: { telegramChatId: chatId },
      create: {
        userId,
        telegramChatId: chatId,
      },
    });

    await replyToChat(
      chatId,
      `✅ <b>Connected!</b>\n\nHello ${user.name}! Your Telegram is now linked to iBetPro.\n\nYou'll receive AI value bet alerts here automatically.\n\nUse /help to see available commands.`
    );

    console.log(`[Telegram Webhook] User ${userId} linked to chat ${chatId}`);
    return NextResponse.json({ ok: true });
  }

  // ---- /start (no payload) — Welcome message ----
  if (text === "/start") {
    // Check if this chat is already linked to a user
    const existingSettings = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
      include: { user: true },
    });

    if (existingSettings && existingSettings.user) {
      // Already connected — greet them by name
      await replyToChat(
        chatId,
        `👋 <b>Welcome back, ${existingSettings.user.name}!</b>\n\nYour Telegram is already connected to iBetPro.\n\n🔔 Notifications: ${existingSettings.notificationsEnabled ? "ON" : "OFF"}\n\nUse /status for your stats or /help for all commands.`
      );
    } else {
      // Not connected — show instructions
      await replyToChat(
        chatId,
        `👋 <b>Welcome to iBetPro AI Advisor!</b>\n\nTo receive AI tip alerts, you need to connect your iBetPro account.\n\n1. Go to iBetPro Settings\n2. Click "Connect Telegram"\n3. Send the link that opens\n\nThis links your account so tips are sent here.\n\nUse /help for available commands.`
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ---- /help ----
  if (text === "/help") {
    await replyToChat(
      chatId,
      `<b>🤖 iBetPro AI Advisor Commands</b>\n\n/start — Connect your iBetPro account\n/help — Show this help message\n/status — View your bot status &amp; stats\n/stop — Pause tip notifications\n/resume — Resume tip notifications\n/settings — View your AI tip preferences\n\n💡 Tips are sent automatically when the AI finds value bets matching your criteria.`
    );
    return NextResponse.json({ ok: true });
  }

  // ---- /status ----
  if (text === "/status") {
    const settings = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
      include: { user: true },
    });

    if (!settings) {
      await replyToChat(chatId, "Your Telegram is not linked to an iBetPro account. Use /start to connect.");
      return NextResponse.json({ ok: true });
    }

    const user = settings.user;
    const tipCount = await prisma.tip.count({ where: { userId: user.id } });
    const wonTips = await prisma.tip.count({ where: { userId: user.id, outcome: "won" } });
    const totalTips = await prisma.tip.count({ where: { userId: user.id, outcome: { in: ["won", "lost"] } } });
    const winRate = totalTips > 0 ? ((wonTips / totalTips) * 100).toFixed(1) : "N/A";

    // Get bot session status
    const session = await prisma.botSession.findUnique({ where: { userId: user.id } });

    const modeLabel = settings.botMode === "advisor" ? "🎯 Advisor (Tips Only)" : "🤖 Auto-Bet";

    await replyToChat(
      chatId,
      `<b>📊 Your iBetPro Status</b>\n\n` +
      `👤 <b>User:</b> ${user.name}\n` +
      `🎮 <b>Mode:</b> ${modeLabel}\n` +
      `💰 <b>Bankroll:</b> ${user.bankroll.toFixed(2)}\n` +
      `📈 <b>Daily P/L:</b> ${user.dailyPnl >= 0 ? "+" : ""}${user.dailyPnl.toFixed(2)}\n` +
      `📉 <b>Weekly P/L:</b> ${user.weeklyPnl >= 0 ? "+" : ""}${user.weeklyPnl.toFixed(2)}\n\n` +
      `🎯 <b>Total Tips:</b> ${tipCount}\n` +
      `✅ <b>Win Rate:</b> ${winRate}${totalTips > 0 ? "%" : ""}\n` +
      `🔔 <b>Notifications:</b> ${settings.notificationsEnabled ? "ON" : "OFF"}\n` +
      `🤖 <b>Bot:</b> ${session?.status === "running" ? "Running" : "Stopped"}\n\n` +
      `Use /settings to see your tip preferences.`
    );
    return NextResponse.json({ ok: true });
  }

  // ---- /stop — Pause notifications ----
  if (text === "/stop") {
    const settings = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
    });
    if (!settings) {
      await replyToChat(chatId, "Your Telegram is not linked. Use /start to connect.");
      return NextResponse.json({ ok: true });
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { notificationsEnabled: false },
    });

    await replyToChat(chatId, "⏸️ Tip notifications <b>paused</b>. You won't receive new alerts until you use /resume.");
    return NextResponse.json({ ok: true });
  }

  // ---- /resume — Resume notifications ----
  if (text === "/resume") {
    const settings = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
    });
    if (!settings) {
      await replyToChat(chatId, "Your Telegram is not linked. Use /start to connect.");
      return NextResponse.json({ ok: true });
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { notificationsEnabled: true },
    });

    await replyToChat(chatId, "▶️ Tip notifications <b>resumed</b>! You'll receive AI alerts again.");
    return NextResponse.json({ ok: true });
  }

  // ---- /settings ----
  if (text === "/settings") {
    const settings = await prisma.userSettings.findFirst({
      where: { telegramChatId: chatId },
    });
    if (!settings) {
      await replyToChat(chatId, "Your Telegram is not linked. Use /start to connect.");
      return NextResponse.json({ ok: true });
    }

    const modeLabel = settings.botMode === "advisor" ? "🎯 Advisor (Tips Only)" : "🤖 Auto-Bet";
    const sports = settings.tipSports || settings.preferredSports;

    await replyToChat(
      chatId,
      `<b>⚙️ Your AI Tip Settings</b>\n\n` +
      `🎮 <b>Mode:</b> ${modeLabel}\n` +
      `🎯 <b>Min Confidence:</b> ${((settings.minTipConfidence || settings.minAiConfidence) * 100).toFixed(0)}%\n` +
      `📈 <b>Min Value Edge:</b> +${(settings.minEdgeThreshold * 100).toFixed(1)}%\n` +
      `⚽ <b>Sports:</b> ${sports}\n` +
      `📊 <b>Odds Range:</b> ${settings.minOddsThreshold} - ${settings.maxOddsThreshold}\n` +
      `🟡 <b>Risk Level:</b> ${settings.riskLevel}\n` +
      `🔔 <b>Notifications:</b> ${settings.notificationsEnabled ? "ON" : "OFF"}\n\n` +
      `Change these in your iBetPro Settings page.`
    );
    return NextResponse.json({ ok: true });
  }

  // ---- Unknown command / regular message ----
  await replyToChat(
    chatId,
    "I didn't understand that. Use /help to see available commands."
  );

  return NextResponse.json({ ok: true });
}
