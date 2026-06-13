import { describe, expect, it } from "vitest";

import { buildFeatureSprintActionGuide } from "./featureSprintActionGuide";

describe("buildFeatureSprintActionGuide", () => {
  it("guides import plan when scoping output exists", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "import_plan",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: true,
      planImportTextReady: false
    });

    expect(steps[0]).toMatchObject({
      id: "load_scoping",
      status: "current"
    });
    expect(steps[1]).toMatchObject({
      id: "import_plan",
      status: "upcoming"
    });
  });

  it("guides post-implementation save flow with cursor agent labels", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "save_agent_output",
      runnerAgent: "cursor",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "run_review")?.label).toBe("Run review with Cursor");
  });

  it("guides post-implementation save flow", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "save_agent_output",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.map((item) => item.id)).toEqual([
      "view_details",
      "save_output",
      "run_review",
      "import_review",
      "advance_step"
    ]);
    expect(steps[0]?.status).toBe("current");
    expect(steps[1]?.status).toBe("upcoming");
  });

  it("moves to save after implementation run is viewed", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "save_agent_output",
      implementationRunViewed: true,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps[0]?.status).toBe("done");
    expect(steps[1]?.status).toBe("current");
  });
});
