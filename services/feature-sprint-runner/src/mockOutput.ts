import type { FeatureSprintRunnerProfile } from "../../../src/core/featureSprintRunner";

export function buildMockRunnerOutput(profile: FeatureSprintRunnerProfile): string {
  if (profile === "codex_scoping") {
    return `Here is a scoped feature sprint plan for your card.

\`\`\`feature-sprint-plan
{
  "title": "Feature Sprint Local Runner",
  "goal": "Automate scoping and review packet execution locally",
  "whyNow": "Reduce copy/paste friction while keeping import gates manual",
  "acceptanceCriteria": ["Runner fills import textareas", "User still clicks Import"],
  "nonGoals": ["Implementation runner", "Auto-import", "Repo mutation"],
  "constraints": ["Mock mode must pass in CI", "Real Codex is experimental"],
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
  }

  return `Review complete. The implementation output looks acceptable for this slice.

\`\`\`feature-review-verdict
{
  "status": "accepted",
  "verdict": "Mock reviewer accepts the slice with minor polish follow-ups.",
  "nextPrompt": "Tighten runner docs and dogfood mock mode.",
  "followUps": ["Verify import gates stay manual"]
}
\`\`\`
`;
}
