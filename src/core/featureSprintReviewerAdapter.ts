import {
  buildFeatureStepReviewPacket,
  getActiveFeatureSprintPlanForCard,
  parseFeatureReviewVerdictBlock,
  type FeaturePacketBuildResult,
  type FeatureReviewVerdictImport
} from "./featureSprintOrchestrator";
import { resolveLatestImplementationRunForStep } from "./featureSprintImplementationProof";
import { resolveFeatureSprintCurrentSlice } from "./featureSprintCurrentSlice";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintReviewStatus } from "./types";

export const FEATURE_AUTOMATED_REVIEW_VERDICT_FENCE = "feature-automated-review-verdict";

export type FeatureSprintAutomatedReviewVerdictKind =
  | "accepted"
  | "needs_changes"
  | "rejected"
  | "stop";

export type FeatureSprintAutomatedReviewConfidence = "low" | "medium" | "high";

export type FeatureSprintAutomatedReviewVerdict = {
  verdict: FeatureSprintAutomatedReviewVerdictKind;
  confidence: FeatureSprintAutomatedReviewConfidence;
  summary: string;
  scopeDrift: boolean;
  missingTests: string[];
  riskyChanges: string[];
  requiredChanges: string[];
  completedSliceItems: string[];
  remainingSpecItems: string[];
  nextCursorPrompt?: string;
  stopReason?: string;
};

export type FeatureSprintAutomatedReviewPacketResult =
  | { ok: true; markdown: string; planId: string; stepId?: string }
  | { ok: false; error: string };

export type FeatureSprintAutomatedReviewRequest = {
  cardId: string;
  planId?: string;
  stepId?: string;
  promptMarkdown: string;
};

export type FeatureSprintAutomatedReviewResult =
  | {
      ok: true;
      outputText: string;
      verdict: FeatureSprintAutomatedReviewVerdict;
      mode: "mock" | "live";
    }
  | { ok: false; error: string; mode?: "mock" | "live" | "unconfigured" };

export type FeatureSprintAutomatedReviewStopInput = {
  changedFiles?: string[];
  diffText?: string;
  proofText?: string;
  agentOutput?: string;
  verificationOutput?: string;
};

const STOP_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
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

const VALID_IMPORT_STATUSES = new Set<HarnessFeatureSprintReviewStatus>([
  "accepted",
  "needs_changes",
  "blocked"
]);

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function exampleAutomatedVerdictJson(): string {
  return JSON.stringify(
    {
      verdict: "accepted",
      confidence: "medium",
      summary: "Slice matches approved spec with bounded changes.",
      scopeDrift: false,
      missingTests: [],
      riskyChanges: [],
      requiredChanges: [],
      completedSliceItems: ["Current slice acceptance criteria met"],
      remainingSpecItems: ["Next slice from approved spec"],
      nextCursorPrompt: "Implement the next approved slice only."
    },
    null,
    2
  );
}

export function detectFeatureSprintAutomatedReviewStopSignals(
  input: FeatureSprintAutomatedReviewStopInput
): string[] {
  const haystack = [
    input.proofText,
    input.agentOutput,
    input.diffText,
    input.verificationOutput,
    ...(input.changedFiles ?? [])
  ]
    .filter(Boolean)
    .join("\n");

  if (!haystack.trim()) {
    return [];
  }

  return STOP_SIGNAL_PATTERNS.filter(({ pattern }) => pattern.test(haystack)).map(
    ({ label }) => label
  );
}

export function buildFeatureSprintAutomatedReviewPacket(
  data: LifeHarnessData,
  cardId: string,
  options: {
    planId?: string;
    stepId?: string;
    agentOutput?: string;
    includeNextCursorPrompt?: boolean;
    now?: Date;
  } = {}
): FeatureSprintAutomatedReviewPacketResult {
  const plan =
    (options.planId
      ? data.featureSprintPlans.find((item) => item.id === options.planId)
      : undefined) ?? getActiveFeatureSprintPlanForCard(data, cardId);

  if (!plan) {
    return { ok: false, error: "No active plan for automated review packet." };
  }

  const stepId = options.stepId ?? plan.currentStepId;
  const step = stepId ? plan.steps.find((item) => item.id === stepId) : undefined;
  if (!step) {
    return { ok: false, error: "No current step resolved for automated review packet." };
  }

  const reviewPacket = buildFeatureStepReviewPacket(
    data,
    plan.id,
    step.id,
    options.agentOutput,
    { now: options.now }
  );
  if (!reviewPacket.ok) {
    return reviewPacket;
  }

  const slice = resolveFeatureSprintCurrentSlice(plan, step);
  const implRun = resolveLatestImplementationRunForStep(data, plan.id, step.id);
  const stopSignals = detectFeatureSprintAutomatedReviewStopSignals({
    changedFiles: implRun?.changedFiles,
    diffText: implRun?.diffText,
    proofText: step.implementationProof?.rawOutput ?? step.outputSummary,
    agentOutput: options.agentOutput ?? step.outputSummary,
    verificationOutput: implRun?.verificationResults
      ?.map((row) => `${row.command}:${row.status}`)
      .join("\n")
  });

  const lines: string[] = [
    "# Feature Sprint Automated Review Packet",
    "",
    "## Role",
    "You are a read-only reviewer for the current Feature Sprint slice.",
    "Do not edit files. Do not approve gates. Do not invent new feature goals.",
    "",
    "## Current slice context",
    `- Title: ${slice?.title ?? step.title}`,
    `- Phase: ${slice?.phase ?? "reviewing"}`,
    `- Linked step: ${step.id}`,
    ""
  ];

  if (stopSignals.length > 0) {
    lines.push("## Stop / yellow signals detected in evidence", ...stopSignals.map((s) => `- ${s}`), "");
  }

  lines.push(
    "## Review checklist",
    "- Compare implementation against the approved full feature spec and current slice only.",
    "- Detect scope drift, missing tests, and risky changes.",
    "- Do not approve if proof is missing or unclear.",
    "- If risky or ambiguous, return `needs_changes` or `stop`.",
    "- If accepted, propose the next Cursor prompt only from remaining approved spec/slices.",
    "",
    "## Non-goals",
    "- No repo edits, migrations, deploys, or auth changes in this review.",
    "- No auto-import, auto-save, auto-advance, or autonomous approval.",
    "",
    "## Expected output",
    `Return only a fenced \`${FEATURE_AUTOMATED_REVIEW_VERDICT_FENCE}\` JSON block.`,
    "",
    "```" + FEATURE_AUTOMATED_REVIEW_VERDICT_FENCE,
    exampleAutomatedVerdictJson(),
    "```",
    "",
    "---",
    "",
    reviewPacket.markdown
  );

  if (options.includeNextCursorPrompt === false) {
    lines.splice(
      lines.findIndex((line) => line.startsWith("- If accepted, propose")),
      1
    );
  }

  return {
    ok: true,
    markdown: lines.join("\n").trimEnd(),
    planId: plan.id,
    stepId: step.id
  };
}

export function parseFeatureAutomatedReviewVerdictBlock(
  text: string
): FeatureSprintAutomatedReviewVerdict | undefined {
  const pattern = new RegExp(
    `\`\`\`${FEATURE_AUTOMATED_REVIEW_VERDICT_FENCE}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    "g"
  );
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
      const verdict = typeof parsed.verdict === "string" ? parsed.verdict.trim() : "";
      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      const confidence =
        parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
          ? parsed.confidence
          : "medium";
      if (
        verdict !== "accepted" &&
        verdict !== "needs_changes" &&
        verdict !== "rejected" &&
        verdict !== "stop"
      ) {
        match = pattern.exec(text);
        continue;
      }
      if (!summary) {
        match = pattern.exec(text);
        continue;
      }
      return {
        verdict,
        confidence,
        summary,
        scopeDrift: parsed.scopeDrift === true,
        missingTests: parseStringList(parsed.missingTests),
        riskyChanges: parseStringList(parsed.riskyChanges),
        requiredChanges: parseStringList(parsed.requiredChanges),
        completedSliceItems: parseStringList(parsed.completedSliceItems),
        remainingSpecItems: parseStringList(parsed.remainingSpecItems),
        nextCursorPrompt: cleanOptional(
          typeof parsed.nextCursorPrompt === "string" ? parsed.nextCursorPrompt : undefined
        ),
        stopReason: cleanOptional(
          typeof parsed.stopReason === "string" ? parsed.stopReason : undefined
        )
      };
    } catch {
      // try next block
    }
    match = pattern.exec(text);
  }
  return undefined;
}

export function validateFeatureSprintAutomatedReviewVerdict(
  verdict: FeatureSprintAutomatedReviewVerdict
): { ok: true } | { ok: false; error: string } {
  if (!verdict.summary.trim()) {
    return { ok: false, error: "Automated review verdict requires summary." };
  }

  if (verdict.verdict === "accepted") {
    if (verdict.scopeDrift) {
      return { ok: false, error: "Accepted verdict cannot have scopeDrift=true." };
    }
    if (verdict.riskyChanges.length > 0) {
      return {
        ok: false,
        error: "Accepted verdict cannot include riskyChanges."
      };
    }
    if (verdict.missingTests.length > 0 && verdict.confidence === "high") {
      return {
        ok: false,
        error: "High-confidence accepted verdict cannot include missingTests."
      };
    }
    if (verdict.stopReason?.trim()) {
      return { ok: false, error: "Accepted verdict cannot include stopReason." };
    }
  } else if (verdict.nextCursorPrompt?.trim()) {
    return {
      ok: false,
      error: "nextCursorPrompt is only allowed when verdict is accepted."
    };
  }

  if (verdict.riskyChanges.length > 0 && verdict.verdict === "accepted") {
    return { ok: false, error: "riskyChanges prevents accepted verdict." };
  }

  if (
    verdict.riskyChanges.length > 0 &&
    verdict.verdict !== "needs_changes" &&
    verdict.verdict !== "stop" &&
    verdict.verdict !== "rejected"
  ) {
    return { ok: false, error: "riskyChanges requires needs_changes, rejected, or stop." };
  }

  return { ok: true };
}

export function mapAutomatedVerdictToImportStatus(
  verdict: FeatureSprintAutomatedReviewVerdict
): HarnessFeatureSprintReviewStatus {
  switch (verdict.verdict) {
    case "accepted":
      return "accepted";
    case "needs_changes":
      return "needs_changes";
    case "stop":
      return "blocked";
    case "rejected":
      return "needs_changes";
    default:
      return "needs_changes";
  }
}

export function formatAutomatedReviewVerdictFence(
  verdict: FeatureSprintAutomatedReviewVerdict
): string {
  return ["```" + FEATURE_AUTOMATED_REVIEW_VERDICT_FENCE, JSON.stringify(verdict, null, 2), "```"].join(
    "\n"
  );
}

export function formatAutomatedReviewForImportStaging(
  verdict: FeatureSprintAutomatedReviewVerdict
): FeaturePacketBuildResult {
  const validation = validateFeatureSprintAutomatedReviewVerdict(verdict);
  if (!validation.ok) {
    return validation;
  }

  const status = mapAutomatedVerdictToImportStatus(verdict);
  if (!VALID_IMPORT_STATUSES.has(status)) {
    return { ok: false, error: `Unsupported import status: ${status}` };
  }

  const verdictLines = [verdict.summary];
  if (verdict.requiredChanges.length > 0) {
    verdictLines.push("", "Required changes:", ...verdict.requiredChanges.map((item) => `- ${item}`));
  }
  if (verdict.stopReason?.trim()) {
    verdictLines.push("", `Stop reason: ${verdict.stopReason.trim()}`);
  }
  if (verdict.riskyChanges.length > 0) {
    verdictLines.push("", "Risky changes:", ...verdict.riskyChanges.map((item) => `- ${item}`));
  }

  const importPayload: FeatureReviewVerdictImport = {
    status,
    verdict: verdictLines.join("\n").trim(),
    nextPrompt: verdict.verdict === "accepted" ? verdict.nextCursorPrompt : undefined,
    followUps:
      verdict.verdict === "accepted"
        ? verdict.remainingSpecItems.slice(0, 5)
        : verdict.requiredChanges.slice(0, 5)
  };

  const markdown = [
    "```feature-review-verdict",
    JSON.stringify(importPayload, null, 2),
    "```"
  ].join("\n");

  if (!parseFeatureReviewVerdictBlock(markdown)) {
    return { ok: false, error: "Staged review verdict failed import parser validation." };
  }

  return { ok: true, markdown };
}

export function buildMockAutomatedReviewVerdict(
  request: FeatureSprintAutomatedReviewRequest,
  options: {
    hasProof?: boolean;
    stopSignals?: string[];
    remainingSpecItems?: string[];
  } = {}
): FeatureSprintAutomatedReviewVerdict {
  const hasProof = options.hasProof ?? /\b(Implemented|output|proof)\b/i.test(request.promptMarkdown);
  const stopSignals =
    options.stopSignals ??
    detectFeatureSprintAutomatedReviewStopSignals({
      proofText: request.promptMarkdown,
      agentOutput: request.promptMarkdown
    });

  if (!hasProof) {
    return {
      verdict: "needs_changes",
      confidence: "medium",
      summary: "Implementation proof or agent output is missing or unclear.",
      scopeDrift: false,
      missingTests: ["Add or normalize implementation proof before review."],
      riskyChanges: [],
      requiredChanges: ["Provide saved agent output and normalized proof."],
      completedSliceItems: [],
      remainingSpecItems: options.remainingSpecItems ?? ["Complete current slice proof"]
    };
  }

  if (stopSignals.length > 0) {
    return {
      verdict: "stop",
      confidence: "high",
      summary: "Stop signals detected in slice evidence.",
      scopeDrift: true,
      missingTests: [],
      riskyChanges: stopSignals,
      requiredChanges: ["Address stop signals before continuing."],
      completedSliceItems: [],
      remainingSpecItems: options.remainingSpecItems ?? [],
      stopReason: stopSignals.join("; ")
    };
  }

  const remaining = options.remainingSpecItems ?? [
    "Continue with the next approved slice from the feature spec."
  ];

  return {
    verdict: "accepted",
    confidence: "medium",
    summary: "Mock reviewer accepts the slice with bounded follow-ups.",
    scopeDrift: false,
    missingTests: [],
    riskyChanges: [],
    requiredChanges: [],
    completedSliceItems: ["Current slice implementation reviewed"],
    remainingSpecItems: remaining,
    nextCursorPrompt:
      "Implement the next approved slice only. Stay within listed files and run verification before save."
  };
}
