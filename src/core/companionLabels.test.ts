import { describe, expect, it } from "vitest";

import {
  companionPhaseLabel,
  escalateReasoningDepthForThinkHarder,
  reasoningDepthHint,
  reasoningDepthLabel,
  reasoningDepthShortLabel,
  reasoningPanelTitle,
  shouldShowReasoningPanel,
  thinkingStatusForDepth
} from "./companionLabels";

describe("reasoningDepthLabel", () => {
  it("maps wire values to human labels", () => {
    expect(reasoningDepthLabel("fast")).toBe("Fast");
    expect(reasoningDepthLabel("deliberate")).toBe("Deliberate");
    expect(reasoningDepthLabel("deep")).toBe("Deep");
  });
});

describe("reasoningDepthShortLabel", () => {
  it("returns compact composer labels", () => {
    expect(reasoningDepthShortLabel("fast")).toBe("Fast");
    expect(reasoningDepthShortLabel("deliberate")).toBe("Think");
    expect(reasoningDepthShortLabel("deep")).toBe("Deep");
  });
});

describe("reasoningDepthHint", () => {
  it("returns short composer hints", () => {
    expect(reasoningDepthHint("fast")).toBe("Quick read on your board");
    expect(reasoningDepthHint("deliberate")).toBe("Thinks through tradeoffs");
    expect(reasoningDepthHint("deep")).toBe("Double-checks before answering");
  });
});

describe("shouldShowReasoningPanel", () => {
  it("hides the panel for fast and shows it for slower depths", () => {
    expect(shouldShowReasoningPanel("fast")).toBe(false);
    expect(shouldShowReasoningPanel("deliberate")).toBe(true);
    expect(shouldShowReasoningPanel("deep")).toBe(true);
  });
});

describe("reasoningPanelTitle", () => {
  it("uses thinking copy only for deep", () => {
    expect(reasoningPanelTitle("fast")).toBe("");
    expect(reasoningPanelTitle("deliberate")).toBe("Reasoning");
    expect(reasoningPanelTitle("deep")).toBe("Thinking");
  });
});

describe("thinkingStatusForDepth", () => {
  it("returns empty status for fast", () => {
    expect(thinkingStatusForDepth("fast", 0)).toBe("");
    expect(thinkingStatusForDepth("fast", 10000)).toBe("");
  });

  it("stages deliberate copy without thinking language", () => {
    expect(thinkingStatusForDepth("deliberate", 0)).toBe("Reading your message…");
    expect(thinkingStatusForDepth("deliberate", 5000)).toBe("Working through tradeoffs…");
  });

  it("stages deep copy by elapsed time", () => {
    expect(thinkingStatusForDepth("deep", 0)).toBe("Thinking deeply…");
    expect(thinkingStatusForDepth("deep", 2999)).toBe("Thinking deeply…");
    expect(thinkingStatusForDepth("deep", 3000)).toBe("Checking my work…");
    expect(thinkingStatusForDepth("deep", 14999)).toBe("Checking my work…");
    expect(thinkingStatusForDepth("deep", 15000)).toBe("Still here — deep passes take longer.");
    expect(thinkingStatusForDepth("deep", 60000)).toBe("Still here — deep passes take longer.");
  });
});

describe("escalateReasoningDepthForThinkHarder", () => {
  it("escalates fast to deliberate and deliberate/deep to deep", () => {
    expect(escalateReasoningDepthForThinkHarder("fast")).toBe("deliberate");
    expect(escalateReasoningDepthForThinkHarder("deliberate")).toBe("deep");
    expect(escalateReasoningDepthForThinkHarder("deep")).toBe("deep");
  });
});

describe("companionPhaseLabel", () => {
  it("maps known gateway phases to user strings", () => {
    expect(companionPhaseLabel("drafting")).toBe("Thinking…");
    expect(companionPhaseLabel("critiquing")).toBe("Checking my work…");
    expect(companionPhaseLabel("companion_warmup")).toBe("Waking up companion…");
  });

  it("falls back for unknown phases", () => {
    expect(companionPhaseLabel("unknown_phase")).toBe("Thinking…");
  });
});
