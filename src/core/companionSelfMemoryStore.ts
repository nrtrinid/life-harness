import {
  applyBatchedLastUsedAt,
  dedupeCompanionSelfMemories,
  type CompanionSelfMemory
} from "./companionSelfMemory";

export const COMPANION_SELF_MEMORY_STORAGE_KEY = "life-harness:companion-self-memory:v1";

let inMemoryFallback: CompanionSelfMemory[] = [];

function isLocalStorageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function parseStoredMemories(raw: string | null): CompanionSelfMemory[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return dedupeCompanionSelfMemories(
      parsed.filter((item): item is CompanionSelfMemory => isValidMemory(item))
    );
  } catch {
    return [];
  }
}

function isValidMemory(value: unknown): value is CompanionSelfMemory {
  if (!value || typeof value !== "object") {
    return false;
  }
  const memory = value as CompanionSelfMemory;
  return (
    typeof memory.id === "string" &&
    typeof memory.kind === "string" &&
    typeof memory.subject === "string" &&
    typeof memory.scope === "string" &&
    typeof memory.text === "string" &&
    typeof memory.source === "string" &&
    typeof memory.confidence === "number" &&
    (memory.sensitivity === "S0" ||
      memory.sensitivity === "S1" ||
      memory.sensitivity === "S2") &&
    typeof memory.createdAt === "string" &&
    typeof memory.updatedAt === "string" &&
    typeof memory.isActive === "boolean"
  );
}

export function loadCompanionSelfMemories(): CompanionSelfMemory[] {
  if (isLocalStorageAvailable()) {
    try {
      const raw = localStorage.getItem(COMPANION_SELF_MEMORY_STORAGE_KEY);
      const loaded = parseStoredMemories(raw);
      inMemoryFallback = loaded;
      return loaded;
    } catch {
      return [...inMemoryFallback];
    }
  }
  return [...inMemoryFallback];
}

export function saveCompanionSelfMemories(memories: CompanionSelfMemory[]): void {
  const deduped = dedupeCompanionSelfMemories(memories);
  inMemoryFallback = deduped;
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    localStorage.setItem(COMPANION_SELF_MEMORY_STORAGE_KEY, JSON.stringify(deduped));
  } catch (error) {
    console.warn("[life-harness] Failed to save companion self-memory:", error);
  }
}

export function addCompanionSelfMemory(memory: CompanionSelfMemory): CompanionSelfMemory[] {
  const next = dedupeCompanionSelfMemories([...loadCompanionSelfMemories(), memory]);
  saveCompanionSelfMemories(next);
  return next;
}

export function updateCompanionSelfMemory(
  id: string,
  patch: Partial<CompanionSelfMemory>
): CompanionSelfMemory[] {
  const next = loadCompanionSelfMemories().map((memory) =>
    memory.id === id ? { ...memory, ...patch, id: memory.id, updatedAt: new Date().toISOString() } : memory
  );
  saveCompanionSelfMemories(next);
  return next;
}

export function deleteCompanionSelfMemory(id: string): CompanionSelfMemory[] {
  const next = loadCompanionSelfMemories().filter((memory) => memory.id !== id);
  saveCompanionSelfMemories(next);
  return next;
}

export function clearCompanionSelfMemories(): void {
  inMemoryFallback = [];
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    localStorage.removeItem(COMPANION_SELF_MEMORY_STORAGE_KEY);
  } catch (error) {
    console.warn("[life-harness] Failed to clear companion self-memory:", error);
  }
}

export function flushPendingCompanionLastUsedAt(usedIds: Iterable<string>): void {
  const ids = [...usedIds];
  if (ids.length === 0) {
    return;
  }
  const flushed = applyBatchedLastUsedAt({
    memories: loadCompanionSelfMemories(),
    usedIds: ids
  });
  saveCompanionSelfMemories(flushed);
}

/** Test helper — reset storage state. */
export function resetCompanionSelfMemoryStoreForTests(): void {
  clearCompanionSelfMemories();
}
