import type { LifeHarnessData } from "./lifeHarnessData";
import { createId, nowIso } from "./ids";
import type { HarnessChatSummary, HarnessMemoryItem, HarnessMemoryKind } from "./types";

export const MEMORY_BANK_PREFIX = "Memory Bank ";

const ANALYSIS_KINDS: HarnessMemoryKind[] = [
  "pattern",
  "preference",
  "trap",
  "identity",
  "project_fact"
];
const DECISION_KINDS: HarnessMemoryKind[] = ["decision", "rule"];

const EPHEMERAL_DECISION =
  /^(?:next step:|try |send |review |open |do |pick |write |apply |follow up)/i;
const TIME_BOUND =
  /\b(?:today|tonight|this morning|this week|10 minutes?|one tiny|right now)\b/i;
const DURABLE_DECISION =
  /\b(?:direction|prioritize|focus on|practical|career-first|decided to|commit to|recommendation:|current product|before tooling|before polish)\b/i;

export type CreateMemoryItemInput = Omit<HarnessMemoryItem, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function memoryItemDedupeKey(
  item: Pick<HarnessMemoryItem, "kind" | "title" | "sourceChatSummaryId">
): string {
  return `${item.kind}:${item.title}:${item.sourceChatSummaryId ?? ""}`;
}

export function capMemorySummary(text: string, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return text.trim();
  }

  return sentences.slice(0, maxSentences).join(" ");
}

export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function isDurableMemoryDecision(decision: string): boolean {
  const trimmed = decision.trim();
  if (!trimmed || trimmed.length > 180) {
    return false;
  }

  if (EPHEMERAL_DECISION.test(trimmed)) {
    return false;
  }

  if (TIME_BOUND.test(trimmed)) {
    return false;
  }

  if (/\bshould\b/i.test(trimmed) && !DURABLE_DECISION.test(trimmed)) {
    return false;
  }

  return DURABLE_DECISION.test(trimmed) || /^(?:decided|commit to|recommendation:)/i.test(trimmed);
}

function decisionTitle(decision: string): string {
  return decision
    .replace(/^[-*•]\s*/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
}

function hasPatternLabel(summary: HarnessChatSummary, label: string): boolean {
  return summary.patterns.includes(label);
}

function buildCandidateInput(
  summary: HarnessChatSummary,
  kind: HarnessMemoryKind,
  title: string,
  summaryText: string,
  tags: string[] = []
): CreateMemoryItemInput {
  return {
    kind,
    title,
    summary: capMemorySummary(summaryText),
    tags,
    sourceChatSummaryId: summary.id,
    isActive: true
  };
}

export function createMemoryItem(input: CreateMemoryItemInput, now = nowIso()): HarnessMemoryItem {
  return {
    ...input,
    id: input.id ?? createId("memory-item"),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    isActive: input.isActive ?? true,
    summary: capMemorySummary(input.summary)
  };
}

export function buildMemoryCandidatesFromChatSummary(
  summary: HarnessChatSummary,
  existingItems: HarnessMemoryItem[] = []
): HarnessMemoryItem[] {
  const existingKeys = new Set(existingItems.map(memoryItemDedupeKey));
  const seenInCall = new Set<string>();
  const candidates: HarnessMemoryItem[] = [];
  const now = summary.createdAt;

  function addCandidate(input: CreateMemoryItemInput) {
    const key = memoryItemDedupeKey(input);
    if (seenInCall.has(key) || existingKeys.has(key)) {
      return;
    }

    seenInCall.add(key);
    candidates.push(createMemoryItem(input, now));
  }

  if (hasPatternLabel(summary, "career avoidance")) {
    addCandidate(
      buildCandidateInput(
        summary,
        "pattern",
        "Career avoidance pattern",
        "Career threads can stay cold while build work stays hot. Treat outside-world follow-up as deliberate, not optional.",
        ["career", "avoidance"]
      )
    );
  }

  if (
    hasPatternLabel(summary, "over-optimization") ||
    hasPatternLabel(summary, "local AI/tooling")
  ) {
    addCandidate(
      buildCandidateInput(
        summary,
        "trap",
        "Over-optimization trap",
        "Tooling and local AI rabbit holes can displace practical board moves. Use-before-improve applies.",
        ["over-optimization", "tooling"]
      )
    );
  }

  if (hasPatternLabel(summary, "body neglect")) {
    addCandidate(
      buildCandidateInput(
        summary,
        "pattern",
        "Body floor can go cold",
        "Body threads can drop to cold or dormant when build momentum dominates. The body floor still needs a tiny move.",
        ["body", "neglect"]
      )
    );
  }

  if (
    hasPatternLabel(summary, "build-heavy momentum") &&
    hasPatternLabel(summary, "career avoidance")
  ) {
    addCandidate(
      buildCandidateInput(
        summary,
        "rule",
        "Career-before-tooling",
        "When build momentum is hot and career is cold, career pounce comes before tooling or polish work.",
        ["career", "build", "rule"]
      )
    );
  }

  for (const decision of summary.decisions) {
    if (!isDurableMemoryDecision(decision)) {
      continue;
    }

    addCandidate(
      buildCandidateInput(
        summary,
        "decision",
        decisionTitle(decision),
        capMemorySummary(decision),
        ["decision"]
      )
    );
  }

  const rememberHaystack = summary.rememberForNextTime.join(" ").toLowerCase();
  if (/\b(?:proof|progress)\b/.test(rememberHaystack)) {
    addCandidate(
      buildCandidateInput(
        summary,
        "preference",
        "Proof before polish",
        "Prefer visible proof and progress signals over speculative optimization.",
        ["proof", "progress", "preference"]
      )
    );
  }

  return candidates;
}

export function applySaveMemoryItem(
  state: LifeHarnessData,
  item: HarnessMemoryItem
): LifeHarnessData {
  return {
    ...state,
    memoryItems: [item, ...state.memoryItems]
  };
}

export function applyDeleteMemoryItem(state: LifeHarnessData, itemId: string): LifeHarnessData {
  return {
    ...state,
    memoryItems: state.memoryItems.filter((item) => item.id !== itemId)
  };
}

export function applyUpdateMemoryItem(
  state: LifeHarnessData,
  item: HarnessMemoryItem
): LifeHarnessData {
  return {
    ...state,
    memoryItems: state.memoryItems.map((existing) =>
      existing.id === item.id
        ? { ...item, updatedAt: item.updatedAt ?? nowIso() }
        : existing
    )
  };
}

export function applyToggleMemoryItemActive(
  state: LifeHarnessData,
  itemId: string,
  now = nowIso()
): LifeHarnessData {
  return {
    ...state,
    memoryItems: state.memoryItems.map((item) =>
      item.id === itemId
        ? { ...item, isActive: !item.isActive, updatedAt: now }
        : item
    )
  };
}

export function getActiveMemoryItems(items: HarnessMemoryItem[]): HarnessMemoryItem[] {
  return items.filter((item) => item.isActive);
}

export function sortMemoryItemsNewestFirst(items: HarnessMemoryItem[]): HarnessMemoryItem[] {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function groupMemoryItemsByKind(
  items: HarnessMemoryItem[]
): Record<HarnessMemoryKind, HarnessMemoryItem[]> {
  const grouped: Record<HarnessMemoryKind, HarnessMemoryItem[]> = {
    pattern: [],
    preference: [],
    trap: [],
    identity: [],
    project_fact: [],
    decision: [],
    rule: []
  };

  for (const item of sortMemoryItemsNewestFirst(items)) {
    grouped[item.kind].push(item);
  }

  return grouped;
}

export function buildMemoryBankAnalyses(
  items: HarnessMemoryItem[],
  limit: number
): Array<{ summary: string; patterns_detected: string[] }> {
  return sortMemoryItemsNewestFirst(getActiveMemoryItems(items))
    .filter((item) => ANALYSIS_KINDS.includes(item.kind))
    .slice(0, limit)
    .map((item) => ({
      summary: `${MEMORY_BANK_PREFIX}${item.kind}: ${item.summary}`,
      patterns_detected: [`memory:${item.kind}`, ...item.tags.slice(0, 4)]
    }));
}

export function buildMemoryBankDecisions(
  items: HarnessMemoryItem[],
  limit: number
): Array<{ summary: string; reason: string }> {
  return sortMemoryItemsNewestFirst(getActiveMemoryItems(items))
    .filter((item) => DECISION_KINDS.includes(item.kind))
    .slice(0, limit)
    .map((item) => ({
      summary:
        item.summary.length <= 120
          ? `${MEMORY_BANK_PREFIX}${item.kind}: ${item.summary}`
          : `${MEMORY_BANK_PREFIX}${item.kind}: ${item.title}.`,
      reason: "Approved durable memory."
    }));
}

export { isDurableMemoryDecision };
