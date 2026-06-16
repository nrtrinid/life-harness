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
  /** UI-only: local textarea differs from persisted plan.featureSpec.body */
  featureSpecDirty?: boolean;
  /** Persisted localization on current step */
  stepLocalizationSaved?: boolean;
  /** Persisted prompt audit on current step */
  stepPromptAuditSaved?: boolean;
  /** Persisted implementation proof on current step */
  stepImplementationProofSaved?: boolean;
  /** Step review accepted — gates advance_step in checklist */
  stepReviewAccepted?: boolean;
  /** Current reviewed step has its own imported spec update and approved revised spec */
  currentStepSpecUpdateSatisfied?: boolean;
  /** Succeeded codex_prompt_audit run output exists for current step */
  stepPromptAuditRunnerSucceeded?: boolean;
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
      "normalize_proof",
      "Normalize for review (optional)",
      input.stepImplementationProofSaved ? "done" : input.stepOutputSaved ? "current" : "upcoming"
    ),
    step(
      "run_review",
      `Run review with ${agentLabel}`,
      input.reviewOutputReady || input.reviewVerdictImported
        ? "done"
        : input.stepImplementationProofSaved || input.stepOutputSaved
          ? "current"
          : "upcoming"
    ),
    step(
      "import_review",
      "Import review verdict",
      input.reviewVerdictImported ? "done" : input.reviewOutputReady ? "current" : "upcoming"
    ),
    step(
      "advance_step",
      "Advance step",
      input.stepReviewAccepted && input.currentStepSpecUpdateSatisfied !== false
        ? "current"
        : "upcoming"
    )
  ];

  return steps;
}

function needsRevisedSpecApproval(input: FeatureSprintActionGuideInput): boolean {
  return Boolean(
    input.stepReviewAccepted && input.currentStepSpecUpdateSatisfied === false
  );
}

function prependRevisedSpecApprovalSteps(
  steps: FeatureSprintActionGuideStep[],
  input: FeatureSprintActionGuideInput
): FeatureSprintActionGuideStep[] {
  if (!needsRevisedSpecApproval(input)) {
    return steps;
  }
  return [
    step(
      "approve_revised_feature_spec",
      "Approve revised feature spec in Start feature (step 1)",
      "current"
    ),
    ...steps.map((item) =>
      item.status === "current" ? { ...item, status: "upcoming" as const } : item
    )
  ];
}

function prependSaveFeatureSpecStep(
  steps: FeatureSprintActionGuideStep[],
  dirty: boolean
): FeatureSprintActionGuideStep[] {
  if (!dirty) {
    return steps;
  }
  return [
    step("save_feature_spec", "Save feature spec", "current"),
    ...steps.map((item) =>
      item.status === "current" ? { ...item, status: "upcoming" as const } : item
    )
  ];
}

function prependOptionalLocalizationSteps(
  steps: FeatureSprintActionGuideStep[],
  saved: boolean
): FeatureSprintActionGuideStep[] {
  const localizationSteps: FeatureSprintActionGuideStep[] = [
    step(
      "copy_localization",
      "Copy for Cursor localization (optional)",
      saved ? "done" : "upcoming"
    ),
    step(
      "import_localization",
      "Import localization (optional)",
      saved ? "done" : "upcoming"
    )
  ];
  return [...localizationSteps, ...steps];
}

function prependOptionalAuditSteps(
  steps: FeatureSprintActionGuideStep[],
  input: FeatureSprintActionGuideInput
): FeatureSprintActionGuideStep[] {
  const auditSaved = Boolean(input.stepPromptAuditSaved);
  const auditSteps: FeatureSprintActionGuideStep[] = [
    step(
      "copy_prompt_audit",
      "Copy for GPT/Codex prompt audit (optional)",
      auditSaved ? "done" : "upcoming"
    ),
    step(
      "run_prompt_audit",
      "Run prompt audit with Codex (optional)",
      auditSaved
        ? "done"
        : input.stepPromptAuditRunnerSucceeded
          ? "done"
          : "upcoming"
    ),
    step(
      "import_prompt_audit",
      "Import prompt audit (optional)",
      auditSaved ? "done" : "upcoming"
    )
  ];
  return [...auditSteps, ...steps];
}

function prependOptionalInnerLoopSteps(
  steps: FeatureSprintActionGuideStep[],
  input: FeatureSprintActionGuideInput
): FeatureSprintActionGuideStep[] {
  return prependOptionalLocalizationSteps(
    prependOptionalAuditSteps(steps, input),
    Boolean(input.stepLocalizationSaved)
  );
}

export function buildFeatureSprintActionGuide(
  input: FeatureSprintActionGuideInput
): FeatureSprintActionGuideStep[] {
  const agentLabel = runnerAgentLabel(resolveRunnerAgent(input));

  let steps: FeatureSprintActionGuideStep[];

  switch (input.nextActionKind) {
    case "add_project_metadata":
      steps = markCurrent([
        step("repo_path", "Save project metadata with a repo path below", "current"),
        step("check_runner", "Check runner in Start feature", "upcoming"),
        step("run_scoping", "Run scoping", "upcoming")
      ]);
      break;
    case "check_runner":
      steps = markCurrent([
        step("start_runner", "Start npm run feature-runner in a terminal", "current"),
        step("check_runner", "Click Check runner in Start feature", "upcoming"),
        step("run_scoping", "Copy for ChatGPT/Codex scoping or run scoping", "upcoming")
      ]);
      break;
    case "run_scoping":
      steps = markCurrent([
        step("rough_spec", "Paste a feature spec in Start feature", "current"),
        step("save_feature_spec", "Save feature spec", "upcoming"),
        step(
          "run_scoping",
          "Copy for ChatGPT/Codex scoping or run scoping with runner",
          "upcoming"
        ),
        step("import_plan", "Import plan", "upcoming")
      ]);
      break;
    case "import_plan":
      steps = markCurrent([
        step(
          "load_scoping",
          input.scopingOutputReady
            ? "Load latest scoping output or paste into Import plan"
            : "Paste scoping output into Import plan",
          input.planImportTextReady ? "done" : "current"
        ),
        step("import_plan", "Click Import plan", input.planImportTextReady ? "current" : "upcoming")
      ]);
      break;
    case "approve_feature_spec":
      steps = prependOptionalInnerLoopSteps(
        markCurrent([
          step("approve_feature_spec", "Approve feature spec", "current"),
          step("import_plan", "Import plan if not imported yet", "upcoming"),
          step("run_implementation", `Run implementation with ${agentLabel}`, "upcoming")
        ]),
        input
      );
      break;
    case "run_implementation":
      steps = prependOptionalInnerLoopSteps(
        markCurrent([
          step("run_implementation", `Run implementation with ${agentLabel}`, "current"),
          ...implementationLoopSteps({
            ...input,
            implementationRunViewed: false,
            stepOutputSaved: false,
            reviewOutputReady: false,
            reviewVerdictImported: false,
            stepReviewAccepted: false
          }).map((item) => ({ ...item, status: "upcoming" as const }))
        ]),
        input
      );
      break;
    case "save_agent_output":
      steps = implementationLoopSteps(input);
      break;
    case "run_review":
      steps = implementationLoopSteps({
        ...input,
        implementationRunViewed: true,
        stepOutputSaved: true
      });
      break;
    case "import_review":
      steps = implementationLoopSteps({
        ...input,
        implementationRunViewed: true,
        stepOutputSaved: true,
        reviewOutputReady: true
      });
      break;
    case "advance_step":
      steps = [
        step(
          "advance_step",
          "Click Advance step",
          input.stepReviewAccepted && input.currentStepSpecUpdateSatisfied !== false
            ? "current"
            : "upcoming"
        ),
        step(
          "next_slice",
          "Repeat implement → inspect → save → review for the next step",
          "upcoming"
        )
      ];
      break;
    case "complete_feature":
      steps = markCurrent([
        step("complete_feature", "Click Mark feature complete", "current"),
        step("clean_worktree", "Clean worktree from View details when done", "upcoming")
      ]);
      break;
    case "inspect_proof":
      steps = markCurrent([
        step("inspect_proof", "Open Proof Ledger to inspect completion proof", "current")
      ]);
      break;
    default:
      steps = [];
  }

  return prependRevisedSpecApprovalSteps(
    prependSaveFeatureSpecStep(steps, Boolean(input.featureSpecDirty)),
    input
  );
}
