// ─── Event System ────────────────────────────────────────────
// Append-only event log is the source of truth.
// Events are never mutated — only appended.

import { v4 as uuid } from "uuid";

// ─── Event type definitions ──────────────────────────────────

export type AppEvent =
  | TaskCreatedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | RestartNoteFiledEvent
  | TaskCompletedEvent
  | TaskDeletedEvent
  | TaskScheduledEvent
  | ReminderAddedEvent
  | ReminderClearedEvent;

export interface TaskCreatedEvent {
  type: "TASK_CREATED";
  payload: {
    taskId: string;
    title: string;
  };
}

export interface SessionStartedEvent {
  type: "SESSION_STARTED";
  payload: {
    taskId: string;
    sessionId: string;
  };
}

export interface SessionEndedEvent {
  type: "SESSION_ENDED";
  payload: {
    taskId: string;
    sessionId: string;
  };
}

export interface RestartNoteFiledEvent {
  type: "RESTART_NOTE_FILED";
  payload: {
    taskId: string;
    sessionId: string;
    note: string;
  };
}

export interface TaskCompletedEvent {
  type: "TASK_COMPLETED";
  payload: {
    taskId: string;
  };
}

export interface TaskDeletedEvent {
  type: "TASK_DELETED";
  payload: {
    taskId: string;
  };
}

export interface TaskScheduledEvent {
  type: "TASK_SCHEDULED";
  payload: {
    taskId: string;
    startDate: string;      // YYYY-MM-DD
    endDate: string | null;  // YYYY-MM-DD or null
  };
}

export interface ReminderAddedEvent {
  type: "REMINDER_ADDED";
  payload: {
    id: string;
    taskId: string | null;
    content: string;
  };
}

export interface ReminderClearedEvent {
  type: "REMINDER_CLEARED";
  payload: {
    reminderId: string;
  };
}

// ─── Event record (stored in Dexie) ──────────────────────────

export interface EventRecord {
  id: string;
  type: AppEvent["type"];
  timestamp: number;
  payload: AppEvent["payload"];
}

// ─── Event factory functions ─────────────────────────────────

export function createTaskCreatedEvent(title: string): TaskCreatedEvent {
  return { type: "TASK_CREATED", payload: { taskId: uuid(), title } };
}

export function createSessionStartedEvent(taskId: string): SessionStartedEvent {
  return { type: "SESSION_STARTED", payload: { taskId, sessionId: uuid() } };
}

export function createSessionEndedEvent(
  taskId: string,
  sessionId: string
): SessionEndedEvent {
  return { type: "SESSION_ENDED", payload: { taskId, sessionId } };
}

export function createRestartNoteFiledEvent(
  taskId: string,
  sessionId: string,
  note: string
): RestartNoteFiledEvent {
  return { type: "RESTART_NOTE_FILED", payload: { taskId, sessionId, note } };
}

export function createTaskCompletedEvent(taskId: string): TaskCompletedEvent {
  return { type: "TASK_COMPLETED", payload: { taskId } };
}

export function createTaskDeletedEvent(taskId: string): TaskDeletedEvent {
  return { type: "TASK_DELETED", payload: { taskId } };
}

export function createTaskScheduledEvent(
  taskId: string,
  startDate: string,
  endDate: string | null
): TaskScheduledEvent {
  return { type: "TASK_SCHEDULED", payload: { taskId, startDate, endDate } };
}

export function createReminderAddedEvent(
  content: string,
  taskId: string | null = null
): ReminderAddedEvent {
  return { type: "REMINDER_ADDED", payload: { id: uuid(), taskId, content } };
}

export function createReminderClearedEvent(reminderId: string): ReminderClearedEvent {
  return { type: "REMINDER_CLEARED", payload: { reminderId } };
}

// ─── Event type label (human-readable) ───────────────────────

export const EVENT_LABELS: Record<AppEvent["type"], string> = {
  TASK_CREATED: "Task created",
  SESSION_STARTED: "Session started",
  SESSION_ENDED: "Session ended",
  RESTART_NOTE_FILED: "Restart note filed",
  TASK_COMPLETED: "Task completed",
  TASK_DELETED: "Task deleted",
  TASK_SCHEDULED: "Task scheduled",
  REMINDER_ADDED: "Reminder added",
  REMINDER_CLEARED: "Reminder cleared",
};
