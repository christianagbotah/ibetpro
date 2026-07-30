"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useFetch<T>(url: string, defaultValue: T): {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => {
    setTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        const result = await res.json();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [url, trigger]);

  return { data, loading, error, refetch };
}

export function useMultiFetch<T extends Record<string, unknown>>(
  urls: Record<string, string>,
  defaultValues: T
): {
  data: T;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<T>(defaultValues);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => {
    setTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const entries = Object.entries(urls);
      const results = await Promise.allSettled(
        entries.map(([, url]) => fetch(url).then((r) => r.json()))
      );

      if (!cancelled) {
        const newData = { ...defaultValues };
        entries.forEach(([key], index) => {
          const result = results[index];
          if (result.status === "fulfilled") {
            (newData as Record<string, unknown>)[key] = result.value;
          }
        });
        setData(newData as T);
        setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [trigger]);

  return { data, loading, refetch };
}

export function usePolling<T>(
  url: string,
  intervalMs: number,
  defaultValue: T
): {
  data: T;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(() => {
    setTrigger((prev) => prev + 1);
  }, []);

  // Initial fetch + trigger-based refetch
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        const result = await res.json();
        if (!cancelled) {
          setData(result);
        }
      } catch {
        // Ignore polling errors silently
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [url, trigger]);

  // Polling interval
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch {
        // Ignore polling errors silently
      }
    }

    intervalRef.current = setInterval(poll, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [url, intervalMs]);

  return { data, loading, refetch };
}

// ==================== SSE REAL-TIME HOOK ====================

interface SSEEventData {
  event: string;
  data: unknown;
  id?: string;
  timestamp: number;
}

/**
 * useSSE - Hook to consume Server-Sent Events for real-time updates
 * Connects to /api/events and dispatches events to handlers
 */
export function useSSE(
  handlers: Partial<Record<string, (data: unknown) => void>>,
  deps: unknown[] = []
): {
  connected: boolean;
  lastEvent: SSEEventData | null;
} {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEventData | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource("/api/events");

      eventSource.addEventListener("connected", (e) => {
        setConnected(true);
        try {
          const data = JSON.parse(e.data);
          handlersRef.current.connected?.(data);
        } catch { /* ignore parse errors */ }
      });

      eventSource.addEventListener("heartbeat", () => {
        // Keep-alive, no action needed
      });

      eventSource.addEventListener("match_update", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "match_update", data, timestamp: Date.now() });
          handlersRef.current.match_update?.(data);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("cashout", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "cashout", data, timestamp: Date.now() });
          handlersRef.current.cashout?.(data);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("cashout_opportunity", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "cashout_opportunity", data, timestamp: Date.now() });
          handlersRef.current.cashout_opportunity?.(data);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("odds_change", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "odds_change", data, timestamp: Date.now() });
          handlersRef.current.odds_change?.(data);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("auto_bet_placed", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "auto_bet_placed", data, timestamp: Date.now() });
          handlersRef.current.auto_bet_placed?.(data);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("balance_update", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ event: "balance_update", data, timestamp: Date.now() });
          handlersRef.current.balance_update?.(data);
        } catch { /* ignore */ }
      });

      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();
        // Reconnect after 5 seconds
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { connected, lastEvent };
}
