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
      "normalize_proof",
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

  it("guides approve feature spec before implementation", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "approve_feature_spec",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "approve_feature_spec")).toMatchObject({
      status: "current"
    });
    expect(steps.some((item) => item.id === "run_implementation")).toBe(true);
  });

  it("prepends save feature spec when textarea is dirty", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_scoping",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      featureSpecDirty: true
    });

    expect(steps[0]).toMatchObject({
      id: "save_feature_spec",
      status: "current"
    });
    expect(steps[1]?.id).not.toBe("save_feature_spec");
  });

  it("prepends optional localization steps when not saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      runnerAgent: "cursor",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: false
    });

    expect(steps[0]?.id).toBe("copy_localization");
    expect(steps[1]?.id).toBe("import_localization");
    expect(steps.some((item) => item.id === "run_implementation")).toBe(true);
  });

  it("marks localization steps done when saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: true
    });

    expect(steps.find((item) => item.id === "copy_localization")?.status).toBe("done");
    expect(steps.find((item) => item.id === "import_localization")?.status).toBe("done");
  });

  it("prepends optional prompt audit steps when not saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: true,
      stepPromptAuditSaved: false
    });

    expect(steps[0]?.id).toBe("copy_localization");
    expect(steps[1]?.id).toBe("import_localization");
    expect(steps[2]?.id).toBe("copy_prompt_audit");
    expect(steps[3]?.id).toBe("run_prompt_audit");
    expect(steps[4]?.id).toBe("import_prompt_audit");
  });

  it("marks run_prompt_audit done when runner succeeded", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: true,
      stepPromptAuditSaved: false,
      stepPromptAuditRunnerSucceeded: true
    });

    expect(steps.find((item) => item.id === "copy_prompt_audit")?.status).toBe("upcoming");
    expect(steps.find((item) => item.id === "run_prompt_audit")?.status).toBe("done");
    expect(steps.find((item) => item.id === "import_prompt_audit")?.status).toBe("upcoming");
  });

  it("marks prompt audit import done only when saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: true,
      stepPromptAuditSaved: true,
      stepPromptAuditRunnerSucceeded: true
    });

    expect(steps.find((item) => item.id === "import_prompt_audit")?.status).toBe("done");
  });

  it("shows full post-implementation checklist during run_implementation", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "run_implementation",
      implementationRunViewed: false,
      stepOutputSaved: false,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false,
      stepLocalizationSaved: true,
      stepPromptAuditSaved: true
    });

    expect(steps.find((item) => item.id === "run_implementation")?.status).toBe("current");
    expect(steps.find((item) => item.id === "save_output")?.status).toBe("upcoming");
    expect(steps.find((item) => item.id === "import_review")?.status).toBe("upcoming");
    expect(steps.find((item) => item.id === "advance_step")?.status).toBe("upcoming");
  });

  it("marks import review done for needs_changes but keeps advance upcoming", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "import_review",
      implementationRunViewed: true,
      stepOutputSaved: true,
      reviewOutputReady: true,
      reviewVerdictImported: true,
      stepReviewAccepted: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "import_review")?.status).toBe("done");
    expect(steps.find((item) => item.id === "advance_step")?.status).toBe("upcoming");
  });

  it("marks advance current only when review accepted", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "import_review",
      implementationRunViewed: true,
      stepOutputSaved: true,
      reviewOutputReady: true,
      reviewVerdictImported: true,
      stepReviewAccepted: true,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "import_review")?.status).toBe("done");
    expect(steps.find((item) => item.id === "advance_step")?.status).toBe("current");
  });

  it("guides normalize proof after output is saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "save_agent_output",
      implementationRunViewed: true,
      stepOutputSaved: true,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "normalize_proof")).toMatchObject({
      status: "current"
    });
    expect(steps.find((item) => item.id === "run_review")?.status).toBe("current");
  });

  it("marks normalize proof done when proof is saved", () => {
    const steps = buildFeatureSprintActionGuide({
      nextActionKind: "save_agent_output",
      implementationRunViewed: true,
      stepOutputSaved: true,
      stepImplementationProofSaved: true,
      reviewOutputReady: false,
      reviewVerdictImported: false,
      scopingOutputReady: false,
      planImportTextReady: false
    });

    expect(steps.find((item) => item.id === "normalize_proof")?.status).toBe("done");
    expect(steps.find((item) => item.id === "run_review")?.status).toBe("current");
  });
});
