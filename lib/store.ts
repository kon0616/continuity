// ─── Zustand UI Store ────────────────────────────────────────
// Holds DERIVED state from snapshots, not raw events.
// Actions dispatch events → rebuild snapshots → update store.
//
// aiSettings is persisted in localStorage so the user's
// API key / base URL / systemPrompt survive page refreshes.

import { create } from "zustand";
import { appendEvent, clearAllData, deleteTaskDaySessions, deleteTaskRangeSessions } from "./db";
import {
  createTaskCreatedEvent,
  createSessionStartedEvent,
  createSessionEndedEvent,
  createRestartNoteFiledEvent,
  createTaskCompletedEvent,
  createTaskDeletedEvent,
  createTaskScheduledEvent,
  createReminderAddedEvent,
  createReminderClearedEvent,
} from "./events";
import {
  buildAppSnapshot,
  type AppSnapshot,
  type TaskSnapshot,
  type DayTimelineGroup,
  type GanttTaskData,
  type ReminderInfo,
} from "./snapshots";

// ─── AI Settings (BYOK, persisted to localStorage) ───────────

export interface AISettings {
  apiKey: string;
  baseURL: string;
  systemPrompt: string;
}

const DEFAULT_AI_SETTINGS: AISettings = {
  apiKey: "",
  baseURL: "https://api.deepseek.com/v1",
  systemPrompt:
    "你是一个效率专家。请根据用户提供的具体任务名称，将其拆解为 3-5 个极其具体、可执行的小步骤。直接返回 JSON 数组。",
};

function loadAISettings(): AISettings {
  if (typeof window === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem("continuity-ai-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey ?? "",
        baseURL: parsed.baseURL ?? DEFAULT_AI_SETTINGS.baseURL,
        systemPrompt: parsed.systemPrompt ?? DEFAULT_AI_SETTINGS.systemPrompt,
      };
    }
  } catch {
    // corrupted localStorage — fall through to default
  }
  return { ...DEFAULT_AI_SETTINGS };
}

function saveAISettings(settings: AISettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("continuity-ai-settings", JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ─── Store shape ─────────────────────────────────────────────

interface ContinuityState {
  // Derived snapshot state
  tasks: TaskSnapshot[];
  activeSession: { taskId: string; sessionId: string } | null;
  sessionStartedAt: number | null; // absolute timestamp for drift-proof timer
  timeline: AppSnapshot["timeline"];
  dayTimeline: DayTimelineGroup[];
  ganttTasks: GanttTaskData[];
  reminders: ReminderInfo[];

  // UI-only state (not persisted in events)
  selectedTaskId: string | null;
  isRestartNoteModalOpen: boolean;
  pendingEndSession: { taskId: string; sessionId: string; durationMs: number } | null;
  isLoading: boolean;

  // Welcome-back modal (daily check-in)
  welcomeBackOpen: boolean;
  welcomeBackNote: string;

  // AI settings (BYOK, persisted to localStorage)
  aiSettings: AISettings;

  // AI breakdown state (transient UI state)
  breakdownOpen: boolean;
  breakdownTitle: string;
  breakdownPrompt: string;
  breakdownSubtasks: string[];
  breakdownLoading: boolean;
  breakdownError: string | null;

  // Settings modal
  settingsOpen: boolean;

  // ─── Actions ───────────────────────────────────────────────
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  createTask: (title: string) => Promise<string>;
  startSession: (taskId: string) => Promise<string>;
  endSession: (taskId: string, sessionId: string) => Promise<void>;
  fileRestartNote: (note: string) => Promise<void>;
  addRetrospectiveNote: (taskId: string, note: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  deleteDaySessions: (taskId: string, dateStr: string) => Promise<void>;
  deleteRangeSessions: (taskId: string, startMs: number, endMs: number) => Promise<void>;
  scheduleTask: (taskId: string, startDate: string, endDate: string | null) => Promise<void>;
  selectTask: (taskId: string | null) => void;
  openRestartNoteModal: (taskId: string, sessionId: string) => void;
  closeRestartNoteModal: () => void;
  resetAll: () => Promise<void>;

  // Reminder actions
  addReminder: (content: string, taskId?: string | null) => Promise<void>;
  clearReminder: (reminderId: string) => Promise<void>;

  // Welcome-back modal
  openWelcomeBack: () => void;
  closeWelcomeBack: () => void;
  setWelcomeBackNote: (note: string) => void;
  submitWelcomeBackNotes: () => Promise<void>;

  // AI settings actions
  updateAISettings: (settings: Partial<AISettings>) => void;

  // Settings modal
  openSettings: () => void;
  closeSettings: () => void;

  // AI breakdown actions (BYOK flow)
  openBreakdown: (title: string) => void;
  closeBreakdown: () => void;
  setBreakdownPrompt: (prompt: string) => void;
  setBreakdownSubtasks: (subtasks: string[]) => void;
  setBreakdownLoading: (loading: boolean) => void;
  requestBreakdown: () => Promise<void>;
  confirmBreakdown: (selectedIndices: number[]) => Promise<void>;
}

// ─── Store implementation ────────────────────────────────────

export const useStore = create<ContinuityState>((set, get) => ({
  // Initial state
  tasks: [],
  activeSession: null,
  sessionStartedAt: null,
  timeline: [],
  dayTimeline: [],
  ganttTasks: [],
  reminders: [],
  selectedTaskId: null,
  isRestartNoteModalOpen: false,
  pendingEndSession: null,
  isLoading: true,
  welcomeBackOpen: false,
  welcomeBackNote: "",

  // AI state
  aiSettings: loadAISettings(),
  breakdownOpen: false,
  breakdownTitle: "",
  breakdownPrompt: "",
  breakdownSubtasks: [],
  breakdownLoading: false,
  breakdownError: null,
  settingsOpen: false,

  // ─── Snapshot actions ──────────────────────────────────────

  initialize: async () => {
    set({ isLoading: true });
    const snapshot = await buildAppSnapshot();

    // ── Welcome-back: check if this is the first visit today ──
    let welcomeOpen = false;
    if (typeof window !== "undefined") {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const lastVisit = localStorage.getItem("continuity-last-visit");
      if (lastVisit !== today) {
        welcomeOpen = true;
        localStorage.setItem("continuity-last-visit", today);
      }
    }

    set({
      tasks: snapshot.tasks,
      activeSession: snapshot.activeSession,
      timeline: snapshot.timeline,
      dayTimeline: snapshot.dayTimeline,
      ganttTasks: snapshot.ganttTasks,
      reminders: snapshot.reminders,
      isLoading: false,
      welcomeBackOpen: welcomeOpen,
      welcomeBackNote: "",
      // Restore the ORIGINAL session start time from the event log.
      // The absolute timer (Date.now() - sessionStartedAt) will
      // instantly show the correct elapsed duration.
      sessionStartedAt: snapshot.activeSession?.startedAt ?? null,
    });
  },

  refresh: async () => {
    const snapshot = await buildAppSnapshot();
    const prev = get();
    // Preserve sessionStartedAt if the same session is still active
    const sameSession =
      prev.activeSession?.sessionId === snapshot.activeSession?.sessionId;
    set({
      tasks: snapshot.tasks,
      activeSession: snapshot.activeSession,
      sessionStartedAt: sameSession ? prev.sessionStartedAt : null,
      timeline: snapshot.timeline,
      dayTimeline: snapshot.dayTimeline,
      ganttTasks: snapshot.ganttTasks,
      reminders: snapshot.reminders,
    });
  },

  createTask: async (title: string) => {
    const event = createTaskCreatedEvent(title);
    await appendEvent(event);
    await get().refresh();
    const tasks = get().tasks;
    const newTask = tasks.find((t) => t.taskId === event.payload.taskId);
    if (newTask) {
      set({ selectedTaskId: newTask.taskId });
    }
    return event.payload.taskId;
  },

  startSession: async (taskId: string) => {
    const event = createSessionStartedEvent(taskId);
    const now = Date.now();
    await appendEvent(event);
    await get().refresh();
    // Record absolute start time for drift-proof timer
    set({ activeSession: { taskId, sessionId: event.payload.sessionId }, sessionStartedAt: now });
    return event.payload.sessionId;
  },

  endSession: async (taskId: string, sessionId: string) => {
    // Compute final duration BEFORE clearing sessionStartedAt
    const startedAt = get().sessionStartedAt;
    const durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;

    const event = createSessionEndedEvent(taskId, sessionId);
    await appendEvent(event);
    await get().refresh();
    set({
      isRestartNoteModalOpen: true,
      pendingEndSession: { taskId, sessionId, durationMs },
      sessionStartedAt: null,
    });
  },

  fileRestartNote: async (note: string) => {
    const pending = get().pendingEndSession;
    if (!pending) return;
    const event = createRestartNoteFiledEvent(
      pending.taskId,
      pending.sessionId,
      note
    );
    await appendEvent(event);
    await get().refresh();
    set({ isRestartNoteModalOpen: false, pendingEndSession: null });
  },

  addRetrospectiveNote: async (taskId: string, note: string) => {
    if (!note.trim()) return;
    // Use a synthetic sessionId for post-completion notes
    const syntheticSessionId = `retro-${Date.now()}`;
    const event = createRestartNoteFiledEvent(taskId, syntheticSessionId, note.trim());
    await appendEvent(event);
    await get().refresh();
  },

  completeTask: async (taskId: string) => {
    const task = get().tasks.find((t) => t.taskId === taskId);
    if (task?.currentSessionId) {
      await appendEvent(createSessionEndedEvent(taskId, task.currentSessionId));
    }
    const event = createTaskCompletedEvent(taskId);
    await appendEvent(event);
    await get().refresh();
  },

  deleteTask: async (taskId: string) => {
    const task = get().tasks.find((t) => t.taskId === taskId);
    if (task?.currentSessionId) {
      await appendEvent(createSessionEndedEvent(taskId, task.currentSessionId));
    }
    const event = createTaskDeletedEvent(taskId);
    await appendEvent(event);
    await get().refresh();
    if (get().selectedTaskId === taskId) {
      set({ selectedTaskId: null });
    }
  },

  deleteDaySessions: async (taskId: string, dateStr: string) => {
    await deleteTaskDaySessions(taskId, dateStr);
    await get().refresh();
  },

  deleteRangeSessions: async (taskId: string, startMs: number, endMs: number) => {
    await deleteTaskRangeSessions(taskId, startMs, endMs);
    await get().refresh();
  },

  scheduleTask: async (taskId: string, startDate: string, endDate: string | null) => {
    const event = createTaskScheduledEvent(taskId, startDate, endDate);
    await appendEvent(event);
    await get().refresh();
  },

  // ─── Reminder actions ────────────────────────────────────

  addReminder: async (content: string, taskId: string | null = null) => {
    if (!content.trim()) return;
    const event = createReminderAddedEvent(content.trim(), taskId);
    await appendEvent(event);
    await get().refresh();
  },

  clearReminder: async (reminderId: string) => {
    const event = createReminderClearedEvent(reminderId);
    await appendEvent(event);
    await get().refresh();
  },

  // ─── Welcome-back modal ──────────────────────────────────

  openWelcomeBack: () => set({ welcomeBackOpen: true }),
  closeWelcomeBack: () => set({ welcomeBackOpen: false, welcomeBackNote: "" }),
  setWelcomeBackNote: (note: string) => set({ welcomeBackNote: note }),
  submitWelcomeBackNotes: async () => {
    const note = get().welcomeBackNote.trim();
    if (!note) {
      set({ welcomeBackOpen: false, welcomeBackNote: "" });
      return;
    }
    // Each line of the note becomes a separate reminder
    const lines = note
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
    for (const line of lines) {
      const event = createReminderAddedEvent(line, null);
      await appendEvent(event);
    }
    await get().refresh();
    set({ welcomeBackOpen: false, welcomeBackNote: "" });
  },

  selectTask: (taskId: string | null) => {
    set({ selectedTaskId: taskId });
  },

  openRestartNoteModal: (taskId: string, sessionId: string) => {
    set({ isRestartNoteModalOpen: true, pendingEndSession: { taskId, sessionId, durationMs: 0 } });
  },

  closeRestartNoteModal: () => {
    set({ isRestartNoteModalOpen: false, pendingEndSession: null });
  },

  resetAll: async () => {
    await clearAllData();
    set({
      tasks: [],
      activeSession: null,
      sessionStartedAt: null,
      timeline: [],
      dayTimeline: [],
      ganttTasks: [],
      reminders: [],
      selectedTaskId: null,
      isRestartNoteModalOpen: false,
      pendingEndSession: null,
      welcomeBackOpen: false,
      welcomeBackNote: "",
      breakdownOpen: false,
      breakdownTitle: "",
      breakdownPrompt: "",
      breakdownSubtasks: [],
      breakdownLoading: false,
      breakdownError: null,
    });
  },

  // ─── AI settings actions ──────────────────────────────────

  updateAISettings: (partial: Partial<AISettings>) => {
    const current = get().aiSettings;
    const updated = { ...current, ...partial };
    saveAISettings(updated);
    set({ aiSettings: updated });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  // ─── AI breakdown actions (BYOK flow) ─────────────────────

  openBreakdown: (title: string) => {
    const { aiSettings } = get();
    set({
      breakdownOpen: true,
      breakdownTitle: title,
      breakdownPrompt: aiSettings.systemPrompt,
      breakdownSubtasks: [],
      breakdownLoading: false,
      breakdownError: null,
    });
  },

  closeBreakdown: () => {
    set({
      breakdownOpen: false,
      breakdownTitle: "",
      breakdownPrompt: "",
      breakdownSubtasks: [],
      breakdownLoading: false,
      breakdownError: null,
    });
  },

  setBreakdownPrompt: (prompt: string) => set({ breakdownPrompt: prompt }),
  setBreakdownSubtasks: (subtasks: string[]) => set({ breakdownSubtasks: subtasks }),
  setBreakdownLoading: (loading: boolean) => set({ breakdownLoading: loading }),

  requestBreakdown: async () => {
    const { aiSettings, breakdownTitle, breakdownPrompt } = get();

    if (!aiSettings.apiKey) {
      set({
        breakdownError: "⚠️ 请先在设置中填写 API Key。点击「⚙️ AI 设置」填写 DeepSeek / OpenAI 的 API Key。",
        breakdownSubtasks: [],
        breakdownLoading: false,
      });
      return;
    }

    set({ breakdownLoading: true, breakdownSubtasks: [], breakdownError: null });

    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: aiSettings.apiKey,
          baseURL: aiSettings.baseURL,
          systemPrompt: breakdownPrompt,
          taskName: breakdownTitle,
        }),
      });

      // ═══ Read body ONCE — for both success AND error paths ═══
      const resBody = await res.json().catch(() => null);

      if (!res.ok) {
        // Extract real error from API response body
        const apiError =
          (resBody && resBody.error) ??
          `HTTP ${res.status} ${res.statusText}`;
        set({
          breakdownError: `❌ ${apiError}`,
          breakdownSubtasks: [],
          breakdownLoading: false,
        });
        return;
      }

      if (resBody && Array.isArray(resBody.subtasks) && resBody.subtasks.length > 0) {
        set({
          breakdownSubtasks: resBody.subtasks,
          breakdownError: null,
          breakdownLoading: false,
        });
      } else {
        const msg = resBody?.error ?? "AI 未返回有效子任务，请尝试更具体的任务描述或调整 System Prompt。";
        set({
          breakdownError: `⚠️ ${msg}`,
          breakdownSubtasks: [],
          breakdownLoading: false,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "未知网络错误";
      set({
        breakdownError: `❌ 网络请求失败：${msg}。请检查 Base URL 是否正确（当前：${aiSettings.baseURL}）。`,
        breakdownSubtasks: [],
        breakdownLoading: false,
      });
    }
  },

  confirmBreakdown: async (selectedIndices: number[]) => {
    const { breakdownSubtasks, refresh } = get();
    // ═══ STRICT FILTER: no blanks, no undefined, no whitespace-only strings ═══
    const selected = selectedIndices
      .sort((a, b) => a - b)
      .map((i) => breakdownSubtasks[i])
      .filter(
        (s): s is string =>
          typeof s === "string" && s.trim().length > 0
      )
      .map((s) => s.trim());

    if (selected.length === 0) return;

    for (const title of selected) {
      const event = createTaskCreatedEvent(title);
      await appendEvent(event);
    }

    await refresh();

    set({
      breakdownOpen: false,
      breakdownTitle: "",
      breakdownPrompt: "",
      breakdownSubtasks: [],
      breakdownLoading: false,
      breakdownError: null,
    });
  },
}));
