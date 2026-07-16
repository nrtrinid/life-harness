import {
  isImplementationProfile,
  type FeatureSprintRunnerFailureClass,
  type FeatureSprintRunnerProfile,
  type FeatureSprintRunnerResultUsability
} from "../../../src/core/featureSprintRunner";
import { isWhitespaceOnly } from "./outputNormalize";

export type UsabilityAssessment = {
  /** Workflow success — false for empty_output and hard failures. */
  ok: boolean;
  resultUsability: FeatureSprintRunnerResultUsability;
  failureClass: FeatureSprintRunnerFailureClass;
  parseWarnings: string[];
  diagnosticMessage?: string;
  error?: string;
};

/**
 * Profile-specific empty-output policy after a normal process exit (terminationReason=completed).
 *
 * - Scoping / review / prompt_audit: nonempty textual (or structured) output is required.
 * - Implementation: nonempty text OR worktree file changes count as usable evidence.
 *   Sparse text with real worktree changes is allowed; empty text + no changes is empty_output.
 */
export function assessCompletedRunUsability(input: {
  profile: FeatureSprintRunnerProfile;
  outputText: string | undefined;
  changedFiles?: string[];
  agentLabel?: string;
}): UsabilityAssessment {
  const label = input.agentLabel ?? "Agent";
  const hasText = !isWhitespaceOnly(input.outputText);
  const hasWorktreeChanges = (input.changedFiles?.length ?? 0) > 0;

  if (isImplementationProfile(input.profile)) {
    if (hasText || hasWorktreeChanges) {
      const parseWarnings: string[] = [];
      if (!hasText && hasWorktreeChanges) {
        parseWarnings.push(
          "Implementation produced worktree changes with sparse/empty textual output; treating worktree evidence as usable."
        );
      }
      return {
        ok: true,
        resultUsability: "usable",
        failureClass: "none",
        parseWarnings
      };
    }

    return {
      ok: false,
      resultUsability: "empty_output",
      failureClass: "empty_output",
      parseWarnings: [
        `${label} exited 0 but produced empty output and no worktree file changes. Needs human review before import/save.`
      ],
      diagnosticMessage:
        "Process completed successfully but produced no usable implementation evidence (empty output, no changed files).",
      error:
        "Empty agent output after successful exit. Re-run the profile or switch providers; nothing was imported."
    };
  }

  // Scoping, review, prompt_audit — textual/structured output required.
  if (hasText) {
    return {
      ok: true,
      resultUsability: "usable",
      failureClass: "none",
      parseWarnings: []
    };
  }

  return {
    ok: false,
    resultUsability: "empty_output",
    failureClass: "empty_output",
    parseWarnings: [
      `${label} exited 0 with empty/whitespace-only stdout+stderr. Process succeeded; workflow result is not usable.`
    ],
    diagnosticMessage:
      "Process completed successfully but produced empty output. Feature Sprint requires textual or fenced content for this profile.",
    error:
      "Empty agent output after successful exit. Re-run the profile or switch providers; nothing was imported."
  };
}

/** Map termination/failure reasons to usability for non-completed outcomes. */
export function usabilityForFailure(
  failureClass: FeatureSprintRunnerFailureClass
): FeatureSprintRunnerResultUsability {
  if (failureClass === "empty_output") {
    return "empty_output";
  }
  if (failureClass === "none") {
    return "usable";
  }
  if (failureClass === "agent") {
    return "needs_human_review";
  }
  return "unusable";
}
