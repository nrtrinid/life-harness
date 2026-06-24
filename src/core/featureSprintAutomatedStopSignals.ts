export type FeatureSprintAutomatedStopInput = {
  changedFiles?: string[];
  diffText?: string;
  proofText?: string;
  agentOutput?: string;
  verificationOutput?: string;
  proposedPrompt?: string;
  cursorPlanText?: string;
};

const BASE_STOP_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "database writes", pattern: /\b(migration|schema change|alter table|create table)\b/i },
  { label: "production job behavior", pattern: /\b(cron|scheduler|cadence|background job)\b/i },
  { label: "matching logic", pattern: /\bmatching logic\b/i },
  { label: "fair-value logic", pattern: /\bfair[- ]value\b/i },
  { label: "settlement boundaries", pattern: /\b(settlement|paper trading|live promotion)\b/i },
  { label: "secrets/env/auth", pattern: /\b(api[_ -]?key|secret|password|auth token|\.env)\b/i },
  { label: "docker/deployment", pattern: /\b(docker|deploy|kubernetes|helm)\b/i },
  { label: "shared orchestration types", pattern: /\borchestration type\b/i },
  { label: "destructive cleanup", pattern: /\b(drop table|force push|hard reset|rm -rf)\b/i },
  { label: "broad refactor", pattern: /\b(broad refactor|repo-wide refactor)\b/i }
];

const PROMPT_AUDIT_STOP_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "supabase writes", pattern: /\b(supabase|postgres write|row level security)\b/i },
  { label: "order execution", pattern: /\b(order execution|place order|submit order)\b/i },
  { label: "bankroll logic", pattern: /\b(bankroll|stake sizing|position sizing)\b/i },
  { label: "no-vig logic", pattern: /\b(no[- ]vig|clv|closing line value)\b/i },
  { label: "phase transition", pattern: /\b(advance slice|advance step|phase transition)\b/i },
  { label: "runner lifecycle", pattern: /\b(runner lifecycle|nextJobLifecycle|worktree cleanup)\b/i },
  { label: "shadow/paper/live promotion", pattern: /\b(shadow mode|paper trading|live promotion)\b/i }
];

function scanStopSignals(
  input: FeatureSprintAutomatedStopInput,
  patterns: Array<{ label: string; pattern: RegExp }>
): string[] {
  const haystack = [
    input.proofText,
    input.agentOutput,
    input.diffText,
    input.verificationOutput,
    input.proposedPrompt,
    input.cursorPlanText,
    ...(input.changedFiles ?? [])
  ]
    .filter(Boolean)
    .join("\n");

  if (!haystack.trim()) {
    return [];
  }

  return patterns.filter(({ pattern }) => pattern.test(haystack)).map(({ label }) => label);
}

export function detectFeatureSprintAutomatedReviewStopSignals(
  input: FeatureSprintAutomatedStopInput
): string[] {
  return scanStopSignals(input, BASE_STOP_SIGNAL_PATTERNS);
}

export function detectFeatureSprintAutomatedPromptAuditStopSignals(
  input: FeatureSprintAutomatedStopInput
): string[] {
  return scanStopSignals(input, [...BASE_STOP_SIGNAL_PATTERNS, ...PROMPT_AUDIT_STOP_SIGNAL_PATTERNS]);
}
