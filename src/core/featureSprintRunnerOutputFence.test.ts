import { describe, expect, it } from "vitest";

import {
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
});
