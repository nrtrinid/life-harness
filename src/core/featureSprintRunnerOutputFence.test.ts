import { describe, expect, it } from "vitest";

import {
  promptAuditFenceReadinessNotice,
  reviewFenceReadinessNotice,
  scopingFenceReadinessNotice
} from "./featureSprintRunnerOutputFence";

describe("featureSprintRunnerOutputFence", () => {
  it("returns undefined when scoping fence is present", () => {
    const output = `\`\`\`feature-sprint-plan
{
  "title": "Test",
  "goal": "Goal",
  "acceptanceCriteria": ["One"],
  "nonGoals": [],
  "constraints": [],
  "steps": [
    {
      "title": "Step one",
      "goal": "Do the thing",
      "acceptanceCriteria": ["Done"]
    }
  ]
}
\`\`\``;
    expect(scopingFenceReadinessNotice(output)).toBeUndefined();
  });

  it("warns when scoping fence is missing", () => {
    expect(scopingFenceReadinessNotice("plain prose only")).toContain("feature-sprint-plan");
  });

  it("warns when review fence is missing", () => {
    expect(reviewFenceReadinessNotice("looks good")).toContain("feature-review-verdict");
  });

  it("treats missing review fence as cleanup-needed without throwing", () => {
    expect(() => reviewFenceReadinessNotice("plain prose only")).not.toThrow();
    expect(reviewFenceReadinessNotice("plain prose only")).toMatch(/Inspect before Import review verdict/);
  });

  it("warns when prompt audit fence is missing", () => {
    expect(promptAuditFenceReadinessNotice("Codex ran but forgot the fence.")).toBe(
      "Output needs manual cleanup before import."
    );
  });

  it("returns undefined when prompt audit fence is present", () => {
    const output = `\`\`\`feature-prompt-critique
{
  "verdict": "ready",
  "risks": [],
  "requiredPromptChanges": [],
  "finalImplementationPrompt": "Bounded prompt.",
  "mustCheckFiles": [],
  "verificationCommands": []
}
\`\`\``;
    expect(promptAuditFenceReadinessNotice(output)).toBeUndefined();
  });
});
