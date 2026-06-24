// ─── Time Aggregation Utilities ─────────────────────────────────
// Converts raw events into session intervals, then aggregates
// by week / month / year for chart rendering.
//
// Pure functions — no DB access, no side effects.

import type { EventRecord } from "./events";
import type { TaskSnapshot } from "./snapshots";

// ─── Types ─────────────────────────────────────────────────────

export interface SessionInterval {
  taskId: string;
  taskTitle: string;
  startTime: number;
  endTime: number;
}

export type PeriodMode = "week" | "month" | "year";

export interface ChartDataPoint {
  label: string;            // e.g. "6/23", "6月", "2026"
  periodKey: string;        // e.g. "2026-W25", "2026-06", "2026"
  [taskTitle: string]: number | string; // hours spent per task
}

// ─── Pie chart aggregation types ───────────────────────────────

export interface PieSliceData {
  taskId: string;
  taskTitle: string;
  totalMs: number;
  percentage: number;       // 0–100
  color: string;
}

export interface PieAggregation {
  slices: PieSliceData[];
  totalMs: number;
  periodLabel: string;      // e.g. "6月", "2026年", "本周"
}

// ─── Session Extraction ────────────────────────────────────────

/**
 * Scan events for SESSION_STARTED / SESSION_ENDED pairs and
 * return an array of completed session intervals.
 *
 * Handles unclosed sessions (last SESSION_STARTED with no ENDED)
 * by using Date.now() as the end time.
 */
export function eventsToSessions(
  events: EventRecord[],
  tasks: TaskSnapshot[]
): SessionInterval[] {
  const safeEvents = events ?? [];

  // Build taskId → title map from current snapshots
  const titleMap = new Map<string, string>();
  for (const t of tasks ?? []) {
    titleMap.set(t.taskId, t.title);
  }

  // Deleted task IDs
  const deletedIds = new Set<string>();
  for (const raw of safeEvents) {
    if (raw?.type === "TASK_DELETED") {
      const tid = getPayloadStr(raw, "taskId");
      if (tid) deletedIds.add(tid);
    }
  }

  const sessions: SessionInterval[] = [];
  const pendingStarts = new Map<string, { taskId: string; startedAt: number }>();

  for (const raw of safeEvents) {
    if (!raw?.type) continue;
    const ts = typeof raw.timestamp === "number" && raw.timestamp > 0
      ? raw.timestamp : Date.now();

    if (raw.type === "SESSION_STARTED") {
      const sid = getPayloadStr(raw, "sessionId");
      const tid = getPayloadStr(raw, "taskId");
      if (sid && tid && !deletedIds.has(tid)) {
        pendingStarts.set(sid, { taskId: tid, startedAt: ts });
      }
    } else if (raw.type === "SESSION_ENDED") {
      const sid = getPayloadStr(raw, "sessionId");
      const tid = getPayloadStr(raw, "taskId");
      const pending = sid ? pendingStarts.get(sid) : undefined;
      if (pending && tid && !deletedIds.has(tid)) {
        sessions.push({
          taskId: tid,
          taskTitle: titleMap.get(tid) ?? tid,
          startTime: pending.startedAt,
          endTime: ts,
        });
        pendingStarts.delete(sid!);
      }
    }
  }

  // Close any unclosed sessions with Date.now()
  const now = Date.now();
  pendingStarts.forEach((pending, _sid) => {
    if (!deletedIds.has(pending.taskId)) {
      sessions.push({
        taskId: pending.taskId,
        taskTitle: titleMap.get(pending.taskId) ?? pending.taskId,
        startTime: pending.startedAt,
        endTime: now,
      });
    }
  });

  return sessions;
}

// ─── Period Aggregation ────────────────────────────────────────

/**
 * Aggregate session intervals into chart data grouped by period.
 * Returns data sorted chronologically, with one entry per period.
 * Each entry has the task title as key and hours spent as value.
 */
export function aggregateByPeriod(
  sessions: SessionInterval[],
  mode: PeriodMode
): { data: ChartDataPoint[]; taskKeys: string[] } {
  if (!sessions || sessions.length === 0) {
    return { data: [], taskKeys: [] };
  }

  // Collect all unique task titles (sorted for consistent colors)
  const taskSet = new Set<string>();
  for (const s of sessions) {
    taskSet.add(s.taskTitle);
  }
  const taskKeys = Array.from(taskSet).sort();

  // Group by period
  const periodMap = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    // Split session into per-day chunks for accurate period assignment
    const dayChunks = splitSessionByDay(session);

    for (const chunk of dayChunks) {
      const periodKey = getPeriodKey(chunk.startTime, mode);
      const hours = (chunk.endTime - chunk.startTime) / (1000 * 60 * 60);

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, new Map());
      }
      const taskHours = periodMap.get(periodKey)!;
      taskHours.set(
        session.taskTitle,
        (taskHours.get(session.taskTitle) ?? 0) + hours
      );
    }
  }

  // Build chart data sorted by period key
  const sortedKeys = Array.from(periodMap.keys()).sort();
  const data: ChartDataPoint[] = sortedKeys.map((periodKey) => {
    const taskHours = periodMap.get(periodKey)!;
    const point: ChartDataPoint = {
      label: formatPeriodLabel(periodKey, mode),
      periodKey,
    };
    for (const tk of taskKeys) {
      const h = taskHours.get(tk) ?? 0;
      point[tk] = Math.round(h * 100) / 100; // 2 decimal places
    }
    return point;
  });

  return { data, taskKeys };
}

// ─── Pie Chart Aggregation ─────────────────────────────────────

const PIE_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f87171", // red-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#22d3ee", // cyan-400
  "#a3e635", // lime-400
  "#fb923c", // orange-400
  "#818cf8", // indigo-400
  "#2dd4bf", // teal-400
  "#e879f9", // fuchsia-400
];

const MAX_SLICES = 15;

/**
 * Aggregate sessions into per-task totals for pie chart rendering.
 * Filters sessions to the current selected time period, sorts by
 * duration descending, and merges small tasks into "Others" if needed.
 */
export function aggregateForPieChart(
  sessions: SessionInterval[],
  mode: PeriodMode
): PieAggregation {
  const now = new Date();
  const { start, end, label } = getPeriodRange(now, mode);

  // Filter sessions that overlap with the selected period
  const filtered = sessions.filter(
    (s) => s.endTime > start && s.startTime < end
  );

  // Clip each session to the period boundaries and sum per task
  const taskMap = new Map<string, { taskId: string; taskTitle: string; totalMs: number }>();

  for (const session of filtered) {
    const clippedStart = Math.max(session.startTime, start);
    const clippedEnd = Math.min(session.endTime, end);
    const ms = Math.max(0, clippedEnd - clippedStart);
    if (ms <= 0) continue;

    const existing = taskMap.get(session.taskId);
    if (existing) {
      existing.totalMs += ms;
    } else {
      taskMap.set(session.taskId, {
        taskId: session.taskId,
        taskTitle: session.taskTitle,
        totalMs: ms,
      });
    }
  }

  // Sort by duration descending
  const sorted = Array.from(taskMap.values()).sort((a, b) => b.totalMs - a.totalMs);

  const totalMs = sorted.reduce((sum, t) => sum + t.totalMs, 0);

  // Merge small tasks into "Others" if exceeding MAX_SLICES
  let displayTasks = sorted;
  if (sorted.length > MAX_SLICES) {
    const top = sorted.slice(0, MAX_SLICES - 1);
    const rest = sorted.slice(MAX_SLICES - 1);
    const othersMs = rest.reduce((sum, t) => sum + t.totalMs, 0);
    top.push({
      taskId: "__others__",
      taskTitle: `其他 (${rest.length} 项)`,
      totalMs: othersMs,
    });
    displayTasks = top;
  }

  // Assign colors and compute percentages
  const slices: PieSliceData[] = displayTasks.map((t, i) => ({
    taskId: t.taskId,
    taskTitle: t.taskTitle,
    totalMs: t.totalMs,
    percentage: totalMs > 0 ? (t.totalMs / totalMs) * 100 : 0,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return { slices, totalMs, periodLabel: label };
}

/**
 * Get the start/end timestamps and display label for a time period.
 */
function getPeriodRange(
  now: Date,
  mode: PeriodMode
): { start: number; end: number; label: string } {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (mode === "year") {
    return {
      start: new Date(year, 0, 1).getTime(),
      end: new Date(year + 1, 0, 1).getTime(),
      label: `${year}年`,
    };
  }

  if (mode === "month") {
    return {
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime(),
      label: `${month + 1}月`,
    };
  }

  // week mode — ISO week (Mon 00:00 to next Mon 00:00)
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(year, month, now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const m = monday.getMonth() + 1;
  const d = monday.getDate();
  return {
    start: monday.getTime(),
    end: nextMonday.getTime(),
    label: `本周 (${m}/${d} 起)`,
  };
}

// ─── Time Formatting ───────────────────────────────────────────

/**
 * Format milliseconds into "Xh Ym" or "Xh Ym Zs" for display.
 * Omits seconds when total >= 1 hour for cleaner presentation.
 */
export function formatFocusDuration(ms: number): string {
  if (!ms || ms <= 0 || Number.isNaN(ms)) return "0m";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

// ─── Internal Helpers ──────────────────────────────────────────

function getPayloadStr(raw: EventRecord, field: string): string {
  const val = (raw.payload as Record<string, unknown>)?.[field];
  return typeof val === "string" && val.length > 0 ? val : "";
}

/**
 * Split a session interval into per-day chunks so that
 * multi-day sessions are correctly attributed to each day's period.
 *
 * Example: a session from Mon 23:00 to Tue 01:00 becomes two chunks:
 *   Mon 23:00 → Mon 24:00  (1h on Monday)
 *   Tue 00:00 → Tue 01:00  (1h on Tuesday)
 */
function splitSessionByDay(
  session: SessionInterval
): Array<{ startTime: number; endTime: number }> {
  const chunks: Array<{ startTime: number; endTime: number }> = [];
  let cursor = session.startTime;
  const end = session.endTime;

  while (cursor < end) {
    // End of the current calendar day (midnight of next day)
    const dayEnd = getNextMidnight(cursor);
    const chunkEnd = Math.min(dayEnd, end);
    chunks.push({ startTime: cursor, endTime: chunkEnd });
    cursor = chunkEnd;
  }

  return chunks;
}

/**
 * Get midnight (00:00:00) of the next calendar day.
 */
function getNextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0); // next midnight
  return d.getTime();
}

/**
 * Generate a period key for grouping.
 *   week:  "2026-W25"
 *   month: "2026-06"
 *   year:  "2026"
 */
function getPeriodKey(ts: number, mode: PeriodMode): string {
  const d = new Date(ts);
  const year = d.getFullYear();

  if (mode === "year") return `${year}`;

  if (mode === "month") {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  // week mode — ISO week number
  const weekNum = getISOWeekNumber(d);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Get the ISO 8601 week number for a date.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

/**
 * Format a period key into a human-readable label for the X axis.
 *   "2026-W25" → "W25 (6/16)"
 *   "2026-06"  → "6月"
 *   "2026"     → "2026"
 */
function formatPeriodLabel(periodKey: string, mode: PeriodMode): string {
  if (mode === "year") return periodKey;

  if (mode === "month") {
    const parts = periodKey.split("-");
    if (parts.length === 2) {
      const m = parseInt(parts[1], 10);
      if (!Number.isNaN(m)) return `${m}月`;
    }
    return periodKey;
  }

  // week mode — show week number + start date
  const match = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);
    const startDate = getISOWeekStartDate(year, week);
    const m = startDate.getMonth() + 1;
    const d = startDate.getDate();
    return `W${week} (${m}/${d})`;
  }
  return periodKey;
}

/**
 * Get the Monday of a given ISO week.
 */
function getISOWeekStartDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (week - 1) * 7);
  return target;
}
