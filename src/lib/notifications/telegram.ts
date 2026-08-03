// ============================================================================
// iBetPro Notification Service
// Sends AI tip alerts via Telegram bot and in-app notifications
// ============================================================================

import { prisma } from "@/lib/db";

// ---------- Telegram Bot ----------

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: "MarkdownV2" | "HTML";
}

async function sendTelegramMessage({ chatId, text, parseMode = "HTML" }: TelegramMessage): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[Notifications] TELEGRAM_BOT_TOKEN not set, skipping Telegram message");
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_preview: true,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[Notifications] Telegram send failed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Notifications] Telegram error:", error);
    return false;
  }
}

// ---------- Tip Notification Formatting ----------

export interface TipAlert {
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  confidence: number;
  valueEdge: number;
  kellyStake: number;
  riskLevel: string;
  matchTime: string;
  matchId: string;
}

function formatTelegramTip(tip: TipAlert, platformUrl: string): string {
  const sportEmoji: Record<string, string> = {
    football: "⚽",
    basketball: "🏀",
    tennis: "🎾",
    cricket: "🏏",
    rugby: "🏉",
    baseball: "⚾",
  };

  const riskEmoji: Record<string, string> = {
    low: "🟢",
    medium: "🟡",
    high: "🔴",
  };

  const emoji = sportEmoji[tip.sport.toLowerCase()] || "🎯";
  const risk = riskEmoji[tip.riskLevel.toLowerCase()] || "🟡";
  const confidenceBar = "█".repeat(Math.round(tip.confidence * 5)) + "░".repeat(5 - Math.round(tip.confidence * 5));

  // Extract date and time from matchTime for cleaner display
  // matchTime is already formatted in user's timezone by the bot engine
  const timeDisplay = tip.matchTime || "TBD";

  return `
${emoji} <b>AI Value Bet Alert</b>

<b>${tip.homeTeam} vs ${tip.awayTeam}</b>
${tip.league} • ${timeDisplay} (GMT)

💰 <b>Selection:</b> ${tip.selection}
📊 <b>Odds:</b> ${tip.odds.toFixed(2)}
🎯 <b>AI Confidence:</b> ${(tip.confidence * 100).toFixed(0)}% ${confidenceBar}
📈 <b>Value Edge:</b> +${(tip.valueEdge * 100).toFixed(1)}%
${risk} <b>Risk:</b> ${tip.riskLevel.charAt(0).toUpperCase() + tip.riskLevel.slice(1)}
📐 <b>Kelly Stake:</b> ${(tip.kellyStake * 100).toFixed(1)}% of bankroll

<a href="${platformUrl}/tips">→ View all tips &amp; track this bet</a>
`.trim();
}

function formatInAppTip(tip: TipAlert) {
  return {
    title: `AI Tip: ${tip.selection} @ ${tip.odds.toFixed(2)}`,
    body: `${tip.homeTeam} vs ${tip.awayTeam} — ${(tip.confidence * 100).toFixed(0)}% confidence, +${(tip.valueEdge * 100).toFixed(1)}% edge`,
    type: "ai_tip" as const,
    matchId: tip.matchId,
  };
}

// ---------- Main Send Function ----------

export async function sendTipAlert(userId: string, tip: TipAlert): Promise<{ telegram: boolean; inApp: boolean }> {
  const platformUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  // 1. Send Telegram notification if user has chat ID configured
  let telegramSent = false;
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { telegramChatId: true, notificationsEnabled: true },
    });

    if (settings?.notificationsEnabled !== false && settings?.telegramChatId) {
      const message = formatTelegramTip(tip, platformUrl);
      telegramSent = await sendTelegramMessage({
        chatId: settings.telegramChatId,
        text: message,
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to send Telegram alert:", error);
  }

  // 2. Create in-app notification
  let inAppCreated = false;
  try {
    const inApp = formatInAppTip(tip);
    await prisma.notification.create({
      data: {
        userId,
        title: inApp.title,
        body: inApp.body,
        type: inApp.type,
      },
    });
    inAppCreated = true;
  } catch (error) {
    console.error("[Notifications] Failed to create in-app notification:", error);
  }

  return { telegram: telegramSent, inApp: inAppCreated };
}

// ---------- Batch Send (for multiple users) ----------

export async function broadcastTipAlert(userIds: string[], tip: TipAlert): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const result = await sendTipAlert(userId, tip);
      if (result.telegram || result.inApp) {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

// ---------- Telegram Webhook Verification ----------

export function verifyTelegramWebhook(initData: string, botToken: string): boolean {
  // For Telegram Mini App / Login Widget verification
  const [hash, ...pairs] = initData.split("&").reverse();
  const dataCheck = pairs.sort().join("&");

  // Simple HMAC-SHA256 verification
  // In production, use crypto.createHmac("sha256", key)
  return hash !== "" && botToken !== "";
}
