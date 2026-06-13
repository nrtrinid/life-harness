import {
  parseFeatureReviewVerdictBlock,
  parseFeatureSprintPlanBlock
} from "./featureSprintOrchestrator";

export function scopingFenceReadinessNotice(outputText: string | undefined): string | undefined {
  if (!outputText?.trim()) {
    return undefined;
  }

  if (parseFeatureSprintPlanBlock(outputText)) {
    return undefined;
  }

  return "Output loaded but no feature-sprint-plan fence found. Inspect before Import plan.";
}

export function reviewFenceReadinessNotice(outputText: string | undefined): string | undefined {
  if (!outputText?.trim()) {
    return undefined;
  }

  if (parseFeatureReviewVerdictBlock(outputText)) {
    return undefined;
  }

  return "Output loaded but no feature-review-verdict fence found. Inspect before Import review verdict.";
}
