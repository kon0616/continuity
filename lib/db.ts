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
 */
export async function exportData(): Promise<void> {
  // Lazy-load dexie-export-import (browser-only, adds methods to Dexie prototype)
  await import("dexie-export-import");
  const db = getDB();
  const blob = await (db as any).export({ prettyJson: true });
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
 * Clears current tables first, then imports.
 */
export async function importData(file: File): Promise<void> {
  // Lazy-load dexie-export-import (browser-only, adds methods to Dexie prototype)
  await import("dexie-export-import");
  const db = getDB();
  // Clear existing data before import
  await db.transaction("rw", db.events, db.snapshots, async () => {
    await db.events.clear();
    await db.snapshots.clear();
  });
  // Import — dexie-export-import adds this method
  await (db as any).import(file);
}
