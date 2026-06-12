import { describe, expect, it } from "vitest";

import { placeholderReasoningStepIndex } from "./reasoningTracePlaceholder";

describe("placeholderReasoningStepIndex", () => {
  it("advances deliberate steps over time", () => {
    expect(placeholderReasoningStepIndex("deliberate", 0, false)).toBe(0);
    expect(placeholderReasoningStepIndex("deliberate", 800, false)).toBe(1);
  });

  it("jumps to the last step once streaming starts", () => {
    expect(placeholderReasoningStepIndex("fast", 0, true)).toBe(0);
    expect(placeholderReasoningStepIndex("deep", 0, true)).toBe(2);
  });
});
