// ============================================================================
// iBetPro Bot SSE Hook
// React hook for consuming real-time bot events via Server-Sent Events
// ============================================================================

"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface BotEvent {
  type: string;
  data: Record<string, unknown>;
}

interface UseBotEventsOptions {
  /** Whether to connect (default: false, set to true when bot is running) */
  enabled: boolean;
  /** Callback for bot events */
  onEvent?: (event: BotEvent) => void;
  /** Callback for bet_placed events */
  onBetPlaced?: (data: Record<string, unknown>) => void;
  /** Callback for bet_settled events */
  onBetSettled?: (data: Record<string, unknown>) => void;
  /** Callback for cashout_executed events */
  onCashout?: (data: Record<string, unknown>) => void;
  /** Callback for engine status updates */
  onEngineStatus?: (data: Record<string, unknown>) => void;
  /** Callback for bot stopped events */
  onBotStopped?: (data: Record<string, unknown>) => void;
}

interface UseBotEventsReturn {
  /** Whether the SSE connection is active */
  connected: boolean;
  /** Most recent events */
  recentEvents: BotEvent[];
  /** Manually reconnect */
  reconnect: () => void;
}

export function useBotEvents(options: UseBotEventsOptions): UseBotEventsReturn {
  const { enabled, onEvent, onBetPlaced, onBetSettled, onCashout, onEngineStatus, onBotStopped } = options;
  const [connected, setConnected] = useState(false);
  const [recentEvents, setRecentEvents] = useState<BotEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!enabled) {
      setConnected(false);
      return;
    }

    try {
      const es = new EventSource("/api/bot/events");
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const parsed: BotEvent = JSON.parse(event.data);

          // Add to recent events (keep last 50)
          setRecentEvents((prev) => [...prev.slice(-49), parsed]);

          // Call the generic handler
          onEvent?.(parsed);

          // Call specific handlers
          switch (parsed.type) {
            case "bet_placed":
              onBetPlaced?.(parsed.data);
              break;
            case "bet_settled":
              onBetSettled?.(parsed.data);
              break;
            case "cashout_executed":
              onCashout?.(parsed.data);
              break;
            case "engine_status":
              onEngineStatus?.(parsed.data);
              break;
            case "bot_stopped":
            case "stop_loss_hit":
            case "profit_target_hit":
              onBotStopped?.(parsed.data);
              break;
          }
        } catch {
          // Ignore parse errors (heartbeats, etc.)
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Auto-reconnect after 10 seconds
        if (enabled) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 10000);
        }
      };
    } catch {
      setConnected(false);
    }
  }, [enabled, onEvent, onBetPlaced, onBetSettled, onCashout, onEngineStatus, onBotStopped]);

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [enabled, connect]);

  return {
    connected,
    recentEvents,
    reconnect: connect,
  };
}
