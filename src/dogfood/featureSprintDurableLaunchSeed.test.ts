import { describe, expect, it } from "vitest";

import { getNextFeatureSprintLegalAction } from "../core/featureSprintNextLegalAction";
import { createDurableLaunchReadyDogfoodState } from "./featureSprintDurableLaunchSeed";

describe("createDurableLaunchReadyDogfoodState", () => {
  it("reaches launch_implementation with kernel-managed plan", () => {
    const seed = createDurableLaunchReadyDogfoodState({
      repoPath: process.cwd()
    });
    expect(seed.nextAction).toBe("launch_implementation");
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("launch_implementation");
    expect(seed.state.projects[0]?.repoPath).toBe(process.cwd());
    expect(seed.state.projects[0]?.verificationCommands).toEqual(["node --version"]);
    const task = seed.state.featureSprintPlans[0]?.sprintMap?.sprints[0]?.stories[0]?.tasks[0];
    expect(task?.scope.allowedPaths).toEqual(["src/core/**", ".life-harness/**"]);
  });
});
