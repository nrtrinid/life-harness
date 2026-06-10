import type { LifeHarnessData } from "./actions";
import { createId, nowIso } from "./ids";
import type { HarnessChatSummary, HarnessChatSummaryMode } from "./types";

const MAX_SAVED_CHAT_SUMMARIES = 20;
const ASSISTANT_SUMMARY_MAX = 240;
const MAX_DECISIONS = 2;
const MAX_SUGGESTED_ACTIONS = 3;
const MAX_REMEMBER_ITEMS = 3;

const PATTERN_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "over-optimization", pattern: /over-optim/i },
  { label: "career avoidance", pattern: /career.*(cold|avoid|neglect)|avoid.*career/i },
  { label: "body neglect", pattern: /body.*(neglect|cold|cool)|neglect.*body/i },
  { label: "build-heavy momentum", pattern: /build-heavy|build.*hot|hot.*build/i },
  { label: "active limit", pattern: /active limit|over the active limit|4\/3/i },
  { label: "local AI/tooling", pattern: /local llm|local ai|openvino|tooling rabbit/i },
  { label: "job search", pattern: /job search|candidate queue|application|resume bank/i }
];

const DECISION_LINE =
  /^(?:decided|next step:|commit to|recommendation:|the move is\b|you should prioritize\b)/i;
const DECISION_PHRASE = /\b(?:you should prioritize|the move is|commit to|decided to)\b/i;

export interface BuildChatSummaryInput {
  userMessage: string;
  assistantAnswer: string;
  mode: HarnessChatSummaryMode;
  confidenceNotes: string[];
  safetyNotes: string[];
  createdAt?: string;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function excerptAssistantSummary(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length <= ASSISTANT_SUMMARY_MAX) {
    return trimmed;
  }

  const sentences = splitSentences(trimmed);
  let summary = "";

  for (const sentence of sentences) {
    const candidate = summary ? `${summary} ${sentence}` : sentence;
    if (candidate.length > ASSISTANT_SUMMARY_MAX) {
      break;
    }
    summary = candidate;
  }

  if (summary) {
    return summary;
  }

  return `${trimmed.slice(0, ASSISTANT_SUMMARY_MAX - 1)}…`;
}

function detectPatterns(answer: string, confidenceNotes: string[]): string[] {
  const haystack = [answer, ...confidenceNotes].join("\n").toLowerCase();
  const patterns: string[] = [];

  for (const rule of PATTERN_RULES) {
    if (rule.pattern.test(haystack)) {
      patterns.push(rule.label);
    }
  }

  return patterns;
}

function extractDecisions(answer: string): string[] {
  const decisions: string[] = [];

  for (const candidate of [...answer.split(/\n+/), ...splitSentences(answer)]) {
    const trimmed = candidate.replace(/^[-*•]\s*/, "").trim();
    if (!trimmed || trimmed.length > 180) {
      continue;
    }

    if (DECISION_LINE.test(trimmed) || DECISION_PHRASE.test(trimmed)) {
      if (!/\bshould\b/i.test(trimmed) || DECISION_PHRASE.test(trimmed) || DECISION_LINE.test(trimmed)) {
        if (!decisions.includes(trimmed)) {
          decisions.push(trimmed);
        }
      }
    }

    if (decisions.length >= MAX_DECISIONS) {
      break;
    }
  }

  return decisions.slice(0, MAX_DECISIONS);
}

function extractSuggestedActions(answer: string): string[] {
  const actions: string[] = [];

  for (const line of answer.split(/\n+/)) {
    const trimmed = line.replace(/^[-*•]\s*/, "").trim();
    if (!trimmed || trimmed.length > 120) {
      continue;
    }

    if (/^(?:try|send|review|pick|do|start|open|write|apply|follow up|park)\b/i.test(trimmed)) {
      actions.push(trimmed);
    }

    if (actions.length >= MAX_SUGGESTED_ACTIONS) {
      break;
    }
  }

  return actions.slice(0, MAX_SUGGESTED_ACTIONS);
}

function buildRememberForNextTime(
  userMessage: string,
  patterns: string[],
  suggestedNextActions: string[]
): string[] {
  const items: string[] = [];
  const question = userMessage.trim();

  if (question) {
    items.push(`User asked: ${question.length > 100 ? `${question.slice(0, 99)}…` : question}`);
  }

  if (patterns[0]) {
    items.push(`Pattern signal: ${patterns[0]}.`);
  }

  if (suggestedNextActions[0]) {
    items.push(`Suggested tiny move: ${suggestedNextActions[0]}`);
  } else {
    items.push("Harness gave a grounded read from current board context.");
  }

  return items.slice(0, MAX_REMEMBER_ITEMS);
}

export function buildChatSummary(input: BuildChatSummaryInput): HarnessChatSummary {
  const userMessage = input.userMessage.trim();
  const assistantSummary = excerptAssistantSummary(input.assistantAnswer);
  const patterns = detectPatterns(input.assistantAnswer, input.confidenceNotes);
  const decisions = extractDecisions(input.assistantAnswer);
  const suggestedNextActions = extractSuggestedActions(input.assistantAnswer);

  return {
    id: createId("chat-memory"),
    createdAt: input.createdAt ?? nowIso(),
    mode: input.mode,
    userMessage,
    assistantSummary,
    patterns,
    decisions,
    suggestedNextActions,
    rememberForNextTime: buildRememberForNextTime(userMessage, patterns, suggestedNextActions)
  };
}

export function applySaveChatSummary(
  state: LifeHarnessData,
  summary: HarnessChatSummary
): LifeHarnessData {
  return {
    ...state,
    chatSummaries: [summary, ...state.chatSummaries].slice(0, MAX_SAVED_CHAT_SUMMARIES)
  };
}

export function applyDeleteChatSummary(state: LifeHarnessData, summaryId: string): LifeHarnessData {
  return {
    ...state,
    chatSummaries: state.chatSummaries.filter((summary) => summary.id !== summaryId)
  };
}

export function applyClearChatSummaries(state: LifeHarnessData): LifeHarnessData {
  return {
    ...state,
    chatSummaries: []
  };
}

export const CHAT_MEMORY_ANALYSIS_PREFIX = "Recent chat memory:";

export function sortChatSummariesNewestFirst(summaries: HarnessChatSummary[]): HarnessChatSummary[] {
  return [...summaries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function buildChatMemoryAnalyses(
  summaries: HarnessChatSummary[],
  limit: number
): Array<{ summary: string; patterns_detected: string[] }> {
  return sortChatSummariesNewestFirst(summaries)
    .slice(0, limit)
    .map((item) => ({
      summary: `${CHAT_MEMORY_ANALYSIS_PREFIX} User asked "${truncateInline(item.userMessage, 80)}". ${item.assistantSummary}`,
      patterns_detected: item.patterns.slice(0, 5)
    }));
}

export function buildChatMemoryDecisions(
  summaries: HarnessChatSummary[],
  limit: number
): Array<{ summary: string; reason: string }> {
  const decisions: Array<{ summary: string; reason: string }> = [];

  for (const item of sortChatSummariesNewestFirst(summaries)) {
    for (const decision of item.decisions.slice(0, MAX_DECISIONS)) {
      if (decisions.some((entry) => entry.summary === decision)) {
        continue;
      }

      decisions.push({
        summary: decision,
        reason: "Saved chat memory."
      });

      if (decisions.length >= limit) {
        return decisions;
      }
    }
  }

  return decisions;
}

function truncateInline(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}
