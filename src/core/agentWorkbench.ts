import type { LifeHarnessData } from "./actions";
import { shouldIncludeCard } from "./contextPacketRedaction";
import { getMainQuest } from "./guards";
import { getProjectForCard } from "./projectRegistry";
import type {
  HarnessAgentSession,
  HarnessAgentSessionStatus,
  HarnessAgentKind,
  LifeCard
} from "./types";

export type AgentWorkbenchSessionRow = {
  sessionId: string;
  cardId: string;
  cardTitle: string;
  projectName?: string;
  repoPath?: string;
  agent: HarnessAgentKind;
  status: HarnessAgentSessionStatus;
  taskName: string;
  goal: string;
  resultSummary?: string;
  verificationResult?: string;
  commitHash?: string;
  updatedAt: string;
  completedAt?: string;
};

export type AgentWorkbenchReadyCard = {
  cardId: string;
  title: string;
  state: string;
  area: string;
  projectName?: string;
  repoPath?: string;
  nextTinyAction: string;
  hasVerificationCommands: boolean;
};

export type AgentWorkbenchSummary = {
  needsReview: AgentWorkbenchSessionRow[];
  inMotion: AgentWorkbenchSessionRow[];
  recentlyCompleted: AgentWorkbenchSessionRow[];
  readyToDelegate: AgentWorkbenchReadyCard[];
};

export type AgentWorkbenchSessionBucket = "needsReview" | "inMotion" | "recentlyCompleted";

const IN_FLIGHT_STATUSES: HarnessAgentSessionStatus[] = ["planned", "sent", "reviewing"];

const READY_DELEGATE_STATES = new Set<LifeCard["state"]>(["active", "waiting", "inbox"]);

export function sessionHasAgentResult(session: HarnessAgentSession): boolean {
  if (session.resultSummary?.trim()) {
    return true;
  }
  if (session.verificationResult?.trim()) {
    return true;
  }
  if (session.commitHash?.trim()) {
    return true;
  }
  return (session.filesChanged?.length ?? 0) > 0;
}

export function isAgentWorkbenchEligibleCard(card: LifeCard): boolean {
  return shouldIncludeCard(card);
}

export function countInFlightAgentSessionsForCard(
  data: LifeHarnessData,
  cardId: string
): number {
  return data.agentSessions.filter(
    (session) => session.cardId === cardId && IN_FLIGHT_STATUSES.includes(session.status)
  ).length;
}

export function classifyAgentWorkbenchSession(
  session: HarnessAgentSession
): AgentWorkbenchSessionBucket | null {
  if (session.status === "done") {
    return "recentlyCompleted";
  }

  if (session.status === "reviewing") {
    return "needsReview";
  }

  if (session.status === "sent") {
    return sessionHasAgentResult(session) ? "needsReview" : "inMotion";
  }

  if (session.status === "planned") {
    return "inMotion";
  }

  return null;
}

function findCard(data: LifeHarnessData, cardId: string): LifeCard | undefined {
  return data.cards.find((card) => card.id === cardId);
}

export function buildAgentWorkbenchSessionRow(
  data: LifeHarnessData,
  session: HarnessAgentSession
): AgentWorkbenchSessionRow | null {
  const card = findCard(data, session.cardId);
  if (!card || !isAgentWorkbenchEligibleCard(card)) {
    return null;
  }

  const project = getProjectForCard(data, session.cardId);

  return {
    sessionId: session.id,
    cardId: session.cardId,
    cardTitle: card.title,
    projectName: project?.name,
    repoPath: project?.repoPath,
    agent: session.agent,
    status: session.status,
    taskName: session.taskName,
    goal: session.goal,
    resultSummary: session.resultSummary,
    verificationResult: session.verificationResult,
    commitHash: session.commitHash,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt
  };
}

function sessionSortKey(session: HarnessAgentSession): string {
  if (session.status === "done") {
    return session.completedAt ?? session.updatedAt;
  }

  return session.updatedAt;
}

function compareSessionsNewestFirst(left: HarnessAgentSession, right: HarnessAgentSession): number {
  return sessionSortKey(right).localeCompare(sessionSortKey(left));
}

function isReadyToDelegateCard(data: LifeHarnessData, card: LifeCard): boolean {
  if (!isAgentWorkbenchEligibleCard(card)) {
    return false;
  }

  if (!READY_DELEGATE_STATES.has(card.state)) {
    return false;
  }

  if (!getProjectForCard(data, card.id)) {
    return false;
  }

  if (countInFlightAgentSessionsForCard(data, card.id) > 0) {
    return false;
  }

  const areaRelevant =
    card.area === "build" ||
    card.area === "social_career" ||
    Boolean(card.careerApplication);

  return areaRelevant;
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

function compareReadyCards(
  data: LifeHarnessData,
  left: LifeCard,
  right: LifeCard
): number {
  const scoreDiff = readyCardPriority(data, right) - readyCardPriority(data, left);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return left.title.localeCompare(right.title);
}

export function buildAgentWorkbenchReadyCard(
  data: LifeHarnessData,
  card: LifeCard
): AgentWorkbenchReadyCard | null {
  if (!isReadyToDelegateCard(data, card)) {
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
    hasVerificationCommands: (project?.verificationCommands?.length ?? 0) > 0
  };
}

export function buildAgentWorkbenchSummary(
  data: LifeHarnessData,
  options: { now?: Date; completedLimit?: number; readyLimit?: number } = {}
): AgentWorkbenchSummary {
  const completedLimit = options.completedLimit ?? 8;
  const readyLimit = options.readyLimit ?? 8;

  const needsReview: AgentWorkbenchSessionRow[] = [];
  const inMotion: AgentWorkbenchSessionRow[] = [];
  const recentlyCompleted: AgentWorkbenchSessionRow[] = [];

  const eligibleSessions = data.agentSessions
    .filter((session) => {
      const card = findCard(data, session.cardId);
      return card && isAgentWorkbenchEligibleCard(card);
    })
    .sort(compareSessionsNewestFirst);

  for (const session of eligibleSessions) {
    const row = buildAgentWorkbenchSessionRow(data, session);
    if (!row) {
      continue;
    }

    const bucket = classifyAgentWorkbenchSession(session);
    if (bucket === "needsReview") {
      needsReview.push(row);
    } else if (bucket === "inMotion") {
      inMotion.push(row);
    } else if (bucket === "recentlyCompleted") {
      recentlyCompleted.push(row);
    }
  }

  const readyToDelegate = data.cards
    .filter((card) => isReadyToDelegateCard(data, card))
    .sort((left, right) => compareReadyCards(data, left, right))
    .slice(0, readyLimit)
    .map((card) => buildAgentWorkbenchReadyCard(data, card))
    .filter((row): row is AgentWorkbenchReadyCard => row !== null);

  return {
    needsReview,
    inMotion,
    recentlyCompleted: recentlyCompleted.slice(0, completedLimit),
    readyToDelegate
  };
}
