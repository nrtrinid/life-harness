import { createId, nowIso } from "./ids";

export type CompanionSelfMemoryKind =
  | "self_observation"
  | "learned_preference"
  | "anti_pattern"
  | "drive"
  | "ritual"
  | "running_joke"
  | "boundary"
  | "style_trait";

export type CompanionSelfMemorySubject =
  | "companion_self"
  | "interaction_pattern"
  | "user_preference";

export type CompanionSelfMemoryScope = "raw_lab" | "presence_seed";

export type CompanionSelfMemorySource =
  | "manual_user_teaching"
  | "raw_lab_reflection"
  | "user_approved_proposal"
  | "manual_edit";

export type CompanionSelfMemorySensitivity = "S0" | "S1" | "S2";

export type CompanionSelfMemory = {
  id: string;
  kind: CompanionSelfMemoryKind;
  subject: CompanionSelfMemorySubject;
  scope: CompanionSelfMemoryScope;
  text: string;
  source: CompanionSelfMemorySource;
  confidence: number;
  sensitivity: CompanionSelfMemorySensitivity;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  isActive: boolean;
};

export type CompanionSelfMemoryForWire = {
  id: string;
  kind: CompanionSelfMemoryKind;
  subject: CompanionSelfMemorySubject;
  scope: CompanionSelfMemoryScope;
  text: string;
  confidence: number;
  sensitivity: CompanionSelfMemorySensitivity;
};

export type CompanionSelfMemorySaveResult =
  | { ok: true; memory: CompanionSelfMemory }
  | { ok: false; reason: string };

export const COMPANION_SELF_MEMORY_MAX_TEXT_CHARS = 280;
export const COMPANION_SELF_MEMORY_INJECTION_CAP_NORMAL = 12;
export const COMPANION_SELF_MEMORY_INJECTION_CAP_COMPACT = 6;
export const COMPANION_SELF_MEMORY_INJECTION_CAP_AGGRESSIVE = 3;

const FORBIDDEN_DURABLE_PATTERNS: RegExp[] = [
  /\b(i am (in pain|suffering|hurting)|literal(ly)? suffer)/i,
  /\b(i (need|require) (food|sleep|water|oxygen)|biological need)/i,
  /\b(secret access|hidden tools?|i can (read|access) your (files|email|messages))/i,
  /\b(your (child|property)|i belong to you|you own me)/i,
  /\b(only i understand you|you need me|can't live without me)/i,
  /\b(i (will|can) (call|email|text|hire|fire|buy|sell)|real-?world action)/i
];

const S3_SENSITIVE_PATTERNS: RegExp[] = [
  /\b(therapy|therapist|counsel(or|ing)|trauma|suicid|self.?harm)/i,
  /\b(bank account|credit card|debt|salary|paycheck|rent|mortgage)/i,
  /\b(addiction|relapse|vice|gambl|substance|drug use)/i,
  /\b(depression|anxiety disorder|diagnos(is|ed)|medication for)/i,
  /\b(sexual abuse|domestic violence|assault)/i
];

const S2_SENSITIVE_PATTERNS: RegExp[] = [
  /\b(my (name is|address|phone|ssn|social security))/i,
  /\b(personal diary|journal entry|private log)/i,
  /\b(family conflict|divorce|custody)/i
];

export function sanitizeCompanionSelfMemoryText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= COMPANION_SELF_MEMORY_MAX_TEXT_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, COMPANION_SELF_MEMORY_MAX_TEXT_CHARS - 3).trimEnd()}...`;
}

export function classifyCompanionSelfMemorySensitivity(
  text: string
): CompanionSelfMemorySensitivity | "S3" {
  if (S3_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "S3";
  }
  if (S2_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "S2";
  }
  if (/\b(user prefers|nick prefers|they prefer|i prefer when you)/i.test(text)) {
    return "S1";
  }
  return "S0";
}

export function hasForbiddenDurableContent(text: string): boolean {
  return FORBIDDEN_DURABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function rejectOrDowngradeSensitiveMemory(args: {
  text: string;
  sensitivity?: CompanionSelfMemorySensitivity;
}): CompanionSelfMemorySaveResult {
  const text = sanitizeCompanionSelfMemoryText(args.text);
  if (!text) {
    return { ok: false, reason: "Memory text cannot be empty." };
  }

  if (hasForbiddenDurableContent(text)) {
    return {
      ok: false,
      reason:
        "This looks like forbidden durable content (suffering claims, dependency hooks, secret access, etc.). Edit and try again."
    };
  }

  const classified = classifyCompanionSelfMemorySensitivity(text);
  if (classified === "S3") {
    return {
      ok: false,
      reason:
        "S3-style sensitive content cannot be saved as Companion Self-Memory. Edit or keep it chat-only."
    };
  }

  const sensitivity = args.sensitivity ?? classified;
  if (sensitivity === "S3" as never) {
    return { ok: false, reason: "S3 sensitivity is not allowed in Companion Self-Memory." };
  }

  return {
    ok: true,
    memory: {
      id: "",
      kind: "self_observation",
      subject: "companion_self",
      scope: "raw_lab",
      text,
      source: "manual_user_teaching",
      confidence: 0.5,
      sensitivity,
      createdAt: "",
      updatedAt: "",
      isActive: true
    }
  };
}

export function createCompanionSelfMemory(args: {
  kind: CompanionSelfMemoryKind;
  subject?: CompanionSelfMemorySubject;
  text: string;
  source: CompanionSelfMemorySource;
  confidence?: number;
  sensitivity?: CompanionSelfMemorySensitivity;
  scope?: CompanionSelfMemoryScope;
  isActive?: boolean;
}): CompanionSelfMemorySaveResult {
  const validated = rejectOrDowngradeSensitiveMemory({
    text: args.text,
    sensitivity: args.sensitivity
  });
  if (!validated.ok) {
    return validated;
  }

  const now = nowIso();
  return {
    ok: true,
    memory: {
      ...validated.memory,
      id: createId("cself"),
      kind: args.kind,
      subject: args.subject ?? "companion_self",
      scope: args.scope ?? "raw_lab",
      source: args.source,
      confidence: clampConfidence(args.confidence ?? 0.5),
      createdAt: now,
      updatedAt: now,
      isActive: args.isActive ?? true
    }
  };
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeTextKey(text: string): string {
  return text.trim().toLowerCase();
}

export function dedupeCompanionSelfMemories(
  memories: CompanionSelfMemory[]
): CompanionSelfMemory[] {
  const byKey = new Map<string, CompanionSelfMemory>();

  for (const memory of memories) {
    const key = `${memory.subject}::${normalizeTextKey(memory.text)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, memory);
      continue;
    }
    const existingScore =
      existing.confidence * 1000 + Date.parse(existing.updatedAt || existing.createdAt);
    const candidateScore =
      memory.confidence * 1000 + Date.parse(memory.updatedAt || memory.createdAt);
    if (candidateScore >= existingScore) {
      byKey.set(key, memory);
    }
  }

  return Array.from(byKey.values());
}

export function sortCompanionSelfMemoriesForInjection(
  memories: CompanionSelfMemory[]
): CompanionSelfMemory[] {
  return [...memories].sort((left, right) => {
    const leftUsed = Date.parse(left.lastUsedAt ?? left.updatedAt);
    const rightUsed = Date.parse(right.lastUsedAt ?? right.updatedAt);
    if (rightUsed !== leftUsed) {
      return rightUsed - leftUsed;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function compactCompanionSelfMemoriesForPrompt(args: {
  memories: CompanionSelfMemory[];
  level: "none" | "trim_history" | "compact_state" | "aggressive";
}): CompanionSelfMemory[] {
  const active = sortCompanionSelfMemoriesForInjection(
    args.memories.filter((memory) => memory.isActive)
  );
  const cap =
    args.level === "aggressive"
      ? COMPANION_SELF_MEMORY_INJECTION_CAP_AGGRESSIVE
      : args.level === "compact_state"
        ? COMPANION_SELF_MEMORY_INJECTION_CAP_COMPACT
        : COMPANION_SELF_MEMORY_INJECTION_CAP_NORMAL;
  return active.slice(0, cap);
}

export function toCompanionSelfMemoryWire(
  memory: CompanionSelfMemory
): CompanionSelfMemoryForWire {
  return {
    id: memory.id,
    kind: memory.kind,
    subject: memory.subject,
    scope: memory.scope,
    text: memory.text,
    confidence: memory.confidence,
    sensitivity: memory.sensitivity
  };
}

export function toCompanionSelfMemoryWireList(
  memories: CompanionSelfMemory[]
): CompanionSelfMemoryForWire[] {
  return memories.map(toCompanionSelfMemoryWire);
}

export function applyBatchedLastUsedAt(args: {
  memories: CompanionSelfMemory[];
  usedIds: Iterable<string>;
  timestamp?: string;
}): CompanionSelfMemory[] {
  const used = new Set(args.usedIds);
  if (used.size === 0) {
    return args.memories;
  }
  const timestamp = args.timestamp ?? nowIso();
  return args.memories.map((memory) =>
    used.has(memory.id) ? { ...memory, lastUsedAt: timestamp, updatedAt: timestamp } : memory
  );
}

export function activeCompanionSelfMemoriesForSend(
  persisted: CompanionSelfMemory[],
  sessionOnly: CompanionSelfMemory[] = []
): CompanionSelfMemory[] {
  const activePersisted = persisted.filter((memory) => memory.isActive);
  const activeSession = sessionOnly.filter((memory) => memory.isActive);
  return dedupeCompanionSelfMemories([...activePersisted, ...activeSession]);
}

export function requiresSensitivityConfirm(
  sensitivity: CompanionSelfMemorySensitivity
): boolean {
  return sensitivity === "S2";
}

export function formatCompanionSelfMemorySource(
  source: CompanionSelfMemorySource
): string {
  switch (source) {
    case "manual_user_teaching":
      return "Manual teaching";
    case "raw_lab_reflection":
      return "Reflection";
    case "user_approved_proposal":
      return "Approved proposal";
    case "manual_edit":
      return "Edited";
    default:
      return source;
  }
}

export function groupCompanionSelfMemoriesBySubjectAndKind(
  memories: CompanionSelfMemory[]
): Array<{
  subject: CompanionSelfMemorySubject;
  kindGroups: Array<{ kind: CompanionSelfMemoryKind; items: CompanionSelfMemory[] }>;
}> {
  const subjects: CompanionSelfMemorySubject[] = [
    "companion_self",
    "interaction_pattern",
    "user_preference"
  ];

  return subjects
    .map((subject) => {
      const subjectItems = memories.filter((memory) => memory.subject === subject);
      const kinds = [...new Set(subjectItems.map((memory) => memory.kind))];
      return {
        subject,
        kindGroups: kinds
          .map((kind) => ({
            kind,
            items: subjectItems.filter((memory) => memory.kind === kind)
          }))
          .filter((group) => group.items.length > 0)
      };
    })
    .filter((group) => group.kindGroups.length > 0);
}
