import type { ReasoningDepth } from "./chatHarnessClient";

export const PLACEHOLDER_REASONING_STEPS: Record<ReasoningDepth, string[]> = {
  fast: ["Considering your message"],
  deliberate: ["Considering your message", "Working through angles"],
  deep: ["Considering your message", "Drafting a longer pass", "Checking coherence"]
};

export function placeholderReasoningStepIndex(
  depth: ReasoningDepth,
  elapsedMs: number,
  streamingStarted: boolean
): number {
  const lastIndex = PLACEHOLDER_REASONING_STEPS[depth].length - 1;
  if (streamingStarted) {
    return lastIndex;
  }
  if (depth === "deep") {
    if (elapsedMs >= 3000) {
      return 2;
    }
    if (elapsedMs >= 1000) {
      return 1;
    }
    return 0;
  }
  if (depth === "deliberate") {
    return elapsedMs >= 800 ? 1 : 0;
  }
  return 0;
}
