import { applyAppSessionStart } from "../../core/briefing";
import { nowIso } from "../../core/ids";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import { createCleanBootstrapState, createSeedState } from "../../data/createSeedState";
import { STORAGE_KEY as LIFE_HARNESS_SNAPSHOT_KEY } from "../../storage/localStorageAdapter";
import {
  clearPersistedState,
  createEnvelope,
  loadPersistedState,
  localStorageAdapter,
  parseImportJson,
  savePersistedState,
  serializeEnvelope
} from "../../storage/persistence";
import type { ParseImportResult, StorageAdapter } from "../../storage/types";

export { CURRENT_SCHEMA_VERSION } from "../../storage/types";
export type { ParseImportResult, PersistedEnvelope, StorageAdapter } from "../../storage/types";
export { LIFE_HARNESS_SNAPSHOT_KEY };

export function hydrateLifeHarnessState(
  adapter: StorageAdapter = localStorageAdapter,
  now = new Date()
): LifeHarnessData {
  const loaded = loadPersistedState(adapter, now);
  if (loaded) {
    return applyAppSessionStart(loaded, now);
  }
  return applyAppSessionStart(createCleanBootstrapState(nowIso()), now);
}

export function persistLifeHarnessState(
  data: LifeHarnessData,
  adapter: StorageAdapter = localStorageAdapter
): void {
  savePersistedState(data, adapter);
}

export function isLifeHarnessPersistenceAvailable(
  adapter: StorageAdapter = localStorageAdapter
): boolean {
  return adapter.isAvailable();
}

export function clearLifeHarnessPersistence(
  adapter: StorageAdapter = localStorageAdapter
): void {
  clearPersistedState(adapter);
}

export function parseLifeHarnessImport(json: string, now = new Date()): ParseImportResult {
  return parseImportJson(json, now);
}

export function serializeLifeHarnessSnapshot(data: LifeHarnessData): string {
  return serializeEnvelope(data);
}

export function createLifeHarnessEnvelope(data: LifeHarnessData) {
  return createEnvelope(data);
}
