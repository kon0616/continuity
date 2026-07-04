// ─── Dexie Database ──────────────────────────────────────────
// Append-only event store + optional snapshot cache.

import Dexie, { type Table } from "dexie";
import type { EventRecord } from "./events";
import type { SnapshotCache } from "./snapshots";

export class ContinuityDB extends Dexie {
  events!: Table<EventRecord, string>;
  snapshots!: Table<SnapshotCache, string>;

  constructor() {
    super("continuity-task-manager");

    this.version(1).stores({
      events: "id, type, timestamp, payload",
      snapshots: "id, type, updatedAt",
    });
  }
}

// Singleton instance — created once, shared across the app.
let dbInstance: ContinuityDB | null = null;

export function getDB(): ContinuityDB {
  if (!dbInstance) {
    dbInstance = new ContinuityDB();
  }
  return dbInstance;
}

// ─── Event Dispatcher ────────────────────────────────────────

import type { AppEvent } from "./events";
import { v4 as uuid } from "uuid";

/**
 * appendEvent — THE core write operation.
 *
 * Every mutation in the system flows through this function.
 * Events are append-only — they are never updated or deleted.
 *
 * Returns the stored EventRecord.
 */
export async function appendEvent(event: AppEvent): Promise<EventRecord> {
  const db = getDB();
  const record: EventRecord = {
    id: uuid(),
    type: event.type,
    timestamp: Date.now(),
    payload: event.payload,
  };

  await db.events.add(record);

  // Invalidate affected snapshot caches after every write.
  // We use a coarse invalidation: clear all snapshot caches
  // because one event can affect multiple snapshot types.
  // For MVP this is fine; for scale, we'd do targeted invalidation.
  await invalidateSnapshotCaches(event);

  return record;
}

/**
 * Invalidates snapshot caches affected by this event.
 * Coarse strategy for MVP: clear all caches on any write.
 */
async function invalidateSnapshotCaches(_event: AppEvent): Promise<void> {
  const db = getDB();
  // In MVP, clear all cached snapshots — simple and correct.
  // Future optimization: only clear caches for the affected taskId.
  await db.snapshots.clear();
}

/**
 * Fetch all events, ordered by timestamp ascending.
 */
export async function getAllEvents(): Promise<EventRecord[]> {
  const db = getDB();
  return db.events.orderBy("timestamp").toArray();
}

/**
 * Fetch events for a specific task, ordered by timestamp.
 */
export async function getTaskEvents(taskId: string): Promise<EventRecord[]> {
  const db = getDB();
  return db.events
    .where("payload.taskId")
    .equals(taskId)
    .sortBy("timestamp");
}

/**
 * Delete a single event by its record ID. Clears snapshot caches afterward.
 * Returns true if an event was deleted, false if no matching ID was found.
 */
export async function deleteEvent(eventId: string): Promise<boolean> {
  const db = getDB();
  const count = await db.events.where("id").equals(eventId).delete();
  if (count > 0) {
    await db.snapshots.clear();
  }
  return count > 0;
}

/**
 * Delete multiple events by their record IDs. Clears snapshot caches once afterward.
 * Returns the number of events actually deleted.
 */
export async function deleteEvents(eventIds: string[]): Promise<number> {
  if (!eventIds || eventIds.length === 0) return 0;
  const db = getDB();
  const count = await db.events.where("id").anyOf(eventIds).delete();
  if (count > 0) {
    await db.snapshots.clear();
  }
  return count;
}

/**
 * Find and delete all events belonging to a specific session.
 * Covers SESSION_STARTED, SESSION_ENDED, and RESTART_NOTE_FILED
 * with the same sessionId, plus any RESTART_NOTE_FILED.
 *
 * Returns the number of events deleted.
 */
export async function deleteSessionEvents(sessionId: string): Promise<number> {
  if (!sessionId) return 0;
  const db = getDB();
  // Collect IDs of events whose payload.sessionId matches
  const allEvents = await db.events.toArray();
  const toDelete = allEvents
    .filter((e) => {
      const sid = (e.payload as Record<string, unknown>)?.sessionId;
      return typeof sid === "string" && sid === sessionId;
    })
    .map((e) => e.id);
  if (toDelete.length === 0) return 0;
  await db.events.bulkDelete(toDelete);
  await db.snapshots.clear();
  return toDelete.length;
}

/**
 * Find and delete all session events for a given task on a specific date.
 * Sessions that STARTED on that date will be fully removed (including
 * their corresponding ENDED and RESTART_NOTE events, even if those
 * occurred on a later date).
 *
 * Returns the number of events deleted.
 */
export async function deleteTaskDaySessions(
  taskId: string,
  dateStr: string // YYYY-MM-DD
): Promise<number> {
  if (!taskId || !dateStr) return 0;
  const db = getDB();
  const allEvents = await db.events.toArray();

  // Parse date boundaries
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0).getTime();
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0).getTime();

  // Find SESSION_STARTED events for this task that occurred on this date
  const sessionIds = new Set<string>();
  for (const e of allEvents) {
    if (e.type !== "SESSION_STARTED") continue;
    const payload = e.payload as Record<string, unknown>;
    if (
      typeof payload.taskId === "string" && payload.taskId === taskId &&
      typeof payload.sessionId === "string" &&
      e.timestamp >= dayStart && e.timestamp < dayEnd
    ) {
      sessionIds.add(payload.sessionId);
    }
  }

  if (sessionIds.size === 0) return 0;

  // Delete all events belonging to those sessions
  const toDelete = allEvents
    .filter((e) => {
      const sid = (e.payload as Record<string, unknown>)?.sessionId;
      return typeof sid === "string" && sessionIds.has(sid);
    })
    .map((e) => e.id);

  if (toDelete.length === 0) return 0;
  await db.events.bulkDelete(toDelete);
  await db.snapshots.clear();
  return toDelete.length;
}

/**
 * Find and delete all session events for a given task within a time range.
 * Sessions that STARTED within [rangeStartMs, rangeEndMs) will be fully
 * removed (including their ENDED / RESTART_NOTE events).
 *
 * Returns the number of events deleted.
 */
export async function deleteTaskRangeSessions(
  taskId: string,
  rangeStartMs: number,
  rangeEndMs: number
): Promise<number> {
  if (!taskId || rangeStartMs >= rangeEndMs) return 0;
  const db = getDB();
  const allEvents = await db.events.toArray();

  // Find all sessionIds for SESSION_STARTED events in range
  const sessionIds = new Set<string>();
  for (const e of allEvents) {
    if (e.type !== "SESSION_STARTED") continue;
    const payload = e.payload as Record<string, unknown>;
    if (
      typeof payload.taskId === "string" && payload.taskId === taskId &&
      typeof payload.sessionId === "string" &&
      e.timestamp >= rangeStartMs && e.timestamp < rangeEndMs
    ) {
      sessionIds.add(payload.sessionId);
    }
  }

  if (sessionIds.size === 0) return 0;

  const toDelete = allEvents
    .filter((e) => {
      const sid = (e.payload as Record<string, unknown>)?.sessionId;
      return typeof sid === "string" && sessionIds.has(sid);
    })
    .map((e) => e.id);

  if (toDelete.length === 0) return 0;
  await db.events.bulkDelete(toDelete);
  await db.snapshots.clear();
  return toDelete.length;
}

/**
 * Clear all data (useful for development / reset).
 */
export async function clearAllData(): Promise<void> {
  const db = getDB();
  await db.events.clear();
  await db.snapshots.clear();
}

// ─── Data Migration ─────────────────────────────────────────
// For cross-domain moves (IndexedDB is domain-scoped).

/**
 * Export the entire database as a JSON file download.
 * Manual implementation — no dependency on dexie-export-import.
 */
export async function exportData(): Promise<void> {
  const db = getDB();
  const events = await db.events.toArray();
  const snapshots = await db.snapshots.toArray();

  const data = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      events,
      snapshots,
    },
    null,
    2
  );

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `continuity-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import data from a JSON file, replacing all existing data.
 * Manual implementation — no dependency on dexie-export-import.
 */
export async function importData(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text);

  // Support both old (dexie-export-import) and new format
  const events = data.events ?? data;
  const snapshots = data.snapshots ?? [];

  const db = getDB();
  await db.transaction("rw", db.events, db.snapshots, async () => {
    await db.events.clear();
    await db.snapshots.clear();

    if (Array.isArray(events) && events.length > 0) {
      await db.events.bulkAdd(events);
    }
    if (Array.isArray(snapshots) && snapshots.length > 0) {
      await db.snapshots.bulkAdd(snapshots);
    }
  });
}
