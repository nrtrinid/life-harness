import { describe, expect, it } from "vitest";

import { buildRunnerProfile } from "./featureSprintRunner";
import {
  applyFeatureSprintProjectDefaultRunnerAgent,
  bindFeatureSprintRunnerAgentForCard,
  clearFeatureSprintProjectRunnerAgentDefault,
  type FeatureSprintRunnerAgentSessionBinding
} from "./featureSprintRunnerAgentSession";

describe("featureSprintRunnerAgentSession", () => {
  it("binds Cursor from project default when opening Card A", () => {
    const unbound: FeatureSprintRunnerAgentSessionBinding = {
      boundCardId: null,
      runnerAgent: "codex"
    };
    const bound = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding: unbound,
      projectDefaultRunnerAgent: "cursor"
    });
    expect(bound).toEqual({ boundCardId: "card-a", runnerAgent: "cursor" });
    expect(buildRunnerProfile(bound.runnerAgent, "implementation")).toBe("cursor_implementation");
    expect(buildRunnerProfile(bound.runnerAgent, "review")).toBe("cursor_review");
  });

  it("keeps Cursor after runner-history refresh, Sprint Map phase change, and Save agent output", () => {
    let binding = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding: { boundCardId: null, runnerAgent: "codex" },
      projectDefaultRunnerAgent: "codex"
    });
    // User selects Cursor in the toggle (session mutation, not a rebind).
    binding = { ...binding, runnerAgent: "cursor" };

    // History append / refresh re-enters bind with same card id.
    binding = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding,
      projectDefaultRunnerAgent: "codex"
    });
    // Sprint Map phase change likewise.
    binding = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding,
      projectDefaultRunnerAgent: "codex"
    });
    // Save agent output does not call applyFeatureSprintProjectDefaultRunnerAgent.
    expect(binding).toEqual({ boundCardId: "card-a", runnerAgent: "cursor" });
  });

  it("applies project default when Save project metadata is explicit", () => {
    expect(applyFeatureSprintProjectDefaultRunnerAgent("cursor")).toBe("cursor");
    expect(applyFeatureSprintProjectDefaultRunnerAgent("codex")).toBe("codex");
  });

  it("does not leak Card A session binding onto Card B", () => {
    const cardA = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding: { boundCardId: null, runnerAgent: "codex" },
      projectDefaultRunnerAgent: "codex"
    });
    const cardACursor: FeatureSprintRunnerAgentSessionBinding = {
      ...cardA,
      runnerAgent: "cursor"
    };

    const cardB = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-b",
      binding: cardACursor,
      projectDefaultRunnerAgent: "codex"
    });
    expect(cardB).toEqual({ boundCardId: "card-b", runnerAgent: "codex" });
    expect(cardB.runnerAgent).not.toBe(cardACursor.runnerAgent);
  });

  it("keeps Codex selectable and clear resets to Codex", () => {
    let binding = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding: { boundCardId: null, runnerAgent: "cursor" },
      projectDefaultRunnerAgent: "cursor"
    });
    binding = { ...binding, runnerAgent: "codex" };
    binding = bindFeatureSprintRunnerAgentForCard({
      cardId: "card-a",
      binding,
      projectDefaultRunnerAgent: "cursor"
    });
    expect(binding.runnerAgent).toBe("codex");
    expect(buildRunnerProfile(binding.runnerAgent, "implementation")).toBe("codex_implementation");
    expect(clearFeatureSprintProjectRunnerAgentDefault()).toBe("codex");
  });
});
