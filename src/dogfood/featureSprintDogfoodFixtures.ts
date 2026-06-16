/** Deterministic fenced outputs for Feature Sprint dogfood / Playwright (token-free). */

export const FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT = `Review complete. The implementation output looks acceptable for this slice.

\`\`\`feature-review-verdict
{
  "status": "accepted",
  "verdict": "Mock reviewer accepts the slice with minor polish follow-ups.",
  "nextPrompt": "Tighten runner docs and dogfood mock mode.",
  "followUps": ["Verify import gates stay manual"]
}
\`\`\`
`;

export const FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT =
  "Dogfood mock implementation output for the Core module slice.";
