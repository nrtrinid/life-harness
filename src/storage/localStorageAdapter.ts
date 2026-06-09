import type { StorageAdapter } from "./types";

export const STORAGE_KEY = "life-harness.snapshot";

/**
 * Web-local persistence via localStorage.
 * v0.5 persistence is web-local only; native builds get no-op load/save.
 */
export const localStorageAdapter: StorageAdapter = {
  isAvailable(): boolean {
    return typeof localStorage !== "undefined";
  },

  loadRaw(): string | null {
    if (!this.isAvailable()) {
      return null;
    }
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },

  saveRaw(json: string): void {
    if (!this.isAvailable()) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (error) {
      console.warn("[life-harness] Failed to save snapshot:", error);
    }
  },

  clear(): void {
    if (!this.isAvailable()) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("[life-harness] Failed to clear snapshot:", error);
    }
  }
};
