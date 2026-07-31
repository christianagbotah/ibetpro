// ============================================================================
// iBetPro Bot SSE (Server-Sent Events) Endpoint
// GET /api/bot/events - Real-time stream of bot events for the authenticated user
//
// This provides instant push notifications when the bot places bets, scans,
// stops, or encounters errors — no polling needed.
// ============================================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { botEngine } from "@/lib/bot-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return new Response("Authentication required", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  // Track the last log ID we've sent to avoid duplicates
  let lastLogId = "";

  // Get the initial last log ID
  const latestLog = await prisma.botLog.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latestLog) {
    lastLogId = latestLog.id;
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const connectEvent = {
        type: "connected",
        data: {
          userId,
          engineRunning: botEngine.isRunning(userId),
          timestamp: new Date().toISOString(),
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectEvent)}\n\n`));

      // Send periodic heartbeat + poll for new events
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          // Heartbeat
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));

          // Check for new bot logs since lastLogId
          const newLogs = await prisma.botLog.findMany({
            where: {
              userId,
              ...(lastLogId ? { id: { gt: lastLogId } } : {}),
            },
            orderBy: { createdAt: "asc" },
            take: 20,
          });

          for (const log of newLogs) {
            const event = {
              type: log.action,
              data: {
                id: log.id,
                action: log.action,
                matchId: log.matchId,
                betId: log.betId,
                accumulatorId: log.accumulatorId,
                reasoning: log.reasoning,
                confidence: log.confidence,
                profitImpact: log.profitImpact,
                details: log.details ? JSON.parse(log.details) : null,
                timestamp: log.createdAt.toISOString(),
              },
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            lastLogId = log.id;
          }

          // Send engine status update
          const engineStats = botEngine.getStatus(userId);
          if (engineStats) {
            const statusEvent = {
              type: "engine_status",
              data: {
                running: engineStats.status === "running",
                totalScans: engineStats.totalScans,
                totalBetsPlaced: engineStats.totalBetsPlaced,
                totalStakeUsed: engineStats.totalStakeUsed,
                lastScanAt: engineStats.lastScanAt?.toISOString(),
                lastBetAt: engineStats.lastBetAt?.toISOString(),
                errorCount: engineStats.errorCount,
                lastError: engineStats.lastError,
              },
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`));
          }
        } catch (error) {
          // Don't close the stream on query errors, just log
          console.error("[BotSSE] Error polling events:", error);
        }
      }, 5000); // Poll every 5 seconds for new events

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
