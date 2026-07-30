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
