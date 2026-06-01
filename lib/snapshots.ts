// ─── Snapshot Layer ──────────────────────────────────────────
// Snapshots are DERIVED state computed from the append-only event log.
// The UI reads from snapshots, NOT from raw events directly.

import { getAllEvents, getDB } from "./db";
import type {
  AppEvent,
  EventRecord,
  TaskCreatedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  RestartNoteFiledEvent,
  TaskCompletedEvent,
  TaskDeletedEvent,
  TaskScheduledEvent,
  ReminderAddedEvent,
  ReminderClearedEvent,
} from "./events";

// ─── Snapshot types ──────────────────────────────────────────

export interface TaskSnapshot {
  taskId: string;
  title: string;
  status: "active" | "completed" | "deleted";
  currentSessionId: string | null;
  sessionCount: number;
  lastRestartNote: string | null;
  lastRestartNoteTimestamp: number | null;
  createdAt: number;
  completedAt: number | null;
  deletedAt: number | null;
  // Manual scheduling (from latest TASK_SCHEDULED)
  scheduledStartDate: string | null;   // YYYY-MM-DD
  scheduledEndDate: string | null;     // YYYY-MM-DD or null
}

export interface SessionInfo {
  sessionId: string;
  taskId: string;
  startedAt: number;
  endedAt: number | null;
  restartNote: string | null;
  status: "active" | "ended";
}

export interface TimelineEntry {
  timestamp: number;
  eventType: AppEvent["type"];
  taskId: string;
  taskTitle: string;
  summary: string;
}

// ─── Aggregated Timeline types ──────────────────────────────

export interface TaskDaySummary {
  taskId: string;
  taskTitle: string;
  restartNote: string | null;
  restartNoteTimestamp: number | null;
  wasCompleted: boolean;
  completedAt: number | null;
  totalFocusMs: number;
  sessionCount: number;
}

export interface DayTimelineGroup {
  date: string;
  timestamp: number;
  tasks: TaskDaySummary[];
}

// ─── Gantt Chart types ──────────────────────────────────────

export interface ReminderInfo {
  id: string;
  taskId: string | null;
  content: string;
  createdAt: number;
}

export interface GanttTaskData {
  taskId: string;
  title: string;
  status: "active" | "completed";
  startedAt: number;        // epoch: manual date or first session
  lastActivityAt: number;   // epoch: manual end or latest activity or now
  totalFocusMs: number;
  sessionCount: number;
  isManuallyScheduled: boolean;
  scheduledStartDate: string | null;   // YYYY-MM-DD
  scheduledEndDate: string | null;     // YYYY-MM-DD or null
}

export interface AppSnapshot {
  tasks: TaskSnapshot[];
  activeSession: { taskId: string; sessionId: string } | null;
  timeline: TimelineEntry[];
  dayTimeline: DayTimelineGroup[];
  ganttTasks: GanttTaskData[];
  reminders: ReminderInfo[];
}

// ─── Snapshot cache type ─────────────────────────────────────

export interface SnapshotCache {
  id: string;
  type: string;
  data: unknown;
  updatedAt: number;
}

// ─── Type narrowing helpers ──────────────────────────────────

function asTaskCreated(r: EventRecord): TaskCreatedEvent {
  return { type: r.type, payload: r.payload } as TaskCreatedEvent;
}
function asSessionStarted(r: EventRecord): SessionStartedEvent {
  return { type: r.type, payload: r.payload } as SessionStartedEvent;
}
function asSessionEnded(r: EventRecord): SessionEndedEvent {
  return { type: r.type, payload: r.payload } as SessionEndedEvent;
}
function asRestartNoteFiled(r: EventRecord): RestartNoteFiledEvent {
  return { type: r.type, payload: r.payload } as RestartNoteFiledEvent;
}
function asTaskCompleted(r: EventRecord): TaskCompletedEvent {
  return { type: r.type, payload: r.payload } as TaskCompletedEvent;
}
function asTaskDeleted(r: EventRecord): TaskDeletedEvent {
  return { type: r.type, payload: r.payload } as TaskDeletedEvent;
}
function asTaskScheduled(r: EventRecord): TaskScheduledEvent {
  return { type: r.type, payload: r.payload } as TaskScheduledEvent;
}
function asReminderAdded(r: EventRecord): ReminderAddedEvent {
  return { type: r.type, payload: r.payload } as ReminderAddedEvent;
}
function asReminderCleared(r: EventRecord): ReminderClearedEvent {
  return { type: r.type, payload: r.payload } as ReminderClearedEvent;
}

// ─── Safe helpers ────────────────────────────────────────────

function safeTimestamp(ts: unknown): number {
  if (typeof ts === "number" && !Number.isNaN(ts) && ts > 0) return ts;
  return Date.now();
}
function safeStr(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
function isValidDate(ts: number): boolean {
  if (typeof ts !== "number" || Number.isNaN(ts) || ts <= 0) return false;
  return !Number.isNaN(new Date(ts).getTime());
}
function getDateKey(ts: number): string {
  if (!isValidDate(ts)) return "0000-00-00";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ═══ ULTIMATE DEFENSE ═══
 * Validates an EventRecord before it enters the snapshot pipeline.
 * Returns false for any event that would cause a downstream crash.
 */
function isEventValid(raw: EventRecord): boolean {
  if (!raw) return false;
  if (!raw.type || typeof raw.type !== "string") return false;
  if (!raw.payload || typeof raw.payload !== "object") return false;
  // timestamp is validated via safeTimestamp() downstream
  return true;
}

/** Safe payload field access — bypasses TypeScript union narrowing issues. */
function pget(raw: EventRecord, field: string): unknown {
  return (raw.payload as Record<string, unknown>)?.[field];
}

// ─── Core snapshot builder ───────────────────────────────────

export async function buildAppSnapshot(): Promise<AppSnapshot> {
  const events: EventRecord[] = (await getAllEvents()) ?? [];

  const taskMap = new Map<string, TaskSnapshot>();
  const sessionMap = new Map<string, SessionInfo>();
  const timeline: TimelineEntry[] = [];
  let activeSession: { taskId: string; sessionId: string } | null = null;
  const deletedTaskIds = new Set<string>();

  // ═══ Pass 0: collect deleted task IDs first ═══
  for (const raw of events) {
    if (!isEventValid(raw)) continue;
    if (raw.type === "TASK_DELETED") {
      const tid = safeStr(pget(raw, "taskId"));
      if (tid) deletedTaskIds.add(tid);
    }
  }

  // ═══ Pass 1: process all events ═══
  for (const raw of events) {
    if (!isEventValid(raw)) continue;

    const ts = safeTimestamp(raw.timestamp);

    switch (raw.type) {
      case "TASK_CREATED": {
        const taskId = safeStr(pget(raw, "taskId"));
        const title = safeStr(pget(raw, "title"), "未命名任务");
        if (!taskId) continue;
        // ═══ Skip if already deleted ═══
        if (deletedTaskIds.has(taskId)) continue;

        taskMap.set(taskId, {
          taskId, title,
          status: "active",
          currentSessionId: null,
          sessionCount: 0,
          lastRestartNote: null,
          lastRestartNoteTimestamp: null,
          createdAt: ts,
          completedAt: null,
          deletedAt: null,
          scheduledStartDate: null,
          scheduledEndDate: null,
        });
        timeline.push({
          timestamp: ts, eventType: "TASK_CREATED",
          taskId, taskTitle: title,
          summary: `Task created: ${title}`,
        });
        break;
      }

      case "SESSION_STARTED": {
        const taskId = safeStr(pget(raw, "taskId"));
        const sessionId = safeStr(pget(raw, "sessionId"));
        if (!taskId || !sessionId) continue;
        if (deletedTaskIds.has(taskId)) continue;

        const task = taskMap.get(taskId);
        if (task) {
          task.currentSessionId = sessionId;
          task.sessionCount += 1;
        }
        sessionMap.set(sessionId, {
          sessionId, taskId,
          startedAt: ts, endedAt: null,
          restartNote: null, status: "active",
        });
        activeSession = { taskId, sessionId };
        if (task) {
          timeline.push({
            timestamp: ts, eventType: "SESSION_STARTED",
            taskId, taskTitle: task.title,
            summary: `Session started: ${task.title}`,
          });
        }
        break;
      }

      case "SESSION_ENDED": {
        const taskId = safeStr(pget(raw, "taskId"));
        const sessionId = safeStr(pget(raw, "sessionId"));
        if (!taskId || !sessionId) continue;
        if (deletedTaskIds.has(taskId)) continue;

        const task = taskMap.get(taskId);
        if (task) task.currentSessionId = null;
        const session = sessionMap.get(sessionId);
        if (session) { session.endedAt = ts; session.status = "ended"; }
        if (activeSession && activeSession.sessionId === sessionId) {
          activeSession = null;
        }
        if (task) {
          timeline.push({
            timestamp: ts, eventType: "SESSION_ENDED",
            taskId, taskTitle: task.title,
            summary: `Session ended: ${task.title}`,
          });
        }
        break;
      }

      case "RESTART_NOTE_FILED": {
        const taskId = safeStr(pget(raw, "taskId"));
        const sessionId = safeStr(pget(raw, "sessionId"));
        const note = safeStr(pget(raw, "note"), "");
        if (!taskId || !sessionId || !note) continue;
        if (deletedTaskIds.has(taskId)) continue;

        const task = taskMap.get(taskId);
        if (task) {
          task.lastRestartNote = note;
          task.lastRestartNoteTimestamp = ts;
        }
        const session = sessionMap.get(sessionId);
        if (session) session.restartNote = note;
        if (task) {
          timeline.push({
            timestamp: ts, eventType: "RESTART_NOTE_FILED",
            taskId, taskTitle: task.title,
            summary: `Restart note: ${task.title} — "${truncateNote(note)}"`,
          });
        }
        break;
      }

      case "TASK_COMPLETED": {
        const taskId = safeStr(pget(raw, "taskId"));
        if (!taskId) continue;
        if (deletedTaskIds.has(taskId)) continue;

        const task = taskMap.get(taskId);
        if (task) {
          task.status = "completed";
          task.completedAt = ts;
          task.currentSessionId = null;
        }
        if (task) {
          timeline.push({
            timestamp: ts, eventType: "TASK_COMPLETED",
            taskId, taskTitle: task.title,
            summary: `Task completed: ${task.title}`,
          });
        }
        break;
      }

      case "TASK_DELETED": {
        const taskId = safeStr(pget(raw, "taskId"));
        if (!taskId) continue;

        const task = taskMap.get(taskId);
        if (task) {
          task.status = "deleted";
          task.deletedAt = ts;
          task.currentSessionId = null;
        }
        break;
      }

      case "TASK_SCHEDULED": {
        const taskId = safeStr(pget(raw, "taskId"));
        if (!taskId || deletedTaskIds.has(taskId)) continue;

        const startDate = safeStr(pget(raw, "startDate"), "");
        const endDate = safeStr(pget(raw, "endDate"), "") || null;

        const task = taskMap.get(taskId);
        if (task && startDate) {
          task.scheduledStartDate = startDate;
          task.scheduledEndDate = endDate;
        }
        // TASK_SCHEDULED does not appear in timeline — it updates metadata
        break;
      }

      default:
        break;
    }
  }

  // ═══ Build derived data ═══
  const dayTimeline = buildDayTimeline(events, taskMap, deletedTaskIds);
  const ganttTasks = buildGanttTasks(events, taskMap, deletedTaskIds);
  const reminders = buildReminders(events);

  // ═══ Filter deleted tasks from the task list ═══
  const visibleTasks = Array.from(taskMap.values()).filter(
    (t) => t.status !== "deleted"
  );

  return {
    tasks: visibleTasks,
    activeSession,
    timeline: timeline.reverse(),
    dayTimeline,
    ganttTasks,
    reminders,
  };
}

// ─── Individual snapshot builders ────────────────────────────

export async function buildTaskSnapshot(taskId: string): Promise<TaskSnapshot | null> {
  const snapshot = await buildAppSnapshot();
  return snapshot.tasks.find((t) => t.taskId === taskId) ?? null;
}

export async function buildTimelineSnapshot(): Promise<TimelineEntry[]> {
  const snapshot = await buildAppSnapshot();
  return snapshot.timeline;
}

// ─── Aggregated Day Timeline Builder ─────────────────────────

function buildDayTimeline(
  events: EventRecord[],
  taskMap: Map<string, TaskSnapshot>,
  deletedTaskIds: Set<string>
): DayTimelineGroup[] {
  const safeEvents = events ?? [];

  // ── Session pairs ──────────────────────────────────────────
  const sessionPairs: Array<{ taskId: string; startedAt: number; endedAt: number }> = [];
  const pendingStarts = new Map<string, number>();

  for (const raw of safeEvents) {
    if (!raw || !raw.type) continue;

    if (raw.type === "SESSION_STARTED") {
      const sid = safeStr(pget(raw, "sessionId"));
      const ts = safeTimestamp(raw.timestamp);
      const tid = safeStr(pget(raw, "taskId"));
      if (sid && tid && !deletedTaskIds.has(tid)) pendingStarts.set(sid, ts);
    } else if (raw.type === "SESSION_ENDED") {
      const sid = safeStr(pget(raw, "sessionId"));
      const tid = safeStr(pget(raw, "taskId"));
      const startedAt = sid ? pendingStarts.get(sid) : undefined;
      const ts = safeTimestamp(raw.timestamp);
      if (tid && startedAt !== undefined && !deletedTaskIds.has(tid)) {
        sessionPairs.push({ taskId: tid, startedAt, endedAt: ts });
        pendingStarts.delete(sid!);
      }
    }
  }

  const dayTaskMap = new Map<string, TaskDaySummary>();

  const getOrCreate = (dateKey: string, taskId: string): TaskDaySummary => {
    const composite = `${dateKey}::${taskId}`;
    if (!dayTaskMap.has(composite)) {
      const task = taskMap.get(taskId);
      dayTaskMap.set(composite, {
        taskId,
        taskTitle: task?.title ?? taskId,
        restartNote: null,
        restartNoteTimestamp: null,
        wasCompleted: false,
        completedAt: null,
        totalFocusMs: 0,
        sessionCount: 0,
      });
    }
    return dayTaskMap.get(composite)!;
  };

  // RESTART_NOTE_FILED
  for (const raw of safeEvents) {
    if (!raw || raw.type !== "RESTART_NOTE_FILED") continue;
    const note = safeStr(pget(raw, "note"), "");
    if (!note) continue;
    const taskId = safeStr(pget(raw, "taskId"));
    if (!taskId || deletedTaskIds.has(taskId)) continue;
    const ts = safeTimestamp(raw.timestamp);
    const summary = getOrCreate(getDateKey(ts), taskId);
    if (!summary.restartNoteTimestamp || ts > summary.restartNoteTimestamp) {
      summary.restartNote = note;
      summary.restartNoteTimestamp = ts;
    }
  }

  // TASK_COMPLETED
  for (const raw of safeEvents) {
    if (!raw || raw.type !== "TASK_COMPLETED") continue;
    const taskId = safeStr(pget(raw, "taskId"));
    if (!taskId || deletedTaskIds.has(taskId)) continue;
    const ts = safeTimestamp(raw.timestamp);
    const summary = getOrCreate(getDateKey(ts), taskId);
    summary.wasCompleted = true;
    summary.completedAt = ts;
  }

  // Session durations
  for (const pair of sessionPairs) {
    const taskId = safeStr(pair.taskId);
    if (!taskId || deletedTaskIds.has(taskId)) continue;
    const summary = getOrCreate(getDateKey(pair.startedAt), taskId);
    summary.totalFocusMs += Math.max(0, pair.endedAt - pair.startedAt);
    summary.sessionCount += 1;
  }

  // Group by date
  const dateGroups = new Map<string, TaskDaySummary[]>();
  dayTaskMap.forEach((summary, composite) => {
    const dateKey = composite.split("::")[0] ?? "0000-00-00";
    if (!dateGroups.has(dateKey)) dateGroups.set(dateKey, []);
    dateGroups.get(dateKey)!.push(summary);
  });

  const result: DayTimelineGroup[] = [];
  dateGroups.forEach((tasks, date) => {
    let noonTs = Date.now();
    const parts = date.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        const candidate = new Date(y, m - 1, d, 12, 0, 0).getTime();
        if (!Number.isNaN(candidate)) noonTs = candidate;
      }
    }
    result.push({
      date,
      timestamp: noonTs,
      tasks: tasks.sort((a, b) => {
        if (a.wasCompleted && !b.wasCompleted) return 1;
        if (!a.wasCompleted && b.wasCompleted) return -1;
        return 0;
      }),
    });
  });

  result.sort((a, b) => b.timestamp - a.timestamp);
  return result;
}

// ─── Gantt Task Data Builder ─────────────────────────────────
// Priority: manual TASK_SCHEDULED dates > auto session dates.
//   startedAt = scheduled start date → first session → task created
//   lastActivityAt = scheduled end date → latest activity → now (for active)

function buildGanttTasks(
  events: EventRecord[],
  taskMap: Map<string, TaskSnapshot>,
  deletedTaskIds: Set<string>
): GanttTaskData[] {
  const safeEvents = events ?? [];

  // Track latest TASK_SCHEDULED per task
  const scheduleMap = new Map<string, { startDate: string; endDate: string | null }>();

  for (const raw of safeEvents) {
    if (!raw || raw.type !== "TASK_SCHEDULED") continue;
    const taskId = safeStr(pget(raw, "taskId"));
    if (!taskId || deletedTaskIds.has(taskId)) continue;
    const startDate = safeStr(pget(raw, "startDate"), "");
    if (!startDate) continue;
    const endDate = safeStr(pget(raw, "endDate"), "") || null;
    scheduleMap.set(taskId, { startDate, endDate });
  }

  // Helper: parse YYYY-MM-DD to epoch at noon UTC
  const parseDate = (d: string): number | null => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const [y, m, day] = d.split("-").map(Number);
    const ts = new Date(y, m - 1, day, 12, 0, 0).getTime();
    return Number.isNaN(ts) ? null : ts;
  };

  // Track auto (session-based) data
  const ganttMap = new Map<string, {
    firstSessionAt: number;
    lastActivityAt: number;
    totalFocusMs: number;
    sessionCount: number;
  }>();

  const pendingStarts = new Map<string, { taskId: string; startedAt: number }>();

  for (const raw of safeEvents) {
    if (!raw || !raw.type) continue;
    const taskId = safeStr(pget(raw, "taskId"));
    if (!taskId || deletedTaskIds.has(taskId)) continue;
    const ts = safeTimestamp(raw.timestamp);

    if (!ganttMap.has(taskId)) {
      ganttMap.set(taskId, {
        firstSessionAt: ts, lastActivityAt: ts,
        totalFocusMs: 0, sessionCount: 0,
      });
    }
    const entry = ganttMap.get(taskId)!;

    switch (raw.type) {
      case "SESSION_STARTED": {
        const sessionId = safeStr(pget(raw, "sessionId"));
        if (sessionId) pendingStarts.set(sessionId, { taskId, startedAt: ts });
        if (ts < entry.firstSessionAt) entry.firstSessionAt = ts;
        if (ts > entry.lastActivityAt) entry.lastActivityAt = ts;
        entry.sessionCount += 1;
        break;
      }
      case "SESSION_ENDED": {
        const sessionId = safeStr(pget(raw, "sessionId"));
        const start = sessionId ? pendingStarts.get(sessionId) : undefined;
        if (start) {
          entry.totalFocusMs += Math.max(0, ts - start.startedAt);
          pendingStarts.delete(sessionId!);
        }
        if (ts > entry.lastActivityAt) entry.lastActivityAt = ts;
        break;
      }
      case "RESTART_NOTE_FILED":
      case "TASK_COMPLETED": {
        if (ts > entry.lastActivityAt) entry.lastActivityAt = ts;
        break;
      }
    }
  }

  // ═══ Filter: ONLY tasks with TASK_SCHEDULED appear in Gantt ═══
  // Auto-detected (session-based) tasks are excluded — they belong
  // in the daily timeline, not the long-range overview.
  const result: GanttTaskData[] = [];
  const now = Date.now();

  Array.from(taskMap.values()).forEach((task) => {
    if (task.status === "deleted") return;

    const schedule = scheduleMap.get(task.taskId);
    // ── Skip tasks without manual scheduling ────────────────
    if (!schedule) return;

    const auto = ganttMap.get(task.taskId);

    const schedStart = schedule.startDate;
    const schedEnd = schedule.endDate;

    const parsedStart = parseDate(schedule.startDate);
    const parsedEnd = schedule.endDate ? parseDate(schedule.endDate) : null;

    const startedAt = parsedStart ?? auto?.firstSessionAt ?? task.createdAt;
    const lastActivityAt = parsedEnd
      ?? (parsedStart ? Math.max(parsedStart, now) : (auto?.lastActivityAt ?? task.createdAt));

    result.push({
      taskId: task.taskId,
      title: task.title,
      status: task.status === "completed" ? "completed" : "active",
      startedAt,
      lastActivityAt,
      totalFocusMs: auto?.totalFocusMs ?? 0,
      sessionCount: auto?.sessionCount ?? 0,
      isManuallyScheduled: true,
      scheduledStartDate: schedStart,
      scheduledEndDate: schedEnd,
    });
  });

  result.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return a.startedAt - b.startedAt;
  });

  return result;
}

// ─── Reminder Builder ────────────────────────────────────────
// Active reminders = all REMINDER_ADDED − all REMINDER_CLEARED.

function buildReminders(events: EventRecord[]): ReminderInfo[] {
  const safeEvents = events ?? [];
  const clearedIds = new Set<string>();
  const active = new Map<string, ReminderInfo>();

  // Pass 1: collect cleared IDs
  for (const raw of safeEvents) {
    if (!raw || raw.type !== "REMINDER_CLEARED") continue;
    const rid = safeStr(pget(raw, "reminderId"));
    if (rid) clearedIds.add(rid);
  }

  // Pass 2: add non-cleared reminders
  for (const raw of safeEvents) {
    if (!raw || raw.type !== "REMINDER_ADDED") continue;
    const id = safeStr(pget(raw, "id"));
    if (!id || clearedIds.has(id)) continue;
    const content = safeStr(pget(raw, "content"), "");
    if (!content) continue;
    const taskIdRaw = safeStr(pget(raw, "taskId"), "");
    const taskId = taskIdRaw || null;
    active.set(id, {
      id,
      taskId,
      content,
      createdAt: safeTimestamp(raw.timestamp),
    });
  }

  return Array.from(active.values()).sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Snapshot cache ──────────────────────────────────────────

export async function getCachedOrRebuild<T>(
  cacheKey: string,
  rebuild: () => Promise<T>
): Promise<T> {
  const db = getDB();
  const cached = await db.snapshots.get(cacheKey);
  if (cached) return cached.data as T;
  const data = await rebuild();
  await db.snapshots.put({
    id: cacheKey, type: cacheKey, data, updatedAt: Date.now(),
  });
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────

function truncateNote(note: string, maxLen = 80): string {
  if (!note || note.length <= maxLen) return note ?? "";
  return note.slice(0, maxLen) + "…";
}
