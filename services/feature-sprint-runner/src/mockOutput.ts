import {
  isPromptAuditProfile,
  isScopingProfile,
  type FeatureSprintRunnerProfile
} from "../../../src/core/featureSprintRunner";

const MOCK_SCOPING_OUTPUT = `Here is a scoped feature sprint plan for your card.

\`\`\`feature-sprint-plan
{
  "title": "Feature Sprint Local Runner",
  "goal": "Automate scoping and review packet execution locally",
  "whyNow": "Reduce copy/paste friction while keeping import gates manual",
  "acceptanceCriteria": ["Runner fills import textareas", "User still clicks Import"],
  "nonGoals": ["Implementation runner", "Auto-import", "Repo mutation"],
  "constraints": ["Mock mode must pass in CI", "Real agent CLI is experimental"],
  "steps": [
    {
      "title": "Runner protocol",
      "goal": "Add shared request/response types",
      "acceptanceCriteria": ["Validation helpers exist"]
    },
    {
      "title": "Card Detail wiring",
      "goal": "Run scoping/review into import textareas",
      "acceptanceCriteria": ["No auto-import"]
    }
  ]
}
\`\`\`
`;

const MOCK_REVIEW_OUTPUT = `Review complete. The implementation output looks acceptable for this slice.

\`\`\`feature-review-verdict
{
  "status": "accepted",
  "verdict": "Mock reviewer accepts the slice with minor polish follow-ups.",
  "nextPrompt": "Tighten runner docs and dogfood mock mode.",
  "followUps": ["Verify import gates stay manual"]
}
\`\`\`
`;

const MOCK_PROMPT_AUDIT_OUTPUT = `Prompt audit complete. The implementation prompt is bounded for this step.

\`\`\`feature-prompt-critique
{
  "verdict": "ready",
  "risks": ["Scope may creep without explicit file list"],
  "requiredPromptChanges": ["Keep changes limited to listed files"],
  "finalImplementationPrompt": "Implement the current step using only the files named in the audit packet. Add tests for core logic changes.",
  "mustCheckFiles": ["src/core/featureSprintOrchestrator.ts"],
  "verificationCommands": ["npm test -- --run src/core/featureSprintOrchestrator.test.ts"]
}
\`\`\`
`;

export function buildMockRunnerOutput(profile: FeatureSprintRunnerProfile): string {
  if (isScopingProfile(profile)) {
    return MOCK_SCOPING_OUTPUT;
  }

  if (isPromptAuditProfile(profile)) {
    return MOCK_PROMPT_AUDIT_OUTPUT;
  }

  return MOCK_REVIEW_OUTPUT;
}
