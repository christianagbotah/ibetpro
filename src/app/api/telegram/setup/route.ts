// ============================================================================
// Telegram Setup API (Admin-only)
// Registers the webhook URL with Telegram and sets bot commands.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- POST: Register webhook & set bot commands ----------

export async function POST(request: NextRequest) {
  // Verify admin access
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check if user is admin via JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || "ibetpro-dev-secret-key-not-for-production",
  });

  if (token?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const baseUrl = body.webhookUrl || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  try {
    // 1. Register the webhook
    const webhookRes = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });

    const webhookData = await webhookRes.json();

    if (!webhookData.ok) {
      return NextResponse.json({
        error: "Failed to set webhook",
        details: webhookData,
      }, { status: 500 });
    }

    // 2. Set bot commands
    const commandsRes = await fetch(`${TELEGRAM_API}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Connect your iBetPro account" },
          { command: "help", description: "Show available commands" },
          { command: "status", description: "View your bot status & stats" },
          { command: "stop", description: "Pause tip notifications" },
          { command: "resume", description: "Resume tip notifications" },
          { command: "settings", description: "View your AI tip preferences" },
        ],
      }),
    });

    const commandsData = await commandsRes.json();

    // 3. Get bot info
    const meRes = await fetch(`${TELEGRAM_API}/getMe`);
    const meData = await meRes.json();

    return NextResponse.json({
      success: true,
      webhook: {
        url: webhookUrl,
        registered: webhookData.ok,
        description: webhookData.description,
      },
      commands: {
        set: commandsData.ok,
        count: 6,
      },
      bot: {
        username: meData.result?.username,
        name: meData.result?.first_name,
      },
    });
  } catch (err) {
    console.error("[Telegram Setup] Error:", err);
    return NextResponse.json({
      error: "Failed to set up Telegram webhook",
      details: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}

// ---------- DELETE: Remove webhook (switch to polling) ----------

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || "ibetpro-dev-secret-key-not-for-production",
  });

  if (token?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
    });

    const data = await res.json();

    return NextResponse.json({
      success: data.ok,
      message: data.ok ? "Webhook removed. Bot is now in polling mode." : "Failed to remove webhook",
    });
  } catch (err) {
    return NextResponse.json({
      error: "Failed to remove webhook",
      details: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
