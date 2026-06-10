import type { ReasoningDepth } from "./chatHarnessClient";

const REASONING_DEPTH_LABELS: Record<ReasoningDepth, string> = {
  fast: "Fast",
  deliberate: "Deliberate",
  deep: "Deep"
};

const REASONING_DEPTH_HINTS: Record<ReasoningDepth, string> = {
  fast: "Quick read on your board",
  deliberate: "Thinks through tradeoffs",
  deep: "Double-checks before answering"
};

const COMPANION_PHASE_LABELS: Record<string, string> = {
  companion_warmup: "Waking up companion…",
  drafting: "Thinking…",
  critiquing: "Checking my work…",
  finalizing: "Putting it together…",
  queued: "In line for a deeper pass…",
  running: "Still working…"
};

const DEEP_THINKING_DEEPLY_MS = 3000;
const DEEP_THINKING_STILL_HERE_MS = 15000;

export function reasoningDepthLabel(depth: ReasoningDepth): string {
  return REASONING_DEPTH_LABELS[depth];
}

export function reasoningDepthHint(depth: ReasoningDepth): string {
  return REASONING_DEPTH_HINTS[depth];
}

export function thinkingStatusForDepth(depth: ReasoningDepth, elapsedMs: number): string {
  if (depth === "deep") {
    if (elapsedMs >= DEEP_THINKING_STILL_HERE_MS) {
      return "Still here — deep passes take longer.";
    }
    if (elapsedMs >= DEEP_THINKING_DEEPLY_MS) {
      return "Checking my work…";
    }
    return "Thinking deeply…";
  }

  return "Thinking…";
}

export function escalateReasoningDepthForThinkHarder(current: ReasoningDepth): ReasoningDepth {
  if (current === "fast") {
    return "deliberate";
  }
  return "deep";
}

export function companionPhaseLabel(phase: string): string {
  return COMPANION_PHASE_LABELS[phase] ?? "Thinking…";
}
