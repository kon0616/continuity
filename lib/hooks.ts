// ─── Custom Hooks ──────────────────────────────────────────────
// Shared React hooks for time-related UI derivations.

import { useState, useEffect } from "react";

/**
 * Format milliseconds into a compact human-readable string.
 * Examples: "2h 15m", "45m", "3h", "<1m"
 */
export function formatDurationCompact(ms: number): string {
  if (!ms || ms <= 0 || Number.isNaN(ms)) return "";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

/**
 * Reactively compute total focus time for a task.
 *
 * When no session is active, returns the static base value.
 * When a session is active on this task, adds live elapsed time
 * and updates every 60 seconds to stay accurate without excessive re-renders.
 *
 * @param baseMs          - Pre-computed total focus ms from snapshot (completed sessions only)
 * @param sessionStartedAt - Absolute timestamp of the currently active session, or null
 * @returns Formatted compact duration string (e.g. "2h 15m")
 */
export function useTaskTotalTime(
  baseMs: number,
  sessionStartedAt: number | null
): string {
  const compute = () => {
    if (!sessionStartedAt) return baseMs;
    return baseMs + Math.max(0, Date.now() - sessionStartedAt);
  };

  const [liveMs, setLiveMs] = useState(compute);

  useEffect(() => {
    if (!sessionStartedAt) {
      setLiveMs(baseMs);
      return;
    }

    // Update immediately
    setLiveMs(baseMs + Math.max(0, Date.now() - sessionStartedAt));

    // Tick every 60s — frequent enough to feel live, rare enough to be cheap
    const timer = setInterval(() => {
      setLiveMs(baseMs + Math.max(0, Date.now() - sessionStartedAt));
    }, 60000);

    return () => clearInterval(timer);
  }, [baseMs, sessionStartedAt]);

  return formatDurationCompact(liveMs);
}
