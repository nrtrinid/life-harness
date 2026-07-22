import type {
  HarnessFeatureSprintClarificationQuestion,
  HarnessFeatureSprintClarifiedSpec,
  HarnessFeatureSprintClarifiedSpecStatus,
  HarnessFeatureSprintPlan
} from "./types";

const MATERIAL_SIDE_EFFECT_MARKERS = [
  "schema",
  "authentication",
  "auth",
  "scheduler",
  "deployment",
  "deploy",
  "destructive",
  "side_effect",
  "external"
] as const;

function cleanText(value: string | undefined): string {
  return (value ?? "").trim();
}

function cleanList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function normalizeQuestion(
  question: HarnessFeatureSprintClarificationQuestion
): HarnessFeatureSprintClarificationQuestion | undefined {
  const id = cleanText(question.id);
  const text = cleanText(question.question);
  if (!id || !text) {
    return undefined;
  }
  const status =
    question.status === "answered" || question.status === "waived" || question.status === "open"
      ? question.status
      : "open";
  const answer = cleanText(question.answer);
  return {
    id,
    question: text,
    status,
    ...(answer ? { answer } : {}),
    ...(question.required === false ? { required: false } : { required: true })
  };
}

export function normalizeClarifiedSpec(
  raw: HarnessFeatureSprintClarifiedSpec | undefined
): HarnessFeatureSprintClarifiedSpec | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const revision =
    typeof raw.revision === "number" && Number.isFinite(raw.revision) && raw.revision >= 1
      ? Math.floor(raw.revision)
      : 1;
  const status: HarnessFeatureSprintClarifiedSpecStatus =
    raw.status === "draft" ||
    raw.status === "clarifying" ||
    raw.status === "approved" ||
    raw.status === "frozen" ||
    raw.status === "revision_required"
      ? raw.status
      : "draft";

  const clarificationQuestions = (raw.clarificationQuestions ?? [])
    .map(normalizeQuestion)
    .filter((item): item is HarnessFeatureSprintClarificationQuestion => Boolean(item));

  return {
    revision,
    status,
    objective: cleanText(raw.objective),
    userIntent: cleanText(raw.userIntent),
    assumptions: cleanList(raw.assumptions),
    constraints: cleanList(raw.constraints),
    nonGoals: cleanList(raw.nonGoals),
    acceptanceCriteria: cleanList(raw.acceptanceCriteria),
    clarificationQuestions,
    ...(raw.riskNotes ? { riskNotes: cleanList(raw.riskNotes) } : {}),
    ...(raw.sideEffectFlags ? { sideEffectFlags: cleanList(raw.sideEffectFlags) } : {}),
    ...(cleanText(raw.approvedAt) ? { approvedAt: cleanText(raw.approvedAt) } : {}),
    ...(cleanText(raw.frozenAt) ? { frozenAt: cleanText(raw.frozenAt) } : {}),
    ...(typeof raw.supersedesRevision === "number" && Number.isFinite(raw.supersedesRevision)
      ? { supersedesRevision: Math.floor(raw.supersedesRevision) }
      : {}),
    ...(cleanText(raw.updatedAt) ? { updatedAt: cleanText(raw.updatedAt) } : {})
  };
}

export function listOpenRequiredClarifications(
  spec: HarnessFeatureSprintClarifiedSpec | undefined
): HarnessFeatureSprintClarificationQuestion[] {
  if (!spec) {
    return [];
  }
  return spec.clarificationQuestions.filter(
    (question) => question.required !== false && question.status === "open"
  );
}

export function canApproveClarifiedSpec(spec: HarnessFeatureSprintClarifiedSpec | undefined): {
  ok: boolean;
  unmetPreconditions: string[];
} {
  const unmet: string[] = [];
  if (!spec) {
    return { ok: false, unmetPreconditions: ["Clarified spec is missing."] };
  }
  if (!spec.objective.trim()) {
    unmet.push("Objective is required.");
  }
  if (!spec.userIntent.trim()) {
    unmet.push("User intent is required.");
  }
  if (spec.acceptanceCriteria.length === 0) {
    unmet.push("At least one acceptance criterion is required.");
  }
  const open = listOpenRequiredClarifications(spec);
  if (open.length > 0) {
    unmet.push(`Open required clarification(s): ${open.map((item) => item.id).join(", ")}.`);
  }
  if (spec.status === "frozen") {
    unmet.push("Frozen specs cannot be approved again; request a revision first.");
  }
  // draft / clarifying / revision_required / approved may proceed when content gates pass.
  // revision_required is the editable post-material-revision state awaiting approve → freeze.
  return { ok: unmet.length === 0, unmetPreconditions: unmet };
}

export function canFreezeClarifiedSpec(spec: HarnessFeatureSprintClarifiedSpec | undefined): {
  ok: boolean;
  unmetPreconditions: string[];
} {
  if (!spec) {
    return { ok: false, unmetPreconditions: ["Clarified spec is missing."] };
  }
  if (spec.status === "frozen") {
    return { ok: true, unmetPreconditions: [] };
  }
  if (spec.status !== "approved") {
    return {
      ok: false,
      unmetPreconditions: ["Spec must be approved before freeze."]
    };
  }
  const unmet: string[] = [];
  if (!spec.objective.trim()) {
    unmet.push("Objective is required.");
  }
  if (!spec.userIntent.trim()) {
    unmet.push("User intent is required.");
  }
  if (spec.acceptanceCriteria.length === 0) {
    unmet.push("At least one acceptance criterion is required.");
  }
  const open = listOpenRequiredClarifications(spec);
  if (open.length > 0) {
    unmet.push(`Open required clarification(s): ${open.map((item) => item.id).join(", ")}.`);
  }
  return { ok: unmet.length === 0, unmetPreconditions: unmet };
}

export type MaterialChangeClassification = {
  material: boolean;
  reasons: string[];
  uncertain: boolean;
};

function sortedJoin(items: string[]): string {
  return [...items].map((item) => item.trim()).filter(Boolean).sort().join("\n");
}

/**
 * Deterministic material-change rule. Uncertain → treat as material (require revision).
 * LLMs must not be the sole authority for non-material classification.
 */
export function classifyClarifiedSpecMaterialChange(
  previous: HarnessFeatureSprintClarifiedSpec,
  next: Omit<HarnessFeatureSprintClarifiedSpec, "revision" | "status" | "approvedAt" | "frozenAt" | "supersedesRevision">
): MaterialChangeClassification {
  const reasons: string[] = [];

  if (cleanText(previous.objective) !== cleanText(next.objective)) {
    reasons.push("Objective changed.");
  }
  if (sortedJoin(previous.acceptanceCriteria) !== sortedJoin(next.acceptanceCriteria)) {
    reasons.push("Acceptance criteria changed.");
  }
  if (sortedJoin(previous.nonGoals) !== sortedJoin(next.nonGoals)) {
    reasons.push("Non-goals / forbidden scope changed.");
  }
  if (sortedJoin(previous.constraints) !== sortedJoin(next.constraints)) {
    reasons.push("Constraints changed.");
  }

  const prevFlags = cleanList(previous.sideEffectFlags);
  const nextFlags = cleanList(next.sideEffectFlags);
  if (sortedJoin(prevFlags) !== sortedJoin(nextFlags)) {
    reasons.push("Side-effect / external flags changed.");
  }

  const prevRisk = cleanList(previous.riskNotes);
  const nextRisk = cleanList(next.riskNotes);
  if (sortedJoin(prevRisk) !== sortedJoin(nextRisk)) {
    reasons.push("Risk notes changed.");
  }

  const markerHit = [...nextFlags, ...nextRisk, cleanText(next.objective), ...next.acceptanceCriteria]
    .join(" ")
    .toLowerCase();
  for (const marker of MATERIAL_SIDE_EFFECT_MARKERS) {
    const previouslyHad = [...prevFlags, ...prevRisk, previous.objective, ...previous.acceptanceCriteria]
      .join(" ")
      .toLowerCase()
      .includes(marker);
    const nowHas = markerHit.includes(marker);
    if (nowHas && !previouslyHad) {
      reasons.push(`New ${marker}-related requirement detected.`);
    }
  }

  // Assumptions-only changes: if wording differs but no other material field changed, mark uncertain.
  const assumptionsChanged =
    sortedJoin(previous.assumptions) !== sortedJoin(next.assumptions);
  const intentChanged = cleanText(previous.userIntent) !== cleanText(next.userIntent);

  if (reasons.length > 0) {
    return { material: true, reasons, uncertain: false };
  }

  if (assumptionsChanged || intentChanged) {
    return {
      material: true,
      reasons: [
        "Wording/assumption/intent change could alter requirements; require a new revision or human hold."
      ],
      uncertain: true
    };
  }

  return { material: false, reasons: [], uncertain: false };
}

export function createDraftClarifiedSpec(input: {
  objective: string;
  userIntent: string;
  assumptions?: string[];
  constraints?: string[];
  nonGoals?: string[];
  acceptanceCriteria: string[];
  clarificationQuestions?: HarnessFeatureSprintClarificationQuestion[];
  riskNotes?: string[];
  sideEffectFlags?: string[];
  now?: string;
}): HarnessFeatureSprintClarifiedSpec {
  const openQuestions = (input.clarificationQuestions ?? []).some(
    (question) => question.required !== false && question.status === "open"
  );
  return normalizeClarifiedSpec({
    revision: 1,
    status: openQuestions ? "clarifying" : "draft",
    objective: input.objective,
    userIntent: input.userIntent,
    assumptions: input.assumptions ?? [],
    constraints: input.constraints ?? [],
    nonGoals: input.nonGoals ?? [],
    acceptanceCriteria: input.acceptanceCriteria,
    clarificationQuestions: input.clarificationQuestions ?? [],
    riskNotes: input.riskNotes,
    sideEffectFlags: input.sideEffectFlags,
    updatedAt: input.now
  })!;
}

export function getFrozenClarifiedSpec(
  plan: Pick<HarnessFeatureSprintPlan, "clarifiedSpec"> | null | undefined
): HarnessFeatureSprintClarifiedSpec | undefined {
  const spec = plan?.clarifiedSpec;
  if (!spec || spec.status !== "frozen") {
    return undefined;
  }
  return spec;
}

export function isClarifiedSpecFrozen(
  plan: Pick<HarnessFeatureSprintPlan, "clarifiedSpec"> | null | undefined
): boolean {
  return Boolean(getFrozenClarifiedSpec(plan));
}
