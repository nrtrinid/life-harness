import { createId } from "./ids";
import type { FeatureSprintRunnerExecutionContext } from "./featureSprintRunner";
import type {
  HarnessFeatureSprintDependency,
  HarnessFeatureSprintExecutionModel,
  HarnessFeatureSprintExecutionTarget,
  HarnessFeatureSprintGateState,
  HarnessFeatureSprintMap,
  HarnessFeatureSprintMapNotice,
  HarnessFeatureSprintMapNoticeCode,
  HarnessFeatureSprintMapPhase,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintSprint,
  HarnessFeatureSprintStep,
  HarnessFeatureSprintStory,
  HarnessFeatureSprintTask,
  HarnessFeatureSprintTaskAcceptanceCriterion,
  HarnessFeatureSprintTaskScope,
  HarnessFeatureSprintTaskStatus,
  HarnessFeatureSprintTaskVerificationRequirement
} from "./types";

/**
 * Sprint Map terminology:
 * - Story = persisted schema container under a sprint.
 * - Slice = user-facing / execution label for an approved story (Story / Slice).
 * Do not add a parallel `slices[]` collection.
 *
 * Authority invariant: a plan has one authoritative execution model at a time
 * (`legacy_steps` or `sprint_map`). Presence of `sprintMap` alone is not authority.
 */

export const FEATURE_SPRINT_MAP_PHASES = ["localize", "implement", "review"] as const;

export const FEATURE_SPRINT_TASK_STATUSES = [
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "parked"
] as const;

export const STALE_EXECUTION_TARGET_MESSAGE =
  "The previously selected Sprint Map task no longer exists. Select a new task before launching another phase.";

export type FeatureSprintMapResolveResult =
  | {
      ok: true;
      sprint: HarnessFeatureSprintSprint;
      story: HarnessFeatureSprintStory;
      task: HarnessFeatureSprintTask;
      target: HarnessFeatureSprintExecutionTarget;
    }
  | { ok: false; error: string };

export type FeatureSprintMapReadinessIssue = {
  id: string;
  severity: "block" | "warn";
  message: string;
};

export type FeatureSprintMapReadiness = {
  ok: boolean;
  canLaunch: boolean;
  issues: FeatureSprintMapReadinessIssue[];
  nextSafeAction: string;
  resolved?: Extract<FeatureSprintMapResolveResult, { ok: true }>;
};

export type FeatureSprintSiblingExclusion = {
  kind: "story" | "task";
  id: string;
  title: string;
  reason: string;
};

export type FeatureSprintMapLifecycle =
  | "none"
  | "seeded_preview"
  | "adopted"
  | "out_of_sync";

export type SeedSprintMapResult =
  | {
      ok: true;
      sprintMap: HarnessFeatureSprintMap;
      executionTarget?: HarnessFeatureSprintExecutionTarget;
      notice: HarnessFeatureSprintMapNotice;
    }
  | { ok: false; error: string };

export type NormalizePlanSprintMapFieldsResult = {
  executionModel: HarnessFeatureSprintExecutionModel;
  sprintMap?: HarnessFeatureSprintMap;
  executionTarget?: HarnessFeatureSprintExecutionTarget;
  sprintMapNotices: HarnessFeatureSprintMapNotice[];
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coercePhase(value: unknown): HarnessFeatureSprintMapPhase | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return (FEATURE_SPRINT_MAP_PHASES as readonly string[]).includes(value)
    ? (value as HarnessFeatureSprintMapPhase)
    : undefined;
}

function coerceTaskStatus(value: unknown): HarnessFeatureSprintTaskStatus {
  if (typeof value === "string" && (FEATURE_SPRINT_TASK_STATUSES as readonly string[]).includes(value)) {
    return value as HarnessFeatureSprintTaskStatus;
  }
  return "planned";
}

function coerceGateState(value: unknown): HarnessFeatureSprintGateState | undefined {
  if (value === "open" || value === "blocked" || value === "passed") {
    return value;
  }
  return undefined;
}

function normalizeId(value: unknown, prefix: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return createId(prefix);
}

function normalizeAcceptanceCriteria(
  raw: unknown
): HarnessFeatureSprintTaskAcceptanceCriterion[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const criteria: HarnessFeatureSprintTaskAcceptanceCriterion[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) {
        continue;
      }
      criteria.push({ id: createId("fs_ac"), text });
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) {
      continue;
    }
    criteria.push({
      id: normalizeId(item.id, "fs_ac"),
      text
    });
  }
  return criteria;
}

function normalizeVerificationRequirements(
  raw: unknown
): HarnessFeatureSprintTaskVerificationRequirement[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const requirements: HarnessFeatureSprintTaskVerificationRequirement[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const description = item.trim();
      if (!description) {
        continue;
      }
      requirements.push({ id: createId("fs_verify"), description });
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const description =
      typeof item.description === "string"
        ? item.description.trim()
        : typeof item.command === "string"
          ? item.command.trim()
          : "";
    if (!description) {
      continue;
    }
    requirements.push({
      id: normalizeId(item.id, "fs_verify"),
      description,
      command: cleanOptional(typeof item.command === "string" ? item.command : undefined)
    });
  }
  return requirements;
}

function normalizeDependencies(raw: unknown): HarnessFeatureSprintDependency[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const dependencies: HarnessFeatureSprintDependency[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const taskId = typeof item.taskId === "string" ? item.taskId.trim() : "";
    if (!taskId) {
      continue;
    }
    dependencies.push({
      id: normalizeId(item.id, "fs_dep"),
      taskId,
      required: item.required === false ? false : true
    });
  }
  return dependencies;
}

function normalizeScope(raw: unknown): HarnessFeatureSprintTaskScope {
  if (!isRecord(raw)) {
    return {};
  }
  const expectedFileCountBudget =
    typeof raw.expectedFileCountBudget === "number" &&
    Number.isFinite(raw.expectedFileCountBudget) &&
    raw.expectedFileCountBudget >= 0
      ? Math.floor(raw.expectedFileCountBudget)
      : undefined;
  const scope: HarnessFeatureSprintTaskScope = {
    allowedPaths: cleanStringList(
      Array.isArray(raw.allowedPaths) ? (raw.allowedPaths as string[]) : undefined
    ),
    forbiddenPaths: cleanStringList(
      Array.isArray(raw.forbiddenPaths) ? (raw.forbiddenPaths as string[]) : undefined
    ),
    architecturalAreas: cleanStringList(
      Array.isArray(raw.architecturalAreas) ? (raw.architecturalAreas as string[]) : undefined
    ),
    contractsMayChange: cleanStringList(
      Array.isArray(raw.contractsMayChange) ? (raw.contractsMayChange as string[]) : undefined
    )
  };
  if (expectedFileCountBudget !== undefined) {
    scope.expectedFileCountBudget = expectedFileCountBudget;
  }
  if (!scope.allowedPaths?.length) {
    delete scope.allowedPaths;
  }
  if (!scope.forbiddenPaths?.length) {
    delete scope.forbiddenPaths;
  }
  if (!scope.architecturalAreas?.length) {
    delete scope.architecturalAreas;
  }
  if (!scope.contractsMayChange?.length) {
    delete scope.contractsMayChange;
  }
  return scope;
}

function normalizeTask(raw: unknown): HarnessFeatureSprintTask | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const objective =
    typeof raw.objective === "string"
      ? raw.objective.trim()
      : typeof raw.goal === "string"
        ? raw.goal.trim()
        : "";
  if (!title || !objective) {
    return undefined;
  }
  const completionEvidence = cleanStringList(
    Array.isArray(raw.completionEvidence) ? (raw.completionEvidence as string[]) : undefined
  );
  const architectureDecisions = cleanStringList(
    Array.isArray(raw.architectureDecisions) ? (raw.architectureDecisions as string[]) : undefined
  );
  const task: HarnessFeatureSprintTask = {
    id: normalizeId(raw.id, "fs_task"),
    title,
    objective,
    status: coerceTaskStatus(raw.status),
    acceptanceCriteria: normalizeAcceptanceCriteria(raw.acceptanceCriteria),
    dependencies: normalizeDependencies(raw.dependencies),
    scope: normalizeScope(raw.scope),
    verificationRequirements: normalizeVerificationRequirements(raw.verificationRequirements),
    gateState: coerceGateState(raw.gateState),
    linkedStepId: cleanOptional(typeof raw.linkedStepId === "string" ? raw.linkedStepId : undefined),
    createdAt: cleanOptional(typeof raw.createdAt === "string" ? raw.createdAt : undefined),
    updatedAt: cleanOptional(typeof raw.updatedAt === "string" ? raw.updatedAt : undefined)
  };
  if (completionEvidence.length > 0) {
    task.completionEvidence = completionEvidence;
  }
  if (architectureDecisions.length > 0) {
    task.architectureDecisions = architectureDecisions;
  }
  if (raw.riskTier === "tiny" || raw.riskTier === "standard" || raw.riskTier === "risky") {
    task.riskTier = raw.riskTier;
  } else if (raw.riskTier === "normal") {
    task.riskTier = "standard";
  }
  if (typeof raw.frozenSpecRevision === "number" && Number.isFinite(raw.frozenSpecRevision)) {
    task.frozenSpecRevision = Math.floor(raw.frozenSpecRevision);
  }
  if (typeof raw.correctionAttempt === "number" && Number.isFinite(raw.correctionAttempt)) {
    task.correctionAttempt = Math.max(0, Math.floor(raw.correctionAttempt));
  }
  if (typeof raw.maxCorrectionAttempts === "number" && Number.isFinite(raw.maxCorrectionAttempts)) {
    task.maxCorrectionAttempts = Math.max(0, Math.floor(raw.maxCorrectionAttempts));
  }
  if (raw.humanApprovedForRisk === true) {
    task.humanApprovedForRisk = true;
  }
  return task;
}

function normalizeStory(raw: unknown): HarnessFeatureSprintStory | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const outcome =
    typeof raw.outcome === "string"
      ? raw.outcome.trim()
      : typeof raw.goal === "string"
        ? raw.goal.trim()
        : "";
  if (!title || !outcome) {
    return undefined;
  }
  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = tasksRaw
    .map((task) => normalizeTask(task))
    .filter((task): task is HarnessFeatureSprintTask => Boolean(task));
  return {
    id: normalizeId(raw.id, "fs_story"),
    title,
    outcome,
    tasks
  };
}

function normalizeSprint(raw: unknown): HarnessFeatureSprintSprint | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const objective =
    typeof raw.objective === "string"
      ? raw.objective.trim()
      : typeof raw.goal === "string"
        ? raw.goal.trim()
        : "";
  if (!title || !objective) {
    return undefined;
  }
  const storiesRaw = Array.isArray(raw.stories) ? raw.stories : [];
  const stories = storiesRaw
    .map((story) => normalizeStory(story))
    .filter((story): story is HarnessFeatureSprintStory => Boolean(story));
  return {
    id: normalizeId(raw.id, "fs_sprint"),
    title,
    objective,
    stories
  };
}

export function normalizeFeatureSprintMap(raw: unknown): HarnessFeatureSprintMap | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const sprintsRaw = Array.isArray(raw.sprints) ? raw.sprints : [];
  const sprints = sprintsRaw
    .map((sprint) => normalizeSprint(sprint))
    .filter((sprint): sprint is HarnessFeatureSprintSprint => Boolean(sprint));
  if (sprints.length === 0) {
    return undefined;
  }
  return { sprints };
}

export function normalizeExecutionTarget(
  raw: unknown
): HarnessFeatureSprintExecutionTarget | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const sprintId = typeof raw.sprintId === "string" ? raw.sprintId.trim() : "";
  const storyId = typeof raw.storyId === "string" ? raw.storyId.trim() : "";
  const taskId = typeof raw.taskId === "string" ? raw.taskId.trim() : "";
  const phase = coercePhase(raw.phase);
  if (!sprintId || !storyId || !taskId || !phase) {
    return undefined;
  }
  return { sprintId, storyId, taskId, phase };
}

export function listFeatureSprintMapTasks(
  map: HarnessFeatureSprintMap | undefined
): Array<{
  sprint: HarnessFeatureSprintSprint;
  story: HarnessFeatureSprintStory;
  task: HarnessFeatureSprintTask;
}> {
  if (!map) {
    return [];
  }
  const rows: Array<{
    sprint: HarnessFeatureSprintSprint;
    story: HarnessFeatureSprintStory;
    task: HarnessFeatureSprintTask;
  }> = [];
  for (const sprint of map.sprints) {
    for (const story of sprint.stories) {
      for (const task of story.tasks) {
        rows.push({ sprint, story, task });
      }
    }
  }
  return rows;
}

export function findTaskInFeatureSprintMap(
  map: HarnessFeatureSprintMap | undefined,
  taskId: string
):
  | {
      sprint: HarnessFeatureSprintSprint;
      story: HarnessFeatureSprintStory;
      task: HarnessFeatureSprintTask;
    }
  | undefined {
  return listFeatureSprintMapTasks(map).find((row) => row.task.id === taskId);
}

export function resolveFeatureSprintExecutionTarget(
  plan: Pick<HarnessFeatureSprintPlan, "sprintMap" | "executionTarget">,
  target: HarnessFeatureSprintExecutionTarget | undefined = plan.executionTarget
): FeatureSprintMapResolveResult {
  if (!plan.sprintMap) {
    return { ok: false, error: "No Sprint Map is present on this feature plan." };
  }
  if (!target) {
    return { ok: false, error: "No execution target selected. Choose a sprint, story, task, and phase." };
  }

  const sprint = plan.sprintMap.sprints.find((item) => item.id === target.sprintId);
  if (!sprint) {
    return {
      ok: false,
      error: `Execution target sprint not found: ${target.sprintId}. Re-select a current Sprint Map task.`
    };
  }

  const story = sprint.stories.find((item) => item.id === target.storyId);
  if (!story) {
    return {
      ok: false,
      error: `Execution target story not found in sprint "${sprint.title}": ${target.storyId}.`
    };
  }

  const task = story.tasks.find((item) => item.id === target.taskId);
  if (!task) {
    return {
      ok: false,
      error: `Execution target task not found in story "${story.title}": ${target.taskId}.`
    };
  }

  if (!coercePhase(target.phase)) {
    return {
      ok: false,
      error: `Invalid execution phase "${String(target.phase)}". Use localize, implement, or review.`
    };
  }

  return {
    ok: true,
    sprint,
    story,
    task,
    target: {
      sprintId: sprint.id,
      storyId: story.id,
      taskId: task.id,
      phase: target.phase
    }
  };
}

export function getUnmetRequiredDependencies(
  map: HarnessFeatureSprintMap,
  task: HarnessFeatureSprintTask
): Array<{ dependency: HarnessFeatureSprintDependency; prerequisite?: HarnessFeatureSprintTask }> {
  const unmet: Array<{
    dependency: HarnessFeatureSprintDependency;
    prerequisite?: HarnessFeatureSprintTask;
  }> = [];
  for (const dependency of task.dependencies) {
    if (dependency.required === false) {
      continue;
    }
    const found = findTaskInFeatureSprintMap(map, dependency.taskId);
    if (!found || found.task.status !== "done") {
      unmet.push({ dependency, prerequisite: found?.task });
    }
  }
  return unmet;
}

export function buildSiblingExclusions(
  map: HarnessFeatureSprintMap,
  target: HarnessFeatureSprintExecutionTarget,
  dependencyTaskIds: Set<string>
): FeatureSprintSiblingExclusion[] {
  const exclusions: FeatureSprintSiblingExclusion[] = [];
  for (const sprint of map.sprints) {
    for (const story of sprint.stories) {
      const storyIsCurrent = sprint.id === target.sprintId && story.id === target.storyId;
      if (!storyIsCurrent) {
        exclusions.push({
          kind: "story",
          id: story.id,
          title: story.title,
          reason: "Sibling story / slice — out of scope unless listed as a dependency."
        });
      }
      for (const task of story.tasks) {
        if (task.id === target.taskId) {
          continue;
        }
        if (dependencyTaskIds.has(task.id)) {
          continue;
        }
        exclusions.push({
          kind: "task",
          id: task.id,
          title: task.title,
          reason: storyIsCurrent
            ? "Sibling task in the current story / slice — do not implement unless it is a declared dependency."
            : "Task outside the current story / slice — out of scope."
        });
      }
    }
  }
  return exclusions;
}

function phaseLabel(phase: HarnessFeatureSprintMapPhase): string {
  if (phase === "localize") {
    return "localize";
  }
  if (phase === "implement") {
    return "implement";
  }
  return "review";
}

function coerceExecutionModel(value: unknown): HarnessFeatureSprintExecutionModel {
  return value === "sprint_map" ? "sprint_map" : "legacy_steps";
}

function upsertNotice(
  notices: HarnessFeatureSprintMapNotice[],
  notice: HarnessFeatureSprintMapNotice
): HarnessFeatureSprintMapNotice[] {
  if (notices.some((item) => item.fingerprint === notice.fingerprint)) {
    return notices;
  }
  return [...notices, notice];
}

function removeNoticesByCode(
  notices: HarnessFeatureSprintMapNotice[],
  codes: HarnessFeatureSprintMapNoticeCode[]
): HarnessFeatureSprintMapNotice[] {
  const blocked = new Set(codes);
  return notices.filter((notice) => !blocked.has(notice.code));
}

export function resolveFeatureSprintExecutionModel(
  plan: Pick<HarnessFeatureSprintPlan, "executionModel" | "sprintMap">
): HarnessFeatureSprintExecutionModel {
  if (coerceExecutionModel(plan.executionModel) === "sprint_map" && plan.sprintMap) {
    return "sprint_map";
  }
  return "legacy_steps";
}

export function isSprintMapAuthoritative(
  plan: Pick<HarnessFeatureSprintPlan, "executionModel" | "sprintMap">
): boolean {
  return resolveFeatureSprintExecutionModel(plan) === "sprint_map";
}

export function assessSprintMapLinkedStepSync(
  plan: Pick<HarnessFeatureSprintPlan, "steps" | "sprintMap">
): { inSync: boolean; staleLinkedStepIds: string[]; warning?: string } {
  const map = plan.sprintMap;
  if (!map) {
    return { inSync: true, staleLinkedStepIds: [] };
  }
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const staleLinkedStepIds: string[] = [];
  for (const row of listFeatureSprintMapTasks(map)) {
    const linked = row.task.linkedStepId?.trim();
    if (linked && !stepIds.has(linked)) {
      staleLinkedStepIds.push(linked);
    }
  }
  if (staleLinkedStepIds.length === 0) {
    return { inSync: true, staleLinkedStepIds: [] };
  }
  return {
    inSync: false,
    staleLinkedStepIds,
    warning:
      "Some Sprint Map tasks link to step IDs that are no longer on this plan. Re-seed only after clearing the map, or update links manually — do not assume steps and map stay synchronized."
  };
}

export function resolveSprintMapLifecycle(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "executionModel" | "sprintMap" | "steps" | "sprintMapNotices"
  >
): FeatureSprintMapLifecycle {
  if (!plan.sprintMap) {
    return "none";
  }
  const sync = assessSprintMapLinkedStepSync(plan);
  if (!sync.inSync) {
    return "out_of_sync";
  }
  if (isSprintMapAuthoritative(plan)) {
    return "adopted";
  }
  return "seeded_preview";
}

export function assessFeatureSprintMapReadiness(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  options: {
    target?: HarnessFeatureSprintExecutionTarget;
    requireMap?: boolean;
    requiredPhase?: HarnessFeatureSprintMapPhase;
  } = {}
): FeatureSprintMapReadiness {
  const issues: FeatureSprintMapReadinessIssue[] = [];
  const requireMap =
    options.requireMap === true || isSprintMapAuthoritative(plan);
  const map = plan.sprintMap;

  if (!map) {
    if (requireMap) {
      issues.push({
        id: "map_missing",
        severity: "block",
        message: "Sprint Map is required before launching a map-anchored agent run."
      });
      return {
        ok: false,
        canLaunch: false,
        issues,
        nextSafeAction: "Import or attach a Sprint Map with at least one sprint → story / slice → task."
      };
    }
    return {
      ok: true,
      canLaunch: true,
      issues: [],
      nextSafeAction: "Continue with the existing fixed-step / living-spec flow."
    };
  }

  if (!requireMap) {
    return {
      ok: true,
      canLaunch: true,
      issues: [
        {
          id: "map_preview",
          severity: "warn",
          message:
            "Sprint Map is present as a preview. Legacy steps still gate launches until you adopt Sprint Map execution."
        }
      ],
      nextSafeAction: "Adopt Sprint Map execution when ready, or continue with the legacy step flow."
    };
  }

  const target = options.target ?? plan.executionTarget;
  const resolved = resolveFeatureSprintExecutionTarget(plan, target);
  if (!resolved.ok) {
    issues.push({ id: "target_unresolved", severity: "block", message: resolved.error });
    return {
      ok: false,
      canLaunch: false,
      issues,
      nextSafeAction: "Select a valid sprint, story / slice, task, and phase on the Sprint Map."
    };
  }

  if (options.requiredPhase && resolved.target.phase !== options.requiredPhase) {
    issues.push({
      id: "phase_mismatch",
      severity: "block",
      message: `Selected Sprint Map phase is "${resolved.target.phase}", but this action requires "${options.requiredPhase}".`
    });
  }

  const { task } = resolved;

  if (task.status === "done") {
    issues.push({
      id: "task_done",
      severity: "block",
      message: `Task "${task.title}" is already done — pick another task or phase.`
    });
  }
  if (task.status === "blocked" || task.gateState === "blocked") {
    issues.push({
      id: "task_blocked",
      severity: "block",
      message: `Task "${task.title}" is blocked and cannot launch.`
    });
  }
  if (task.status === "parked") {
    issues.push({
      id: "task_parked",
      severity: "block",
      message: `Task "${task.title}" is parked — unpark or choose another task before launch.`
    });
  }
  if (task.status === "planned") {
    issues.push({
      id: "task_planned",
      severity: "block",
      message: `Task "${task.title}" is still planned — mark it ready before launch.`
    });
  }

  const unmet = getUnmetRequiredDependencies(map, task);
  for (const item of unmet) {
    const label = item.prerequisite?.title ?? item.dependency.taskId;
    issues.push({
      id: `dep_${item.dependency.id}`,
      severity: "block",
      message: `Required dependency unmet: "${label}" must be done before launching.`
    });
  }

  if (task.acceptanceCriteria.length === 0) {
    issues.push({
      id: "missing_ac",
      severity: "warn",
      message: `Task "${task.title}" has no acceptance criteria.`
    });
  }
  if (task.verificationRequirements.length === 0) {
    issues.push({
      id: "missing_verification",
      severity: "warn",
      message: `Task "${task.title}" has no verification requirements.`
    });
  }
  if (
    !task.scope.allowedPaths?.length &&
    !task.scope.architecturalAreas?.length &&
    !task.scope.forbiddenPaths?.length
  ) {
    issues.push({
      id: "missing_scope",
      severity: "warn",
      message: `Task "${task.title}" has no scope boundaries declared (allowed/forbidden paths or areas).`
    });
  }
  if (!task.completionEvidence?.length && resolved.target.phase === "review") {
    issues.push({
      id: "missing_completion_evidence",
      severity: "warn",
      message: `Review phase for "${task.title}" has no declared completion evidence expectations.`
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "block");
  const canLaunch = blockers.length === 0;
  let nextSafeAction = `Launch ${phaseLabel(resolved.target.phase)} for "${task.title}".`;
  if (!canLaunch) {
    nextSafeAction = blockers[0]?.message ?? "Resolve Sprint Map blockers before launch.";
  } else if (issues.some((issue) => issue.severity === "warn")) {
    nextSafeAction = `Review scope/readiness warnings, then launch ${phaseLabel(resolved.target.phase)} for "${task.title}".`;
  }

  return {
    ok: canLaunch,
    canLaunch,
    issues,
    nextSafeAction,
    resolved
  };
}

export function canLaunchFeatureSprintMapTarget(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  target?: HarnessFeatureSprintExecutionTarget
): boolean {
  if (!isSprintMapAuthoritative(plan)) {
    return true;
  }
  return assessFeatureSprintMapReadiness(plan, { target, requireMap: true }).canLaunch;
}

export function assessFeatureSprintPhaseLaunch(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  phase: HarnessFeatureSprintMapPhase
): FeatureSprintMapReadiness {
  if (!isSprintMapAuthoritative(plan)) {
    return {
      ok: true,
      canLaunch: true,
      issues: [],
      nextSafeAction: "Legacy steps remain authoritative for this launch."
    };
  }
  return assessFeatureSprintMapReadiness(plan, {
    requireMap: true,
    requiredPhase: phase
  });
}

export function canLaunchFeatureSprintPhase(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  phase: HarnessFeatureSprintMapPhase
): boolean {
  return assessFeatureSprintPhaseLaunch(plan, phase).canLaunch;
}

export function getFeatureSprintLaunchBlockReason(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  phase: HarnessFeatureSprintMapPhase
): string | undefined {
  const readiness = assessFeatureSprintPhaseLaunch(plan, phase);
  if (readiness.canLaunch) {
    return undefined;
  }
  return readiness.issues.find((issue) => issue.severity === "block")?.message ?? readiness.nextSafeAction;
}

export type BuildFeatureSprintRunnerExecutionContextInput = {
  plan: Pick<
    HarnessFeatureSprintPlan,
    "id" | "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel" | "steps"
  >;
  /** Required for authoritative map phase launches (implement/review/localize). */
  phase?: HarnessFeatureSprintMapPhase;
  stepId?: string;
};

export type BuildFeatureSprintRunnerExecutionContextResult =
  | { ok: true; context: FeatureSprintRunnerExecutionContext }
  | { ok: false; error: string };

/**
 * Build typed runner correlation context from authoritative app state.
 * Call only after the existing launch readiness check has passed for map phases.
 * Preview maps never produce authoritative map IDs.
 */
export function buildFeatureSprintRunnerExecutionContext(
  input: BuildFeatureSprintRunnerExecutionContextInput
): BuildFeatureSprintRunnerExecutionContextResult {
  const planId = input.plan.id.trim();
  if (!planId) {
    return { ok: false, error: "planId is required to build runner execution context." };
  }

  const stepId = input.stepId?.trim() || undefined;

  if (!isSprintMapAuthoritative(input.plan)) {
    const context: FeatureSprintRunnerExecutionContext = {
      planId,
      executionModel: "legacy_steps"
    };
    if (stepId) {
      context.stepId = stepId;
    }
    return { ok: true, context };
  }

  if (input.phase) {
    const readiness = assessFeatureSprintPhaseLaunch(input.plan, input.phase);
    if (!readiness.canLaunch || !readiness.resolved) {
      return {
        ok: false,
        error:
          readiness.issues.find((issue) => issue.severity === "block")?.message ??
          readiness.nextSafeAction
      };
    }

    const { target, task } = readiness.resolved;
    const linkedStepId = task.linkedStepId?.trim() || stepId;
    const context: FeatureSprintRunnerExecutionContext = {
      planId,
      executionModel: "sprint_map",
      sprintId: target.sprintId,
      storyId: target.storyId,
      taskId: target.taskId,
      phase: target.phase
    };
    if (linkedStepId) {
      context.stepId = linkedStepId;
    }
    return { ok: true, context };
  }

  // Non-phase actions (e.g. prompt audit): correlate to the current target when present,
  // but never attach phase / mapPhase — that would falsely imply a localize/implement/review run.
  const resolved = resolveFeatureSprintExecutionTarget(input.plan, input.plan.executionTarget);
  if (!resolved.ok) {
    const context: FeatureSprintRunnerExecutionContext = {
      planId,
      executionModel: "sprint_map"
    };
    if (stepId) {
      context.stepId = stepId;
    }
    return { ok: true, context };
  }

  const linkedStepId = resolved.task.linkedStepId?.trim() || stepId;
  const context: FeatureSprintRunnerExecutionContext = {
    planId,
    executionModel: "sprint_map",
    sprintId: resolved.target.sprintId,
    storyId: resolved.target.storyId,
    taskId: resolved.target.taskId
  };
  if (linkedStepId) {
    context.stepId = linkedStepId;
  }
  return { ok: true, context };
}

/** History stores map phase as `mapPhase`; wire uses `phase`. */
export function historyAttributionFromExecutionContext(
  context: FeatureSprintRunnerExecutionContext | undefined
): {
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  mapPhase?: HarnessFeatureSprintMapPhase;
  planId?: string;
  stepId?: string;
} {
  if (!context) {
    return {};
  }
  if (context.executionModel !== "sprint_map") {
    return {
      planId: context.planId,
      stepId: context.stepId
    };
  }
  return {
    planId: context.planId,
    stepId: context.stepId,
    sprintId: context.sprintId,
    storyId: context.storyId,
    taskId: context.taskId,
    mapPhase: context.phase
  };
}

export function clearStaleTargetNoticesOnSelection(
  notices: HarnessFeatureSprintMapNotice[] | undefined
): HarnessFeatureSprintMapNotice[] | undefined {
  const next = removeNoticesByCode(notices ?? [], ["stale_execution_target"]);
  return next.length > 0 ? next : undefined;
}

function formatBulletSection(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return [`${title}`, "- (none)", ""];
  }
  return [title, ...items.map((item) => `- ${item}`), ""];
}

export function formatFeatureSprintMapPacketSections(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "title" | "goal" | "sprintMap" | "executionTarget" | "executionModel"
  >,
  options: { target?: HarnessFeatureSprintExecutionTarget } = {}
): string[] {
  const map = plan.sprintMap;
  if (!map) {
    return [];
  }

  const readiness = assessFeatureSprintMapReadiness(plan, {
    target: options.target,
    requireMap: isSprintMapAuthoritative(plan)
  });
  const resolved = readiness.resolved;
  if (!resolved) {
    if (!isSprintMapAuthoritative(plan)) {
      return [
        "## Sprint Map (preview)",
        "- Map is attached but legacy steps remain authoritative until Sprint Map execution is adopted.",
        ""
      ];
    }
    return [
      "## Sprint Map execution target",
      `- Status: unresolved`,
      `- Detail: ${readiness.issues[0]?.message ?? "Select a valid execution target."}`,
      "",
      "## Stop condition",
      "- Do not start work until a valid Sprint Map execution target is selected.",
      ""
    ];
  }

  const { sprint, story, task, target } = resolved;
  const dependencyTaskIds = new Set(task.dependencies.map((dependency) => dependency.taskId));
  const exclusions = buildSiblingExclusions(map, target, dependencyTaskIds);
  const unmet = getUnmetRequiredDependencies(map, task);
  const dependencyLines =
    task.dependencies.length === 0
      ? ["(none)"]
      : task.dependencies.map((dependency) => {
          const found = findTaskInFeatureSprintMap(map, dependency.taskId);
          const status = found?.task.status ?? "missing";
          const required = dependency.required === false ? "optional" : "required";
          const title = found?.task.title ?? dependency.taskId;
          return `${title} (${required}, ${status})`;
        });

  const lines: string[] = [
    "## Sprint Map execution target",
    `- Sprint ID: ${target.sprintId}`,
    `- Story / Slice ID: ${target.storyId}`,
    `- Task ID: ${target.taskId}`,
    `- Phase: ${target.phase}`,
    `- Execution model: ${resolveFeatureSprintExecutionModel(plan)}`,
    "",
    "## Feature objective",
    `- ${plan.goal}`,
    "",
    "## Sprint objective",
    `- ${sprint.title}: ${sprint.objective}`,
    "",
    "## Story / Slice outcome",
    `- ${story.title}: ${story.outcome}`,
    "",
    "## Current task objective",
    `- ${task.title}: ${task.objective}`,
    "",
    ...formatBulletSection(
      "## Acceptance criteria",
      task.acceptanceCriteria.map((item) => item.text)
    ),
    ...formatBulletSection("## Dependency state", dependencyLines),
    ...formatBulletSection("## Allowed paths", task.scope.allowedPaths ?? []),
    ...formatBulletSection("## Forbidden paths", task.scope.forbiddenPaths ?? []),
    ...formatBulletSection("## Architectural areas", task.scope.architecturalAreas ?? []),
    ...formatBulletSection("## Contracts that may change", task.scope.contractsMayChange ?? [])
  ];

  if (task.scope.expectedFileCountBudget !== undefined) {
    lines.push(
      "## Scope budget",
      `- Expected file-count budget: ${task.scope.expectedFileCountBudget}`,
      ""
    );
  }

  lines.push(
    ...formatBulletSection(
      "## Explicitly excluded sibling work",
      exclusions.map((item) => `[${item.kind}] ${item.title} — ${item.reason}`)
    ),
    ...formatBulletSection("## Relevant architecture decisions", task.architectureDecisions ?? []),
    ...formatBulletSection(
      "## Expected verification",
      task.verificationRequirements.map((item) =>
        item.command ? `${item.description} (${item.command})` : item.description
      )
    ),
    ...formatBulletSection("## Required completion evidence", task.completionEvidence ?? []),
    "## Stop condition",
    `- Stop when phase "${target.phase}" for task "${task.title}" is complete.`,
    "- Do not start sibling stories/tasks listed as excluded.",
    unmet.length > 0
      ? "- Do not proceed while required dependencies remain unmet."
      : "- Required dependencies are satisfied for launch.",
    ""
  );

  const warnings = readiness.issues.filter((issue) => issue.severity === "warn");
  if (warnings.length > 0) {
    lines.push(
      ...formatBulletSection(
        "## Sprint Map readiness warnings",
        warnings.map((issue) => issue.message)
      )
    );
  }

  return lines;
}

export function sanitizeExecutionTargetAgainstMap(
  map: HarnessFeatureSprintMap | undefined,
  target: HarnessFeatureSprintExecutionTarget | undefined
): HarnessFeatureSprintExecutionTarget | undefined {
  if (!map || !target) {
    return undefined;
  }
  const resolved = resolveFeatureSprintExecutionTarget({ sprintMap: map, executionTarget: target });
  return resolved.ok ? resolved.target : undefined;
}

function mapTaskStatusFromStep(
  step: HarnessFeatureSprintStep,
  currentStepId: string | undefined
): HarnessFeatureSprintTaskStatus {
  if (step.status === "done") {
    return "done";
  }
  if (step.status === "blocked") {
    return "blocked";
  }
  if (step.status === "parked") {
    return "parked";
  }
  if (step.status === "planned") {
    return "planned";
  }
  return step.id === currentStepId ? "ready" : "planned";
}

export function normalizePlanSprintMapFields(
  plan: HarnessFeatureSprintPlan,
  nowIsoValue?: string
): NormalizePlanSprintMapFieldsResult {
  const timestamp = nowIsoValue ?? new Date().toISOString();
  const sprintMap = normalizeFeatureSprintMap(plan.sprintMap);
  const previousTarget = normalizeExecutionTarget(plan.executionTarget);
  const executionTarget = sanitizeExecutionTargetAgainstMap(sprintMap, previousTarget);

  let executionModel = coerceExecutionModel(plan.executionModel);
  if (executionModel === "sprint_map" && !sprintMap) {
    executionModel = "legacy_steps";
  }

  let notices = [...(plan.sprintMapNotices ?? [])];

  if (previousTarget && !executionTarget) {
    const fingerprint = [
      "stale_execution_target",
      previousTarget.sprintId,
      previousTarget.storyId,
      previousTarget.taskId,
      previousTarget.phase
    ].join(":");
    notices = upsertNotice(notices, {
      code: "stale_execution_target",
      message: STALE_EXECUTION_TARGET_MESSAGE,
      fingerprint,
      createdAt: timestamp
    });
  }

  if (sprintMap) {
    const sync = assessSprintMapLinkedStepSync({ steps: plan.steps, sprintMap });
    if (!sync.inSync && sync.warning) {
      const fingerprint = `stale_linked_step:${sync.staleLinkedStepIds.slice().sort().join(",")}`;
      notices = upsertNotice(notices, {
        code: "stale_linked_step",
        message: sync.warning,
        fingerprint,
        createdAt: timestamp
      });
      notices = upsertNotice(notices, {
        code: "map_out_of_sync",
        message:
          "Sprint Map may be out of sync with legacy steps. Linked step IDs do not all resolve.",
        fingerprint: `map_out_of_sync:${fingerprint}`,
        createdAt: timestamp
      });
    } else {
      notices = removeNoticesByCode(notices, ["stale_linked_step", "map_out_of_sync"]);
    }
  } else {
    notices = removeNoticesByCode(notices, [
      "stale_linked_step",
      "map_out_of_sync",
      "seed_preview",
      "stale_execution_target"
    ]);
  }

  return {
    executionModel,
    sprintMap,
    executionTarget,
    sprintMapNotices: notices
  };
}

/**
 * Seed a deterministic one-sprint map from legacy steps.
 * Does NOT adopt Sprint Map authority — legacy_steps remains authoritative until adopt.
 * Refuses to overwrite an existing map unless `force: true`.
 */
export function canSeedFeatureSprintMapFromSteps(
  plan: Pick<HarnessFeatureSprintPlan, "sprintMap">
): boolean {
  return !plan.sprintMap;
}

export function seedSprintMapFromLegacySteps(
  plan: Pick<
    HarnessFeatureSprintPlan,
    "id" | "title" | "goal" | "steps" | "currentStepId" | "sprintMap"
  >,
  options: { force?: boolean; nowIso?: string } = {}
): SeedSprintMapResult {
  if (plan.sprintMap && !options.force) {
    return {
      ok: false,
      error:
        "Sprint Map already exists. Clear it or adopt it before reseeding — existing maps are never overwritten silently."
    };
  }
  if (plan.steps.length === 0) {
    return { ok: false, error: "No legacy steps available to seed a Sprint Map." };
  }

  const timestamp = options.nowIso;
  const sprintId = `fs_sprint_seed_${plan.id}`;
  const storyId = `fs_story_seed_${plan.id}`;
  const tasks: HarnessFeatureSprintTask[] = plan.steps.map((step) => ({
    id: `fs_task_seed_${step.id}`,
    title: step.title,
    objective: step.goal,
    status: mapTaskStatusFromStep(step, plan.currentStepId),
    acceptanceCriteria: step.acceptanceCriteria.map((text, index) => ({
      id: `fs_ac_seed_${step.id}_${index}`,
      text
    })),
    dependencies: [],
    scope: {},
    verificationRequirements: [],
    linkedStepId: step.id,
    createdAt: timestamp,
    updatedAt: timestamp
  }));

  const sprintMap: HarnessFeatureSprintMap = {
    sprints: [
      {
        id: sprintId,
        title: `${plan.title} — Sprint 1`,
        objective: plan.goal,
        stories: [
          {
            id: storyId,
            title: "Primary story / slice",
            outcome: plan.goal,
            tasks
          }
        ]
      }
    ]
  };

  const current =
    tasks.find((task) => task.linkedStepId === plan.currentStepId) ??
    tasks.find((task) => task.status === "ready") ??
    tasks[0];

  return {
    ok: true,
    sprintMap,
    executionTarget: current
      ? {
          sprintId,
          storyId,
          taskId: current.id,
          phase: "implement"
        }
      : undefined,
    notice: {
      code: "seed_preview",
      message:
        "Sprint Map seeded from steps as a preview. Legacy steps still gate launches until you adopt Sprint Map execution.",
      fingerprint: `seed_preview:${plan.id}:${sprintId}`,
      createdAt: timestamp ?? new Date().toISOString()
    }
  };
}
