import type { FeatureSprintDogfoodNextActionKind } from "./featureSprintDogfood";
import { runnerAgentLabel, type FeatureSprintRunnerAgent } from "./featureSprintRunner";

export type FeatureSprintActionGuideStepStatus = "done" | "current" | "upcoming";

export type FeatureSprintActionGuideStep = {
  id: string;
  label: string;
  status: FeatureSprintActionGuideStepStatus;
};

export type FeatureSprintActionGuideInput = {
  nextActionKind: FeatureSprintDogfoodNextActionKind;
  runnerAgent?: FeatureSprintRunnerAgent;
  implementationRunViewed: boolean;
  stepOutputSaved: boolean;
  reviewOutputReady: boolean;
  reviewVerdictImported: boolean;
  scopingOutputReady: boolean;
  planImportTextReady: boolean;
};

function step(
  id: string,
  label: string,
  status: FeatureSprintActionGuideStepStatus
): FeatureSprintActionGuideStep {
  return { id, label, status };
}

function markCurrent(steps: FeatureSprintActionGuideStep[]): FeatureSprintActionGuideStep[] {
  let found = false;
  return steps.map((item) => {
    if (item.status === "done") {
      return item;
    }
    if (!found) {
      found = true;
      return { ...item, status: "current" };
    }
    return { ...item, status: "upcoming" };
  });
}

function resolveRunnerAgent(input: FeatureSprintActionGuideInput): FeatureSprintRunnerAgent {
  return input.runnerAgent ?? "codex";
}

function implementationLoopSteps(input: FeatureSprintActionGuideInput): FeatureSprintActionGuideStep[] {
  const agentLabel = runnerAgentLabel(resolveRunnerAgent(input));
  const steps: FeatureSprintActionGuideStep[] = [
    step(
      "view_details",
      "View details on the implementation run (Recent runner runs above)",
      input.implementationRunViewed ? "done" : "current"
    ),
    step(
      "save_output",
      "Save agent output",
      input.stepOutputSaved ? "done" : input.implementationRunViewed ? "current" : "upcoming"
    ),
    step(
      "run_review",
      `Run review with ${agentLabel}`,
      input.reviewOutputReady || input.reviewVerdictImported ? "done" : input.stepOutputSaved ? "current" : "upcoming"
    ),
    step(
      "import_review",
      "Import review verdict",
      input.reviewVerdictImported ? "done" : input.reviewOutputReady ? "current" : "upcoming"
    ),
    step(
      "advance_step",
      "Advance step",
      input.reviewVerdictImported ? "current" : "upcoming"
    )
  ];

  return steps;
}

export function buildFeatureSprintActionGuide(
  input: FeatureSprintActionGuideInput
): FeatureSprintActionGuideStep[] {
  const agentLabel = runnerAgentLabel(resolveRunnerAgent(input));

  switch (input.nextActionKind) {
    case "add_project_metadata":
      return markCurrent([
        step("repo_path", "Save project metadata with a repo path below", "current"),
        step("check_runner", "Check runner in Start feature", "upcoming"),
        step("run_scoping", "Run scoping", "upcoming")
      ]);
    case "check_runner":
      return markCurrent([
        step("start_runner", "Start npm run feature-runner in a terminal", "current"),
        step("check_runner", "Click Check runner in Start feature", "upcoming"),
        step("run_scoping", "Run scoping or copy scoping packet", "upcoming")
      ]);
    case "run_scoping":
      return markCurrent([
        step("rough_spec", "Paste a rough spec in Start feature (optional)", "current"),
        step(
          "run_scoping",
          `Run scoping with ${agentLabel} or copy scoping packet`,
          "upcoming"
        ),
        step("import_plan", "Import plan", "upcoming")
      ]);
    case "import_plan":
      return markCurrent([
        step(
          "load_scoping",
          input.scopingOutputReady
            ? "Load latest scoping output or paste into Import plan"
            : "Paste scoping output into Import plan",
          input.planImportTextReady ? "done" : "current"
        ),
        step("import_plan", "Click Import plan", input.planImportTextReady ? "current" : "upcoming")
      ]);
    case "run_implementation":
      return markCurrent([
        step("run_implementation", `Run implementation with ${agentLabel}`, "current"),
        ...implementationLoopSteps({
          ...input,
          implementationRunViewed: false,
          stepOutputSaved: false,
          reviewOutputReady: false,
          reviewVerdictImported: false
        }).slice(0, 2)
      ]);
    case "save_agent_output":
      return implementationLoopSteps(input);
    case "run_review":
      return implementationLoopSteps({
        ...input,
        implementationRunViewed: true,
        stepOutputSaved: true
      });
    case "import_review":
      return implementationLoopSteps({
        ...input,
        implementationRunViewed: true,
        stepOutputSaved: true,
        reviewOutputReady: true
      });
    case "advance_step":
      return markCurrent([
        step("advance_step", "Click Advance step", "current"),
        step(
          "next_slice",
          "Repeat implement → inspect → save → review for the next step",
          "upcoming"
        )
      ]);
    case "complete_feature":
      return markCurrent([
        step("complete_feature", "Click Mark feature complete", "current"),
        step("clean_worktree", "Clean worktree from View details when done", "upcoming")
      ]);
    case "inspect_proof":
      return markCurrent([step("inspect_proof", "Open Proof Ledger to inspect completion proof", "current")]);
    default:
      return [];
  }
}
