import type { LifeHarnessData } from "../core/actions";

export const CURRENT_SCHEMA_VERSION = 1;

export const RUN_INTERRUPTED_MESSAGE = "Run interrupted — reset on load.";

export const MAX_JOB_SOURCE_RUNS = 50;

/** Versioned JSON snapshot written by v0.5 web-local persistence. */
export interface PersistedEnvelope {
  schemaVersion: number;
  savedAt: string;
  data: LifeHarnessData;
}

/**
 * Platform storage backend. v0.5 ships localStorage (web only).
 * Native persistence requires a future adapter (e.g. AsyncStorage).
 */
export interface StorageAdapter {
  /** True when this adapter can read/write on the current platform. */
  isAvailable(): boolean;
  loadRaw(): string | null;
  saveRaw(json: string): void;
  clear(): void;
}

export interface ParseImportResult {
  ok: boolean;
  data?: LifeHarnessData;
  error?: string;
}
