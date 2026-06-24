import {
  buildFeatureStepPromptAuditPacket,
  getActiveFeatureSprintPlanForCard,
  parseFeaturePromptCritiqueBlock,
  resolveStepImplementationPrompt,
  type FeaturePacketBuildResult,
  type FeaturePromptCritiqueImport
} from "./featureSprintOrchestrator";
import { detectFeatureSprintAutomatedPromptAuditStopSignals } from "./featureSprintAutomatedStopSignals";
import { resolveFeatureSprintCurrentSlice } from "./featureSprintCurrentSlice";
import { getProjectForCard } from "./projectRegistry";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintPromptAuditVerdict } from "./types";

export const FEATURE_AUTOMATED_PROMPT_CRITIQUE_FENCE = "feature-automated-prompt-critique";

export type FeatureSprintAutomatedPromptCritiqueVerdict =
  | "approved"
  | "needs_changes"
  | "blocked";

export type FeatureSprintAutomatedPromptCritiqueConfidence = "low" | "medium" | "high";

export type FeatureSprintAutomatedPromptCritique = {
  verdict: FeatureSprintAutomatedPromptCritiqueVerdict;
  confidence: FeatureSprintAutomatedPromptCritiqueConfidence;
  summary: string;
  scopeDrift: boolean;
  promptRisks: string[];
  missingContext: string[];
  missingVerification: string[];
  riskyFiles: string[];
  requiredPromptEdits: string[];
  approvedFiles?: string[];
  disallowedFiles?: string[];
  revisedCursorPrompt?: string;
  humanEscalationReason?: string | null;
};

export type FeatureSprintAutomatedPromptAuditPacketResult =
  | { ok: true; markdown: string; planId: string; stepId?: string }
  | { ok: false; error: string };

export type FeatureSprintAutomatedPromptAuditRequest = {
  cardId: string;
  planId?: string;
  stepId?: string;
  promptMarkdown: string;
  proposedCursorPrompt?: string;
};

export type FeatureSprintAutomatedPromptAuditResult =
  | {
      ok: true;
      outputText: string;
      critique: FeatureSprintAutomatedPromptCritique;
      mode: "mock" | "live";
    }
  | { ok: false; error: string; mode?: "mock" | "live" | "unconfigured" };

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

function exampleAutomatedPromptCritiqueJson(): string {
  return JSON.stringify(
    {
      verdict: "approved",
      confidence: "medium",
      summary: "Prompt is bounded to the current slice with clear verification.",
      scopeDrift: false,
      promptRisks: [],
      missingContext: [],
      missingVerification: [],
      riskyFiles: [],
      requiredPromptEdits: [],
      approvedFiles: ["src/core/example.ts"],
      revisedCursorPrompt: "Implement only the current slice. Run npm test before save."
    },
    null,
    2
  );
}

function remainingSpecItems(plan: { steps: Array<{ status: string; title: string }> }): string[] {
  return plan.steps
    .filter((step) => step.status !== "done")
    .map((step) => step.title)
    .slice(0, 8);
}

export function buildFeatureSprintAutomatedPromptAuditPacket(
  data: LifeHarnessData,
  cardId: string,
  options: {
    planId?: string;
    stepId?: string;
    proposedCursorPrompt?: string;
    cursorPlanText?: string;
    includeRevisedPrompt?: boolean;
    now?: Date;
  } = {}
): FeatureSprintAutomatedPromptAuditPacketResult {
  const plan =
    (options.planId
      ? data.featureSprintPlans.find((item) => item.id === options.planId)
      : undefined) ?? getActiveFeatureSprintPlanForCard(data, cardId);

  if (!plan) {
    return { ok: false, error: "No active plan for automated prompt audit packet." };
  }

  const stepId = options.stepId ?? plan.currentStepId;
  const step = stepId ? plan.steps.find((item) => item.id === stepId) : undefined;
  if (!step) {
    return { ok: false, error: "No current step resolved for automated prompt audit packet." };
  }

  const basePacket = buildFeatureStepPromptAuditPacket(data, plan.id, step.id, { now: options.now });
  if (!basePacket.ok) {
    return basePacket;
  }

  const slice = resolveFeatureSprintCurrentSlice(plan, step);
  const project = getProjectForCard(data, cardId);
  const proposedPrompt =
    cleanOptional(options.proposedCursorPrompt) ??
    cleanOptional(options.cursorPlanText) ??
    resolveStepImplementationPrompt(step);
  const verifyCommands = project?.verificationCommands?.length
    ? project.verificationCommands
    : ["npm run typecheck", "npm test"];

  const stopSignals = detectFeatureSprintAutomatedPromptAuditStopSignals({
    proposedPrompt,
    cursorPlanText: options.cursorPlanText,
    proofText: step.promptLocalization?.revisedImplementationPrompt,
    changedFiles: step.promptLocalization?.likelyFiles
  });

  const lines: string[] = [
    "# Feature Sprint Automated Prompt Audit Packet",
    "",
    "## Global guardrails",
    "- No auto-import, auto-save, auto-advance, or autonomous approval.",
    "- No secrets, unrelated refactors, or repo mutation by the reviewer.",
    "- Preserve shadow/paper/live boundaries where applicable.",
    "- Evidence-first workflow: audit before Cursor touches the repo.",
    "- Reviewer is read-only — return fenced JSON only.",
    "",
    "## Feature spec excerpt",
    `- Feature goal: ${plan.goal}`,
    `- Current slice: ${slice?.title ?? step.title}`,
    `- Slice phase: ${slice?.phase ?? "prompt_auditing"}`,
    `- Step acceptance criteria: ${step.acceptanceCriteria.join("; ") || "none listed"}`,
    `- Feature non-goals: ${plan.nonGoals?.join("; ") || "none listed"}`,
    `- Remaining spec items: ${remainingSpecItems(plan).join("; ") || "none listed"}`,
    ""
  ];

  if (stopSignals.length > 0) {
    lines.push("## Stop / yellow signals detected", ...stopSignals.map((s) => `- ${s}`), "");
  }

  lines.push(
    "## Lite repo context",
    `- Expected output fence: \`feature-prompt-critique\` (staging) from automated \`feature-automated-prompt-critique\``,
    `- Verification commands: ${verifyCommands.join("; ")}`,
    ...(step.promptLocalization?.likelyFiles?.length
      ? [`- Likely files: ${step.promptLocalization.likelyFiles.join("; ")}`]
      : []),
    ...(step.promptLocalization?.testsToRun?.length
      ? [`- Nearby tests: ${step.promptLocalization.testsToRun.join("; ")}`]
      : []),
    "",
    "## Proposed worker input",
    "### Cursor implementation prompt / plan under audit",
    proposedPrompt,
    ""
  );

  if (options.cursorPlanText?.trim()) {
    lines.push("### Cursor repo-aware plan (pasted)", options.cursorPlanText.trim(), "");
  }

  if (step.promptAudit?.finalImplementationPrompt?.trim()) {
    lines.push(
      "### Prior prompt critique (reference only)",
      step.promptAudit.finalImplementationPrompt,
      ""
    );
  }

  lines.push(
    "## Audit instructions",
    "- Audit the prompt/plan **before** implementation.",
    "- Determine whether the prompt is bounded enough for Cursor Auto.",
    "- Detect scope drift from the current slice and approved spec.",
    "- Detect missing acceptance criteria, verification commands, and risky surfaces.",
    "- Do not approve if the plan exceeds the current slice.",
    "- Do not invent new feature goals.",
    "- If ambiguous or risky, return `needs_changes` or `blocked`.",
    "- `revisedCursorPrompt` may be provided for `approved` or `needs_changes` only.",
    "",
    "## Expected output",
    `Return only a fenced \`${FEATURE_AUTOMATED_PROMPT_CRITIQUE_FENCE}\` JSON block.`,
    "",
    "```" + FEATURE_AUTOMATED_PROMPT_CRITIQUE_FENCE,
    exampleAutomatedPromptCritiqueJson(),
    "```",
    "",
    "---",
    "",
    basePacket.markdown
  );

  if (options.includeRevisedPrompt === false) {
    const idx = lines.findIndex((line) => line.includes("revisedCursorPrompt"));
    if (idx >= 0) {
      lines.splice(idx, 1);
    }
  }

  return {
    ok: true,
    markdown: lines.join("\n").trimEnd(),
    planId: plan.id,
    stepId: step.id
  };
}

export function parseFeatureAutomatedPromptCritiqueBlock(
  text: string
): FeatureSprintAutomatedPromptCritique | undefined {
  const pattern = new RegExp(
    `\`\`\`${FEATURE_AUTOMATED_PROMPT_CRITIQUE_FENCE}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
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
      if (verdict !== "approved" && verdict !== "needs_changes" && verdict !== "blocked") {
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
        promptRisks: parseStringList(parsed.promptRisks),
        missingContext: parseStringList(parsed.missingContext),
        missingVerification: parseStringList(parsed.missingVerification),
        riskyFiles: parseStringList(parsed.riskyFiles),
        requiredPromptEdits: parseStringList(parsed.requiredPromptEdits),
        approvedFiles: parseStringList(parsed.approvedFiles),
        disallowedFiles: parseStringList(parsed.disallowedFiles),
        revisedCursorPrompt:
          typeof parsed.revisedCursorPrompt === "string"
            ? parsed.revisedCursorPrompt.trim() || undefined
            : undefined,
        humanEscalationReason:
          typeof parsed.humanEscalationReason === "string"
            ? parsed.humanEscalationReason.trim() || null
            : parsed.humanEscalationReason === null
              ? null
              : undefined
      };
    } catch {
      // ignore invalid JSON
    }
    match = pattern.exec(text);
  }
  return undefined;
}

export function validateFeatureSprintAutomatedPromptCritique(
  critique: FeatureSprintAutomatedPromptCritique
): { ok: true } | { ok: false; error: string } {
  if (!critique.summary.trim()) {
    return { ok: false, error: "Automated prompt critique requires summary." };
  }

  if (critique.verdict === "approved") {
    if (critique.scopeDrift) {
      return { ok: false, error: "Approved prompt critique cannot have scopeDrift=true." };
    }
    if (critique.riskyFiles.length > 0 && critique.confidence === "high") {
      return {
        ok: false,
        error: "High-confidence approved critique cannot include riskyFiles."
      };
    }
    if (critique.missingVerification.length > 0 && critique.confidence === "high") {
      return {
        ok: false,
        error: "High-confidence approved critique cannot include missingVerification."
      };
    }
  }

  if (critique.verdict === "blocked") {
    const hasReason =
      Boolean(critique.humanEscalationReason?.trim()) ||
      critique.promptRisks.length > 0 ||
      critique.riskyFiles.length > 0 ||
      critique.requiredPromptEdits.length > 0;
    if (!hasReason) {
      return {
        ok: false,
        error: "Blocked prompt critique requires escalation reason or risk fields."
      };
    }
  }

  if (
    critique.revisedCursorPrompt?.trim() &&
    critique.verdict !== "approved" &&
    critique.verdict !== "needs_changes"
  ) {
    return {
      ok: false,
      error: "revisedCursorPrompt is only allowed for approved or needs_changes."
    };
  }

  return { ok: true };
}

export function mapAutomatedPromptCritiqueToImportVerdict(
  critique: FeatureSprintAutomatedPromptCritique
): HarnessFeatureSprintPromptAuditVerdict {
  if (critique.verdict === "approved") {
    return "ready";
  }
  return "tighten_first";
}

export function formatAutomatedPromptCritiqueFence(
  critique: FeatureSprintAutomatedPromptCritique
): string {
  return [
    "```" + FEATURE_AUTOMATED_PROMPT_CRITIQUE_FENCE,
    JSON.stringify(critique, null, 2),
    "```"
  ].join("\n");
}

export function formatAutomatedPromptCritiqueForImportStaging(
  critique: FeatureSprintAutomatedPromptCritique,
  options: { fallbackPrompt?: string } = {}
): FeaturePacketBuildResult {
  const validation = validateFeatureSprintAutomatedPromptCritique(critique);
  if (!validation.ok) {
    return validation;
  }

  const fallbackPrompt = cleanOptional(options.fallbackPrompt) ?? "Review prompt audit output before implementation.";
  const finalImplementationPrompt =
    cleanOptional(critique.revisedCursorPrompt) ?? fallbackPrompt;

  const risks = [
    ...critique.promptRisks,
    ...(critique.humanEscalationReason?.trim()
      ? [`Escalation: ${critique.humanEscalationReason.trim()}`]
      : [])
  ];

  const importPayload: FeaturePromptCritiqueImport = {
    verdict: mapAutomatedPromptCritiqueToImportVerdict(critique),
    risks,
    requiredPromptChanges: critique.requiredPromptEdits,
    finalImplementationPrompt,
    mustCheckFiles: [
      ...critique.riskyFiles,
      ...(critique.approvedFiles ?? []),
      ...(critique.disallowedFiles ?? [])
    ].filter((item, index, list) => list.indexOf(item) === index),
    verificationCommands: critique.missingVerification.length
      ? critique.missingVerification
      : []
  };

  const markdown = [
    "```feature-prompt-critique",
    JSON.stringify(importPayload, null, 2),
    "```"
  ].join("\n");

  if (!parseFeaturePromptCritiqueBlock(markdown)) {
    return { ok: false, error: "Staged prompt critique failed import parser validation." };
  }

  return { ok: true, markdown };
}

export function buildMockAutomatedPromptCritique(
  request: FeatureSprintAutomatedPromptAuditRequest,
  options: {
    hasProposedPrompt?: boolean;
    hasVerificationMarkers?: boolean;
    stopSignals?: string[];
    fallbackPrompt?: string;
  } = {}
): FeatureSprintAutomatedPromptCritique {
  const proposed =
    cleanOptional(request.proposedCursorPrompt) ??
    (/\b(implement|slice|step|bounded)\b/i.test(request.promptMarkdown)
      ? request.promptMarkdown
      : "");
  const hasProposedPrompt = options.hasProposedPrompt ?? Boolean(proposed?.trim());
  const stopSignals =
    options.stopSignals ??
    detectFeatureSprintAutomatedPromptAuditStopSignals({
      proposedPrompt: proposed,
      cursorPlanText: request.promptMarkdown
    });
  const hasVerification =
    options.hasVerificationMarkers ??
    /\b(npm test|verification|typecheck)\b/i.test(request.promptMarkdown);

  if (!hasProposedPrompt) {
    return {
      verdict: "needs_changes",
      confidence: "medium",
      summary: "Proposed Cursor prompt or plan is missing or too vague.",
      scopeDrift: false,
      promptRisks: [],
      missingContext: ["Provide a bounded implementation prompt for this slice."],
      missingVerification: ["List verification commands in the prompt."],
      riskyFiles: [],
      requiredPromptEdits: ["Add explicit slice scope and verification commands."]
    };
  }

  if (stopSignals.length > 0) {
    return {
      verdict: "blocked",
      confidence: "high",
      summary: "Stop signals detected in proposed prompt or plan.",
      scopeDrift: true,
      promptRisks: stopSignals,
      missingContext: [],
      missingVerification: [],
      riskyFiles: stopSignals,
      requiredPromptEdits: ["Remove or narrow risky scope before implementation."],
      humanEscalationReason: stopSignals.join("; ")
    };
  }

  if (!hasVerification) {
    return {
      verdict: "needs_changes",
      confidence: "medium",
      summary: "Prompt lacks explicit verification commands.",
      scopeDrift: false,
      promptRisks: [],
      missingContext: [],
      missingVerification: ["Add npm test or project verification commands."],
      riskyFiles: [],
      requiredPromptEdits: ["Include verification commands before implementation."]
    };
  }

  const safePrompt =
    cleanOptional(request.proposedCursorPrompt) ??
    options.fallbackPrompt ??
    "Implement only the current approved slice. Run verification before save.";

  return {
    verdict: "approved",
    confidence: "medium",
    summary: "Mock auditor accepts bounded prompt with verification markers.",
    scopeDrift: false,
    promptRisks: [],
    missingContext: [],
    missingVerification: [],
    riskyFiles: [],
    requiredPromptEdits: [],
    revisedCursorPrompt: safePrompt
  };
}
