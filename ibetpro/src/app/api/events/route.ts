import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/session";
import { subscribe, SSEEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * GET /api/events - SSE endpoint for real-time updates
 * Clients connect here to receive live match updates, cashout alerts, etc.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return new Response("Authentication required", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId: user.id, message: "Connected to iBetPro live updates" })}\nid: ${Date.now()}\n\n`)
      );

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Subscribe to user-specific events
      const unsubscribe = subscribe(user.id, (event: SSEEvent) => {
        try {
          const eventData = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
          const eventId = event.id || `${Date.now()}`;
          controller.enqueue(
            encoder.encode(`event: ${event.event}\ndata: ${eventData}\nid: ${eventId}\n\n`)
          );
        } catch {
          unsubscribe();
          clearInterval(heartbeat);
        }
      });

      // Handle connection close
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
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
