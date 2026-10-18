"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const FOCUS_REFRESH_DEBOUNCE_MS = 5_000;

export function useAutoRefresh(intervalMs = DEFAULT_REFRESH_INTERVAL_MS) {
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRefreshAt = useRef(0);

  const refreshNow = useCallback(() => {
    lastRefreshAt.current = Date.now();
    setRefreshKey(key => key + 1);
  }, []);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshAt.current >= FOCUS_REFRESH_DEBOUNCE_MS
      ) {
        refreshNow();
      }
    };

    const intervalId = window.setInterval(refreshWhenActive, intervalMs);
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [intervalMs, refreshNow]);

  return [refreshKey, refreshNow] as const;
}
