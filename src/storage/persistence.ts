import type { LifeHarnessData } from "../core/lifeHarnessData";
import { preparePersistedState } from "../core/stateHydration";
import { nowIso } from "../core/ids";
import { envelopeData, migrateEnvelope, parseEnvelopeJson } from "./migrations";
import { localStorageAdapter } from "./localStorageAdapter";
import {
  CURRENT_SCHEMA_VERSION,
  type ParseImportResult,
  type PersistedEnvelope,
  type StorageAdapter
} from "./types";

export function createEnvelope(data: LifeHarnessData): PersistedEnvelope {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: nowIso(),
    data
  };
}

export function serializeEnvelope(data: LifeHarnessData): string {
  return JSON.stringify(createEnvelope(data), null, 2);
}

export function parseImportJson(json: string, now = new Date()): ParseImportResult {
  const parsed = parseEnvelopeJson(json);
  if (!parsed.ok) {
    return parsed;
  }

  const migrated = migrateEnvelope(parsed.envelope);
  if (!migrated.ok) {
    return migrated;
  }

  try {
    const data = preparePersistedState(envelopeData(migrated.envelope), now);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to prepare imported state."
    };
  }
}

export function loadPersistedState(
  adapter: StorageAdapter = localStorageAdapter,
  now = new Date()
): LifeHarnessData | null {
  if (!adapter.isAvailable()) {
    return null;
  }

  const raw = adapter.loadRaw();
  if (!raw) {
    return null;
  }

  const result = parseImportJson(raw, now);
  if (!result.ok || !result.data) {
    console.warn("[life-harness] Failed to load persisted snapshot:", result.error);
    return null;
  }

  return result.data;
}

/**
 * Persist snapshot immediately. Returns false when storage is unavailable or the write fails.
 * Callers that claim-before-launch must treat false as a hard stop (do not call the runner).
 */
export function savePersistedState(
  data: LifeHarnessData,
  adapter: StorageAdapter = localStorageAdapter
): boolean {
  if (!adapter.isAvailable()) {
    return false;
  }

  try {
    adapter.saveRaw(serializeEnvelope(data));
    return true;
  } catch (error) {
    console.warn("[life-harness] Failed to save snapshot:", error);
    return false;
  }
}

export function clearPersistedState(adapter: StorageAdapter = localStorageAdapter): void {
  adapter.clear();
}

export { localStorageAdapter };
