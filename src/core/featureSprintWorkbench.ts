import { shouldIncludeCard } from "./contextPacketRedaction";
import { getActiveFeatureSprintPlanForCard } from "./featureSprintOrchestrator";
import { getMainQuest } from "./guards";
import type { LifeHarnessData } from "./lifeHarnessData";
import { getProjectForCard } from "./projectRegistry";
import type {
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintReviewStatus,
  HarnessFeatureSprintStatus,
  HarnessFeatureSprintStep,
  HarnessFeatureSprintStepStatus,
  LifeCard
} from "./types";

export type FeatureSprintWorkbenchPlanRow = {
  planId: string;
  cardId: string;
  cardTitle: string;
  projectId?: string;
  projectName?: string;
  repoPath?: string;
  title: string;
  goal: string;
  status: HarnessFeatureSprintStatus;
  currentStepId?: string;
  currentStepTitle?: string;
  currentStepStatus?: HarnessFeatureSprintStepStatus;
  reviewStatus?: HarnessFeatureSprintReviewStatus;
  updatedAt: string;
  completedAt?: string;
  stepCount: number;
  completedStepCount: number;
  acceptanceCriteriaCount: number;
  evidenceLogId?: string;
  evidenceProofItemId?: string;
};

export type FeatureSprintWorkbenchReadyCard = {
  cardId: string;
  title: string;
  state: string;
  area: string;
  projectName?: string;
  repoPath?: string;
  nextTinyAction: string;
  hasProjectMetadata: boolean;
};

export type FeatureSprintWorkbenchSummary = {
  needsPlanning: FeatureSprintWorkbenchReadyCard[];
  readyToImplement: FeatureSprintWorkbenchPlanRow[];
  awaitingAgentOutput: FeatureSprintWorkbenchPlanRow[];
  needsReview: FeatureSprintWorkbenchPlanRow[];
  readyToAdvance: FeatureSprintWorkbenchPlanRow[];
  recentlyCompleted: FeatureSprintWorkbenchPlanRow[];
};

export type FeatureSprintWorkbenchActiveBucket =
  | "readyToAdvance"
  | "needsReview"
  | "awaitingAgentOutput"
  | "readyToImplement";

const ACTIVE_PLAN_STATUSES = new Set<HarnessFeatureSprintStatus>([
  "planning",
  "in_progress",
  "reviewing"
]);

const READY_PLANNING_STATES = new Set<LifeCard["state"]>(["active", "waiting", "inbox"]);

function findCard(data: LifeHarnessData, cardId: string): LifeCard | undefined {
  return data.cards.find((card) => card.id === cardId);
}

function resolveCurrentStep(plan: HarnessFeatureSprintPlan): HarnessFeatureSprintStep | undefined {
  if (plan.steps.length === 0) {
    return undefined;
  }

  if (plan.currentStepId) {
    return plan.steps.find((step) => step.id === plan.currentStepId) ?? plan.steps[0];
  }

  return plan.steps[0];
}

function comparePlanRowsNewestFirst(
  left: FeatureSprintWorkbenchPlanRow,
  right: FeatureSprintWorkbenchPlanRow
): number {
  const dateDiff = right.updatedAt.localeCompare(left.updatedAt);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return left.title.localeCompare(right.title);
}

function compareCompletedPlanRows(
  left: FeatureSprintWorkbenchPlanRow,
  right: FeatureSprintWorkbenchPlanRow
): number {
  const leftKey = left.completedAt ?? left.updatedAt;
  const rightKey = right.completedAt ?? right.updatedAt;
  const dateDiff = rightKey.localeCompare(leftKey);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return left.title.localeCompare(right.title);
}

function readyCardPriority(data: LifeHarnessData, card: LifeCard): number {
  let score = 0;
  const mainQuest = getMainQuest(data.cards, data.dailyState);

  if (mainQuest?.id === card.id) {
    score += 200;
  }

  if (card.state === "active") {
    score += 100;
  } else if (card.state === "waiting") {
    score += 90;
  } else if (card.state === "inbox") {
    score += 80;
  }

  if (card.area === "build") {
    score += 20;
  }

  if (card.area === "social_career" || card.careerApplication) {
    score += 15;
  }

  return score;
}

function compareReadyCards(data: LifeHarnessData, left: LifeCard, right: LifeCard): number {
  const scoreDiff = readyCardPriority(data, right) - readyCardPriority(data, left);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return left.title.localeCompare(right.title);
}

export function isNeedsPlanningCard(data: LifeHarnessData, card: LifeCard): boolean {
  if (!shouldIncludeCard(card)) {
    return false;
  }

  if (!READY_PLANNING_STATES.has(card.state)) {
    return false;
  }

  if (!getProjectForCard(data, card.id)) {
    return false;
  }

  if (getActiveFeatureSprintPlanForCard(data, card.id)) {
    return false;
  }

  const areaRelevant =
    card.area === "build" ||
    card.area === "social_career" ||
    Boolean(card.careerApplication);

  return areaRelevant;
}

export function classifyActiveFeatureSprintPlan(
  plan: HarnessFeatureSprintPlan
): FeatureSprintWorkbenchActiveBucket | null {
  if (!ACTIVE_PLAN_STATUSES.has(plan.status)) {
    return null;
  }

  const step = resolveCurrentStep(plan);
  if (!step) {
    return null;
  }

  const outputSummary = step.outputSummary?.trim();
  const reviewStatus = step.reviewStatus;

  if (reviewStatus === "accepted" && step.status !== "done") {
    return "readyToAdvance";
  }

  if (
    (outputSummary && (!reviewStatus || reviewStatus === "pending")) ||
    (plan.status === "reviewing" && step.status !== "done")
  ) {
    return "needsReview";
  }

  if (step.status === "sent" && !outputSummary) {
    return "awaitingAgentOutput";
  }

  if ((step.status === "ready" || step.status === "planned") && !outputSummary) {
    return "readyToImplement";
  }

  return null;
}

export function buildFeatureSprintWorkbenchPlanRow(
  data: LifeHarnessData,
  plan: HarnessFeatureSprintPlan
): FeatureSprintWorkbenchPlanRow | null {
  const card = findCard(data, plan.cardId);
  if (!card || !shouldIncludeCard(card)) {
    return null;
  }

  const project = getProjectForCard(data, plan.cardId);
  const currentStep = resolveCurrentStep(plan);
  const completedStepCount = plan.steps.filter((step) => step.status === "done").length;

  return {
    planId: plan.id,
    cardId: plan.cardId,
    cardTitle: card.title,
    projectId: project?.id ?? plan.projectId,
    projectName: project?.name,
    repoPath: project?.repoPath,
    title: plan.title,
    goal: plan.goal,
    status: plan.status,
    currentStepId: currentStep?.id,
    currentStepTitle: currentStep?.title,
    currentStepStatus: currentStep?.status,
    reviewStatus: currentStep?.reviewStatus,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
    stepCount: plan.steps.length,
    completedStepCount,
    acceptanceCriteriaCount: plan.acceptanceCriteria.length,
    evidenceLogId: plan.evidenceLogId,
    evidenceProofItemId: plan.evidenceProofItemId
  };
}

export function buildFeatureSprintWorkbenchReadyCard(
  data: LifeHarnessData,
  card: LifeCard
): FeatureSprintWorkbenchReadyCard | null {
  if (!isNeedsPlanningCard(data, card)) {
    return null;
  }

  const project = getProjectForCard(data, card.id);

  return {
    cardId: card.id,
    title: card.title,
    state: card.state,
    area: card.area,
    projectName: project?.name,
    repoPath: project?.repoPath,
    nextTinyAction: card.nextTinyAction,
    hasProjectMetadata: Boolean(project)
  };
}

export function buildFeatureSprintWorkbenchSummary(
  data: LifeHarnessData,
  options: { now?: Date; limit?: number } = {}
): FeatureSprintWorkbenchSummary {
  void options.now;
  const limit = options.limit ?? 8;

  const readyToImplement: FeatureSprintWorkbenchPlanRow[] = [];
  const awaitingAgentOutput: FeatureSprintWorkbenchPlanRow[] = [];
  const needsReview: FeatureSprintWorkbenchPlanRow[] = [];
  const readyToAdvance: FeatureSprintWorkbenchPlanRow[] = [];
  const recentlyCompleted: FeatureSprintWorkbenchPlanRow[] = [];

  for (const plan of data.featureSprintPlans) {
    const row = buildFeatureSprintWorkbenchPlanRow(data, plan);
    if (!row) {
      continue;
    }

    if (plan.status === "done") {
      recentlyCompleted.push(row);
      continue;
    }

    const bucket = classifyActiveFeatureSprintPlan(plan);
    if (bucket === "readyToAdvance") {
      readyToAdvance.push(row);
    } else if (bucket === "needsReview") {
      needsReview.push(row);
    } else if (bucket === "awaitingAgentOutput") {
      awaitingAgentOutput.push(row);
    } else if (bucket === "readyToImplement") {
      readyToImplement.push(row);
    }
  }

  const needsPlanning = data.cards
    .filter((card) => isNeedsPlanningCard(data, card))
    .sort((left, right) => compareReadyCards(data, left, right))
    .slice(0, limit)
    .map((card) => buildFeatureSprintWorkbenchReadyCard(data, card))
    .filter((row): row is FeatureSprintWorkbenchReadyCard => row !== null);

  return {
    needsPlanning,
    readyToImplement: readyToImplement.sort(comparePlanRowsNewestFirst).slice(0, limit),
    awaitingAgentOutput: awaitingAgentOutput.sort(comparePlanRowsNewestFirst).slice(0, limit),
    needsReview: needsReview.sort(comparePlanRowsNewestFirst).slice(0, limit),
    readyToAdvance: readyToAdvance.sort(comparePlanRowsNewestFirst).slice(0, limit),
    recentlyCompleted: recentlyCompleted.sort(compareCompletedPlanRows).slice(0, limit)
  };
}
