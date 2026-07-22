import type {
  HarnessFeatureSprintAutonomyPolicy,
  HarnessFeatureSprintPlan
} from "./types";

export const DEFAULT_FEATURE_SPRINT_AUTONOMY_POLICY: HarnessFeatureSprintAutonomyPolicy = {
  mode: "manual",
  autoSaveValidProof: false,
  autoImportValidVerdict: false,
  autoAdvanceAcceptedTinyTasks: false,
  requireHumanForRiskyTasks: true,
  requireHumanForSpecFreeze: true,
  requireHumanForFinalCompletion: true,
  maxCorrectionAttempts: 2
};

export function resolveFeatureSprintAutonomyPolicy(
  plan?: Pick<HarnessFeatureSprintPlan, "autonomyPolicy"> | null
): HarnessFeatureSprintAutonomyPolicy {
  const raw = plan?.autonomyPolicy;
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_FEATURE_SPRINT_AUTONOMY_POLICY };
  }

  const mode =
    raw.mode === "manual" || raw.mode === "recommend" || raw.mode === "supervised"
      ? raw.mode
      : "manual";

  const maxCorrectionAttempts =
    typeof raw.maxCorrectionAttempts === "number" &&
    Number.isFinite(raw.maxCorrectionAttempts) &&
    raw.maxCorrectionAttempts >= 0
      ? Math.floor(raw.maxCorrectionAttempts)
      : DEFAULT_FEATURE_SPRINT_AUTONOMY_POLICY.maxCorrectionAttempts;

  return {
    mode,
    autoSaveValidProof: raw.autoSaveValidProof === true,
    autoImportValidVerdict: raw.autoImportValidVerdict === true,
    autoAdvanceAcceptedTinyTasks: raw.autoAdvanceAcceptedTinyTasks === true,
    requireHumanForRiskyTasks: raw.requireHumanForRiskyTasks !== false,
    requireHumanForSpecFreeze: raw.requireHumanForSpecFreeze !== false,
    requireHumanForFinalCompletion: raw.requireHumanForFinalCompletion !== false,
    maxCorrectionAttempts
  };
}

/** Supervised may be represented in types/tests but must not launch real workers yet. */
export function autonomyMayAutoLaunchWorkers(
  policy: HarnessFeatureSprintAutonomyPolicy
): boolean {
  void policy;
  return false;
}
