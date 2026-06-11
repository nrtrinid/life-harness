import { shouldIncludeCard } from "./contextPacketRedaction";
import {
  buildCardContextPacket,
  formatCardContextPacketMarkdown
} from "./harnessContextGraph";
import type { LifeHarnessData } from "./lifeHarnessData";
import { createId, nowIso } from "./ids";
import { buildNextMoveSummary } from "./nextMoveContract";
import { createProofItem } from "./proof";
import { buildProjectContextForCard, getProjectForCard } from "./projectRegistry";
import { computeXP } from "./scoring";
import type {
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintReviewStatus,
  HarnessFeatureSprintStatus,
  HarnessFeatureSprintStep,
  HarnessFeatureSprintStepStatus,
  LifeCard,
  LifeLogEntry
} from "./types";

export const FEATURE_SPRINT_PLAN_FENCE_LABEL = "feature-sprint-plan";
export const FEATURE_REVIEW_VERDICT_FENCE_LABEL = "feature-review-verdict";

const FEATURE_SPRINT_PLAN_FENCE = new RegExp(
  `\`\`\`${FEATURE_SPRINT_PLAN_FENCE_LABEL}(?:\\s|$)([\\s\\S]*?)\`\`\``,
  "g"
);

const FEATURE_REVIEW_VERDICT_FENCE = new RegExp(
  `\`\`\`${FEATURE_REVIEW_VERDICT_FENCE_LABEL}(?:\\s|$)([\\s\\S]*?)\`\`\``,
  "g"
);

const ACTIVE_PLAN_STATUSES = new Set<HarnessFeatureSprintStatus>([
  "planning",
  "in_progress",
  "reviewing"
]);

const REVIEW_STATUSES = new Set<HarnessFeatureSprintReviewStatus>([
  "pending",
  "accepted",
  "needs_changes",
  "blocked"
]);

const DEFAULT_VERIFY_COMMANDS = ["npm run typecheck", "npm test"];

const SCOPING_NON_GOALS = [
  "Codex/Cursor CLI runner",
  "PC/browser automation",
  "automatic ChatGPT web control",
  "parallel agent execution",
  "autonomous state mutation",
  "GitHub integration",
  "ai-gateway changes",
  "Raw Lab changes"
] as const;

export type FeatureSprintPlanResult =
  | { ok: true; state: LifeHarnessData; planId: string }
  | { ok: false; error: string };

export type FeaturePacketBuildResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

export type FeatureSprintPlanStepImport = {
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  suggestedPrompt?: string;
};

export type FeatureSprintPlanImport = {
  title: string;
  goal: string;
  whyNow?: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  constraints: string[];
  steps: FeatureSprintPlanStepImport[];
};

export type FeatureReviewVerdictImport = {
  status: HarnessFeatureSprintReviewStatus;
  verdict: string;
  nextPrompt?: string;
  followUps?: string[];
};

export type FeatureSprintPlanCreateInput = {
  cardId: string;
  title: string;
  goal: string;
  whyNow?: string;
  acceptanceCriteria: string[];
  nonGoals?: string[];
  constraints?: string[];
  steps?: FeatureSprintPlanStepImport[];
  allowEmptyAcceptanceCriteria?: boolean;
};

export type FeatureSprintPlanUpdateInput = Partial<
  Omit<HarnessFeatureSprintPlan, "id" | "cardId" | "createdAt" | "steps">
> & {
  steps?: HarnessFeatureSprintStep[];
};

export type FeatureSprintStepUpdateInput = Partial<
  Omit<HarnessFeatureSprintStep, "id" | "createdAt">
>;

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function resolveNow(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function findPlan(data: LifeHarnessData, planId: string): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((plan) => plan.id === planId);
}

function replacePlan(
  data: LifeHarnessData,
  plan: HarnessFeatureSprintPlan
): LifeHarnessData {
  return {
    ...data,
    featureSprintPlans: data.featureSprintPlans.map((item) =>
      item.id === plan.id ? plan : item
    )
  };
}

function validateCard(data: LifeHarnessData, cardId: string): LifeCard | { error: string } {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) {
    return { error: `Card not found: ${cardId}` };
  }
  if (!shouldIncludeCard(card)) {
    return { error: "S3 cards cannot use feature sprint orchestration." };
  }
  return card;
}

function validatePlanScalars(
  title: string,
  goal: string,
  acceptanceCriteria: string[],
  allowEmptyAcceptanceCriteria = false
): string | undefined {
  if (!title.trim()) {
    return "Plan title is required.";
  }
  if (!goal.trim()) {
    return "Plan goal is required.";
  }
  if (!allowEmptyAcceptanceCriteria && cleanStringList(acceptanceCriteria).length === 0) {
    return "At least one acceptance criterion is required.";
  }
  return undefined;
}

function buildStepsFromImport(
  imports: FeatureSprintPlanStepImport[],
  now: string
): HarnessFeatureSprintStep[] {
  return imports.map((step, index) => ({
    id: createId("feature_step"),
    title: step.title.trim(),
    goal: step.goal.trim(),
    status: (index === 0 ? "ready" : "planned") as HarnessFeatureSprintStepStatus,
    acceptanceCriteria: cleanStringList(step.acceptanceCriteria),
    suggestedPrompt: cleanOptional(step.suggestedPrompt),
    createdAt: now,
    updatedAt: now
  }));
}

export function planAlreadyHasEvidence(plan: HarnessFeatureSprintPlan): boolean {
  return !!(plan.evidenceLogId || plan.evidenceProofItemId);
}

export function getFeatureSprintPlansForCard(
  data: LifeHarnessData,
  cardId: string
): HarnessFeatureSprintPlan[] {
  return data.featureSprintPlans
    .filter((plan) => plan.cardId === cardId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getActiveFeatureSprintPlanForCard(
  data: LifeHarnessData,
  cardId: string
): HarnessFeatureSprintPlan | undefined {
  return getFeatureSprintPlansForCard(data, cardId).find((plan) =>
    ACTIVE_PLAN_STATUSES.has(plan.status)
  );
}

export function createFeatureSprintPlanForCard(
  data: LifeHarnessData,
  input: FeatureSprintPlanCreateInput,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const cardResult = validateCard(data, input.cardId);
  if ("error" in cardResult) {
    return { ok: false, error: cardResult.error };
  }

  const title = input.title.trim();
  const goal = input.goal.trim();
  const acceptanceCriteria = cleanStringList(input.acceptanceCriteria);
  const scalarError = validatePlanScalars(
    title,
    goal,
    acceptanceCriteria,
    input.allowEmptyAcceptanceCriteria
  );
  if (scalarError) {
    return { ok: false, error: scalarError };
  }

  const timestamp = resolveNow(now);
  const steps = input.steps?.length
    ? buildStepsFromImport(input.steps, timestamp)
    : [];

  for (const step of steps) {
    if (!step.title || !step.goal || step.acceptanceCriteria.length === 0) {
      return { ok: false, error: "Each step requires title, goal, and acceptance criteria." };
    }
  }

  const plan: HarnessFeatureSprintPlan = {
    id: createId("feature_sprint"),
    cardId: input.cardId,
    projectId: getProjectForCard(data, input.cardId)?.id,
    title,
    goal,
    status: steps.length > 0 ? "in_progress" : "planning",
    whyNow: cleanOptional(input.whyNow),
    acceptanceCriteria,
    nonGoals: cleanStringList(input.nonGoals),
    constraints: cleanStringList(input.constraints),
    steps,
    currentStepId: steps[0]?.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    ok: true,
    planId: plan.id,
    state: {
      ...data,
      featureSprintPlans: [plan, ...data.featureSprintPlans]
    }
  };
}

export function updateFeatureSprintPlan(
  data: LifeHarnessData,
  planId: string,
  patch: FeatureSprintPlanUpdateInput,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const existing = findPlan(data, planId);
  if (!existing) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const title = patch.title !== undefined ? patch.title.trim() : existing.title;
  const goal = patch.goal !== undefined ? patch.goal.trim() : existing.goal;
  const acceptanceCriteria =
    patch.acceptanceCriteria !== undefined
      ? cleanStringList(patch.acceptanceCriteria)
      : existing.acceptanceCriteria;
  const scalarError = validatePlanScalars(title, goal, acceptanceCriteria);
  if (scalarError) {
    return { ok: false, error: scalarError };
  }

  const timestamp = resolveNow(now);
  const updated: HarnessFeatureSprintPlan = {
    ...existing,
    title,
    goal,
    status: patch.status ?? existing.status,
    whyNow: patch.whyNow !== undefined ? cleanOptional(patch.whyNow) : existing.whyNow,
    acceptanceCriteria,
    nonGoals:
      patch.nonGoals !== undefined ? cleanStringList(patch.nonGoals) : existing.nonGoals,
    constraints:
      patch.constraints !== undefined ? cleanStringList(patch.constraints) : existing.constraints,
    steps: patch.steps ?? existing.steps,
    currentStepId:
      patch.currentStepId !== undefined ? patch.currentStepId : existing.currentStepId,
    latestReviewVerdict:
      patch.latestReviewVerdict !== undefined
        ? cleanOptional(patch.latestReviewVerdict)
        : existing.latestReviewVerdict,
    latestReviewStatus: patch.latestReviewStatus ?? existing.latestReviewStatus,
    completedAt: patch.completedAt ?? existing.completedAt,
    evidenceLogId: patch.evidenceLogId ?? existing.evidenceLogId,
    evidenceProofItemId: patch.evidenceProofItemId ?? existing.evidenceProofItemId,
    updatedAt: timestamp
  };

  return {
    ok: true,
    planId,
    state: replacePlan(data, updated)
  };
}

export function updateFeatureSprintStep(
  data: LifeHarnessData,
  planId: string,
  stepId: string,
  patch: FeatureSprintStepUpdateInput,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const existing = findPlan(data, planId);
  if (!existing) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const stepIndex = existing.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) {
    return { ok: false, error: `Step not found: ${stepId}` };
  }

  const current = existing.steps[stepIndex];
  const timestamp = resolveNow(now);
  let nextStatus = patch.status ?? current.status;

  if (patch.outputSummary !== undefined && cleanOptional(patch.outputSummary) && current.status === "ready") {
    nextStatus = patch.status ?? "sent";
  }

  if (patch.reviewStatus !== undefined || patch.reviewVerdict !== undefined) {
    nextStatus = patch.status ?? "reviewing";
  }

  const updatedStep: HarnessFeatureSprintStep = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    goal: patch.goal !== undefined ? patch.goal.trim() : current.goal,
    status: nextStatus,
    acceptanceCriteria:
      patch.acceptanceCriteria !== undefined
        ? cleanStringList(patch.acceptanceCriteria)
        : current.acceptanceCriteria,
    suggestedPrompt:
      patch.suggestedPrompt !== undefined
        ? cleanOptional(patch.suggestedPrompt)
        : current.suggestedPrompt,
    agentSessionId: patch.agentSessionId ?? current.agentSessionId,
    outputSummary:
      patch.outputSummary !== undefined
        ? cleanOptional(patch.outputSummary)
        : current.outputSummary,
    reviewVerdict:
      patch.reviewVerdict !== undefined
        ? cleanOptional(patch.reviewVerdict)
        : current.reviewVerdict,
    reviewStatus: patch.reviewStatus ?? current.reviewStatus,
    completedAt: patch.completedAt ?? current.completedAt,
    updatedAt: timestamp
  };

  const steps = [...existing.steps];
  steps[stepIndex] = updatedStep;

  return updateFeatureSprintPlan(data, planId, { steps }, now);
}

export function advanceFeatureSprintStep(
  data: LifeHarnessData,
  planId: string,
  stepId: string,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const existing = findPlan(data, planId);
  if (!existing) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const stepIndex = existing.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) {
    return { ok: false, error: `Step not found: ${stepId}` };
  }

  const timestamp = resolveNow(now);
  const steps = existing.steps.map((step, index) => {
    if (index === stepIndex) {
      return {
        ...step,
        status: "done" as const,
        completedAt: timestamp,
        updatedAt: timestamp
      };
    }
    return step;
  });

  const nextIndex = steps.findIndex(
    (step, index) =>
      index > stepIndex &&
      (step.status === "planned" || step.status === "ready" || step.status === "blocked")
  );

  let planStatus: HarnessFeatureSprintStatus = "in_progress";
  let currentStepId = existing.currentStepId;

  if (nextIndex >= 0) {
    steps[nextIndex] = {
      ...steps[nextIndex],
      status: "ready",
      updatedAt: timestamp
    };
    currentStepId = steps[nextIndex].id;
  } else {
    planStatus = "reviewing";
    currentStepId = undefined;
  }

  return updateFeatureSprintPlan(data, planId, {
    steps,
    status: planStatus,
    currentStepId
  }, now);
}

function createFeatureSprintLog(input: {
  rawText: string;
  area: LifeCard["area"];
  cardId: string;
  proofItemId?: string;
}): LifeLogEntry {
  return {
    id: createId("log"),
    timestamp: nowIso(),
    rawText: input.rawText,
    area: input.area,
    cardId: input.cardId,
    type: "win",
    xp: computeXP("win"),
    proofItemId: input.proofItemId
  };
}

export function buildFeatureSprintProofSummary(plan: HarnessFeatureSprintPlan, proofText?: string): {
  proofTitle: string;
  logText: string;
} {
  const proofTitle = `Feature sprint: ${plan.title}`;
  const details = [proofTitle, plan.goal];
  if (proofText?.trim()) {
    details.push(proofText.trim());
  }
  return {
    proofTitle,
    logText: details.join(" — ")
  };
}

export function completeFeatureSprintPlan(
  data: LifeHarnessData,
  planId: string,
  input: { proofText?: string } = {},
  now: Date = new Date()
): FeatureSprintPlanResult {
  const existing = findPlan(data, planId);
  if (!existing) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const hadEvidence = planAlreadyHasEvidence(existing);
  const timestamp = resolveNow(now);

  let nextState = replacePlan(data, {
    ...existing,
    status: "done",
    completedAt: existing.completedAt ?? timestamp,
    latestReviewVerdict:
      input.proofText?.trim() ?? existing.latestReviewVerdict,
    updatedAt: timestamp
  });

  if (hadEvidence) {
    return { ok: true, planId, state: nextState };
  }

  const card = nextState.cards.find((item) => item.id === existing.cardId);
  if (!card) {
    return { ok: true, planId, state: nextState };
  }

  const { proofTitle, logText } = buildFeatureSprintProofSummary(existing, input.proofText);
  const log = createFeatureSprintLog({
    rawText: logText,
    area: card.area,
    cardId: card.id
  });
  const proof = createProofItem({
    title: proofTitle,
    area: card.area,
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;

  const completedPlan = findPlan(nextState, planId);
  if (!completedPlan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  nextState = replacePlan(nextState, {
    ...completedPlan,
    evidenceLogId: log.id,
    evidenceProofItemId: proof.id
  });

  return {
    ok: true,
    planId,
    state: {
      ...nextState,
      logs: [log, ...nextState.logs],
      proofItems: [proof, ...nextState.proofItems]
    }
  };
}

export function deleteFeatureSprintPlan(
  data: LifeHarnessData,
  planId: string
): FeatureSprintPlanResult {
  const existing = findPlan(data, planId);
  if (!existing) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  return {
    ok: true,
    planId,
    state: {
      ...data,
      featureSprintPlans: data.featureSprintPlans.filter((plan) => plan.id !== planId)
    }
  };
}

export function replaceActiveFeatureSprintPlanFromImport(
  data: LifeHarnessData,
  cardId: string,
  imported: FeatureSprintPlanImport,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const active = getActiveFeatureSprintPlanForCard(data, cardId);
  const timestamp = resolveNow(now);
  const steps = buildStepsFromImport(imported.steps, timestamp);

  if (active) {
    return updateFeatureSprintPlan(data, active.id, {
      title: imported.title.trim(),
      goal: imported.goal.trim(),
      whyNow: cleanOptional(imported.whyNow),
      acceptanceCriteria: cleanStringList(imported.acceptanceCriteria),
      nonGoals: cleanStringList(imported.nonGoals),
      constraints: cleanStringList(imported.constraints),
      steps,
      currentStepId: steps[0]?.id,
      status: "in_progress"
    }, now);
  }

  return createFeatureSprintPlanForCard(data, {
    cardId,
    title: imported.title,
    goal: imported.goal,
    whyNow: imported.whyNow,
    acceptanceCriteria: imported.acceptanceCriteria,
    nonGoals: imported.nonGoals,
    constraints: imported.constraints,
    steps: imported.steps
  }, now);
}

export function importFeatureSprintPlanFromText(
  data: LifeHarnessData,
  cardId: string,
  text: string,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const imported = parseFeatureSprintPlanBlock(text);
  if (!imported) {
    return { ok: false, error: "No valid feature-sprint-plan block found." };
  }
  return replaceActiveFeatureSprintPlanFromImport(data, cardId, imported, now);
}

function formatFollowUpsInVerdict(verdict: string, followUps?: string[]): string {
  const cleaned = cleanStringList(followUps ?? []);
  if (cleaned.length === 0) {
    return verdict;
  }
  const bullets = cleaned.map((item) => `- ${item}`).join("\n");
  return `${verdict.trim()}\n\nFollow-ups:\n${bullets}`;
}

export function importFeatureReviewVerdictFromText(
  data: LifeHarnessData,
  planId: string,
  text: string,
  stepId?: string,
  now: Date = new Date()
): FeatureSprintPlanResult {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const verdictImport = parseFeatureReviewVerdictBlock(text);
  if (!verdictImport) {
    return { ok: false, error: "No valid feature-review-verdict block found." };
  }

  const resolvedStepId = stepId ?? plan.currentStepId;
  if (!resolvedStepId) {
    return { ok: false, error: "No current step to attach review verdict." };
  }

  const reviewVerdict = formatFollowUpsInVerdict(
    verdictImport.verdict,
    verdictImport.followUps
  );

  const stepResult = updateFeatureSprintStep(
    data,
    planId,
    resolvedStepId,
    {
      reviewStatus: verdictImport.status,
      reviewVerdict,
      suggestedPrompt: verdictImport.nextPrompt?.trim() || undefined,
      status: "reviewing"
    },
    now
  );

  if (!stepResult.ok) {
    return stepResult;
  }

  return updateFeatureSprintPlan(stepResult.state, planId, {
    latestReviewStatus: verdictImport.status,
    latestReviewVerdict: reviewVerdict
  }, now);
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const cleaned = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseStepImport(value: unknown): FeatureSprintPlanStepImport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const goal = typeof item.goal === "string" ? item.goal.trim() : "";
  const acceptanceCriteria = parseStringList(item.acceptanceCriteria) ?? [];
  if (!title || !goal || acceptanceCriteria.length === 0) {
    return undefined;
  }
  return {
    title,
    goal,
    acceptanceCriteria,
    suggestedPrompt:
      typeof item.suggestedPrompt === "string" ? item.suggestedPrompt.trim() : undefined
  };
}

export function parseFeatureSprintPlanBlock(text: string): FeatureSprintPlanImport | undefined {
  const pattern = new RegExp(FEATURE_SPRINT_PLAN_FENCE.source, "g");
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        match = pattern.exec(text);
        continue;
      }
      const item = parsed as Record<string, unknown>;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const goal = typeof item.goal === "string" ? item.goal.trim() : "";
      const acceptanceCriteria = parseStringList(item.acceptanceCriteria) ?? [];
      if (!title || !goal || acceptanceCriteria.length === 0) {
        return undefined;
      }
      if (!Array.isArray(item.steps) || item.steps.length === 0) {
        return undefined;
      }
      const steps: FeatureSprintPlanStepImport[] = [];
      for (const step of item.steps) {
        const parsedStep = parseStepImport(step);
        if (!parsedStep) {
          return undefined;
        }
        steps.push(parsedStep);
      }
      return {
        title,
        goal,
        whyNow: typeof item.whyNow === "string" ? item.whyNow.trim() : undefined,
        acceptanceCriteria,
        nonGoals: parseStringList(item.nonGoals) ?? [],
        constraints: parseStringList(item.constraints) ?? [],
        steps
      };
    } catch {
      // ignore invalid JSON
    }
    match = pattern.exec(text);
  }
  return undefined;
}

export function parseFeatureReviewVerdictBlock(text: string): FeatureReviewVerdictImport | undefined {
  const pattern = new RegExp(FEATURE_REVIEW_VERDICT_FENCE.source, "g");
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        match = pattern.exec(text);
        continue;
      }
      const item = parsed as Record<string, unknown>;
      const status = typeof item.status === "string" ? item.status.trim() : "";
      const verdict = typeof item.verdict === "string" ? item.verdict.trim() : "";
      if (!REVIEW_STATUSES.has(status as HarnessFeatureSprintReviewStatus) || status === "pending" || !verdict) {
        match = pattern.exec(text);
        continue;
      }
      return {
        status: status as HarnessFeatureSprintReviewStatus,
        verdict,
        nextPrompt: typeof item.nextPrompt === "string" ? item.nextPrompt.trim() : undefined,
        followUps: parseStringList(item.followUps)
      };
    } catch {
      // ignore invalid JSON
    }
    match = pattern.exec(text);
  }
  return undefined;
}

export function stripFeatureSprintBlocks(text: string): string {
  return text
    .replace(FEATURE_SPRINT_PLAN_FENCE, "")
    .replace(FEATURE_REVIEW_VERDICT_FENCE, "")
    .trim();
}

function formatBulletSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return [title, "- (none)", ""];
  }
  return [title, ...lines.map((line) => `- ${line}`), ""];
}

export function buildFeatureScopingPacket(
  data: LifeHarnessData,
  cardId: string,
  options: { now?: Date } = {}
): FeaturePacketBuildResult {
  const cardResult = buildCardContextPacket(data, cardId, options);
  if (!cardResult.ok) {
    return { ok: false, error: cardResult.error };
  }

  const cardPacket = cardResult.packet;
  const lifeCard = data.cards.find((item) => item.id === cardId);
  const cardContextMarkdown = formatCardContextPacketMarkdown(cardPacket);
  const project = buildProjectContextForCard(data, cardId);
  const nextMove = buildNextMoveSummary(data, options);
  const isNextMoveCard =
    nextMove.primary?.cardId === cardId || nextMove.backup?.cardId === cardId;
  const verifyCommands =
    project?.verificationCommands?.length ? project.verificationCommands : DEFAULT_VERIFY_COMMANDS;

  const lines: string[] = [
    "# Feature Scoping Packet",
    "",
    "## Purpose",
    "Ask ChatGPT or Codex (high/xhigh reasoning) to scope this feature for a solo-builder OS.",
    "Return prose plus a fenced `feature-sprint-plan` JSON block.",
    "",
    "## Card summary",
    `- Title: ${cardPacket.title}`,
    `- Status: ${cardPacket.status}`,
    `- Next tiny action: ${cardPacket.nextTinyAction}`
  ];

  if (lifeCard) {
    lines.push(`- Do lane: ${lifeCard.doLane}`, `- Improve lane: ${lifeCard.improveLane}`);
  }
  lines.push("");

  if (project) {
    lines.push("## Project metadata");
    if (project.repoPath) {
      lines.push(`- Repo: ${project.repoPath}`);
    }
    if (project.branch) {
      lines.push(`- Branch: ${project.branch}`);
    }
    if (project.docs.length > 0) {
      lines.push(`- Docs: ${project.docs.join("; ")}`);
    }
    if (project.likelyFiles.length > 0) {
      lines.push(`- Likely files: ${project.likelyFiles.join("; ")}`);
    }
    if (project.verificationCommands.length > 0) {
      lines.push(`- Verification: ${project.verificationCommands.join("; ")}`);
    }
    if (project.notes) {
      lines.push(`- Notes: ${project.notes}`);
    }
    lines.push("");
  }

  if (isNextMoveCard) {
    const contract = nextMove.primary?.cardId === cardId ? nextMove.primary : nextMove.backup;
    if (contract) {
      lines.push(
        "## Next move context",
        `- Title: ${contract.title}`,
        `- Why now: ${contract.whyNow}`,
        `- Do action: ${contract.doAction}`,
        ""
      );
    }
  }

  lines.push(
    "## Existing context",
    cardContextMarkdown,
    "",
    ...formatBulletSection("## Non-goals for this sprint", [...SCOPING_NON_GOALS]),
    ...formatBulletSection("## Verification expectations", verifyCommands),
    "## Required output format",
    "Return:",
    "1. Short prose plan",
    "2. A fenced JSON block labeled `feature-sprint-plan`",
    "",
    "```feature-sprint-plan",
    JSON.stringify(
      {
        title: "...",
        goal: "...",
        whyNow: "...",
        acceptanceCriteria: ["..."],
        nonGoals: ["..."],
        constraints: ["..."],
        steps: [
          {
            title: "...",
            goal: "...",
            acceptanceCriteria: ["..."],
            suggestedPrompt: "..."
          }
        ]
      },
      null,
      2
    ),
    "```"
  );

  return { ok: true, markdown: lines.join("\n").trimEnd() };
}

function resolvePlanStep(
  plan: HarnessFeatureSprintPlan,
  stepId?: string
): HarnessFeatureSprintStep | undefined {
  const resolvedId = stepId ?? plan.currentStepId;
  if (!resolvedId) {
    return undefined;
  }
  return plan.steps.find((step) => step.id === resolvedId);
}

export function buildFeatureStepImplementationPacket(
  data: LifeHarnessData,
  planId: string,
  stepId?: string,
  options: { now?: Date } = {}
): FeaturePacketBuildResult {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const step = resolvePlanStep(plan, stepId);
  if (!step) {
    return { ok: false, error: "No current step resolved for implementation packet." };
  }

  const cardResult = buildCardContextPacket(data, plan.cardId, options);
  if (!cardResult.ok) {
    return { ok: false, error: cardResult.error };
  }

  const project = buildProjectContextForCard(data, plan.cardId);
  const cardContextMarkdown = formatCardContextPacketMarkdown(cardResult.packet);
  const verifyCommands =
    project?.verificationCommands?.length ? project.verificationCommands : DEFAULT_VERIFY_COMMANDS;

  const lines: string[] = [
    `# Feature Step Implementation Packet — ${step.title}`,
    "",
    "## Feature",
    `- Title: ${plan.title}`,
    `- Goal: ${plan.goal}`,
    "",
    "## Current step",
    `- Title: ${step.title}`,
    `- Goal: ${step.goal}`,
    "",
    ...formatBulletSection("## Step acceptance criteria", step.acceptanceCriteria),
    ...formatBulletSection("## Feature non-goals", plan.nonGoals),
    ...formatBulletSection("## Feature constraints", plan.constraints)
  ];

  if (project) {
    lines.push("## Project");
    if (project.repoPath) {
      lines.push(`- Repo: ${project.repoPath}`);
    }
    if (project.branch) {
      lines.push(`- Branch: ${project.branch}`);
    }
    lines.push(
      ...formatBulletSection("## Likely files", project.likelyFiles),
      ...formatBulletSection("## Verification commands", verifyCommands)
    );
  } else {
    lines.push(...formatBulletSection("## Verification commands", verifyCommands));
  }

  lines.push("## Card context", cardContextMarkdown, "");

  if (step.suggestedPrompt) {
    lines.push("## Suggested implementation prompt", step.suggestedPrompt, "");
  }

  lines.push(
    "## Expected final response",
    "- Files changed",
    "- Behavior implemented",
    "- Tests run",
    "- Failures/skips",
    "- Dirty worktree notes",
    "- Concise summary for review"
  );

  return { ok: true, markdown: lines.join("\n").trimEnd() };
}

export function buildFeatureStepReviewPacket(
  data: LifeHarnessData,
  planId: string,
  stepId?: string,
  agentOutput?: string,
  options: { now?: Date } = {}
): FeaturePacketBuildResult {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const step = resolvePlanStep(plan, stepId);
  if (!step) {
    return { ok: false, error: "No current step resolved for review packet." };
  }

  const output = agentOutput?.trim() || step.outputSummary?.trim() || "(not provided)";
  const session = step.agentSessionId
    ? data.agentSessions.find((item) => item.id === step.agentSessionId)
    : undefined;
  const project = buildProjectContextForCard(data, plan.cardId);
  const verifyCommands =
    project?.verificationCommands?.length ? project.verificationCommands : DEFAULT_VERIFY_COMMANDS;

  const lines: string[] = [
    `# Feature Step Review Packet — ${step.title}`,
    "",
    "## Feature plan",
    `- Title: ${plan.title}`,
    `- Goal: ${plan.goal}`,
    "",
    "## Current step",
    `- Title: ${step.title}`,
    `- Goal: ${step.goal}`,
    "",
    ...formatBulletSection("## Step acceptance criteria", step.acceptanceCriteria),
    ...formatBulletSection("## Feature non-goals", plan.nonGoals),
    "## Implementation agent output",
    output,
    ""
  ];

  if (session) {
    lines.push(
      "## Linked agent session",
      `- Agent: ${session.agent}`,
      `- Task: ${session.taskName}`,
      `- Status: ${session.status}`,
      session.resultSummary ? `- Result: ${session.resultSummary}` : "- Result: (not logged)",
      ""
    );
  }

  lines.push(
    ...formatBulletSection("## Verification commands", verifyCommands),
    "## Review request",
    "Return a verdict: accepted, needs_changes, or blocked.",
    "Call out scope creep or missing tests.",
    "If changes are needed, include a next implementation prompt.",
    "",
    "## Optional fenced verdict block",
    "```feature-review-verdict",
    JSON.stringify(
      {
        status: "accepted",
        verdict: "...",
        nextPrompt: "...",
        followUps: ["..."]
      },
      null,
      2
    ),
    "```"
  );

  return { ok: true, markdown: lines.join("\n").trimEnd() };
}

export function applyCreateFeatureSprintPlanForCard(
  state: LifeHarnessData,
  input: FeatureSprintPlanCreateInput,
  now?: Date
): LifeHarnessData {
  const result = createFeatureSprintPlanForCard(state, input, now);
  return result.ok ? result.state : state;
}

export function applyUpdateFeatureSprintPlan(
  state: LifeHarnessData,
  planId: string,
  patch: FeatureSprintPlanUpdateInput,
  now?: Date
): LifeHarnessData {
  const result = updateFeatureSprintPlan(state, planId, patch, now);
  return result.ok ? result.state : state;
}

export function applyUpdateFeatureSprintStep(
  state: LifeHarnessData,
  planId: string,
  stepId: string,
  patch: FeatureSprintStepUpdateInput,
  now?: Date
): LifeHarnessData {
  const result = updateFeatureSprintStep(state, planId, stepId, patch, now);
  return result.ok ? result.state : state;
}

export function applyAdvanceFeatureSprintStep(
  state: LifeHarnessData,
  planId: string,
  stepId: string,
  now?: Date
): LifeHarnessData {
  const result = advanceFeatureSprintStep(state, planId, stepId, now);
  return result.ok ? result.state : state;
}

export function applyCompleteFeatureSprintPlan(
  state: LifeHarnessData,
  planId: string,
  input?: { proofText?: string },
  now?: Date
): LifeHarnessData {
  const result = completeFeatureSprintPlan(state, planId, input, now);
  return result.ok ? result.state : state;
}

export function applyDeleteFeatureSprintPlan(
  state: LifeHarnessData,
  planId: string
): LifeHarnessData {
  const result = deleteFeatureSprintPlan(state, planId);
  return result.ok ? result.state : state;
}
