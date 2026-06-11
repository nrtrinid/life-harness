import { buildAgentWorkbenchSummary } from "./agentWorkbench";
import { generateWhileYouWereAway } from "./briefing";
import { buildCareerHubSummary } from "./careerHub";
import { getFollowUpsDue } from "./career";
import { shouldIncludeCard } from "./contextPacketRedaction";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus, getMainQuest } from "./guards";
import type { LifeHarnessData } from "./lifeHarnessData";
import { computeRecoveryVisibility } from "./recovery";
import {
  computeCardWarmth,
  shouldFlagAsNeglected,
  WARMTH_RANK
} from "./warmth";
import type { LifeCard, LifeLogEntry } from "./types";

export type NextMoveSource =
  | "board"
  | "career"
  | "agent"
  | "recovery"
  | "companion";

export type NextMoveUrgency = "low" | "medium" | "high";

export type NextMoveContract = {
  id: string;
  source: NextMoveSource;
  title: string;
  whyNow: string;
  doAction: string;
  improveLock?: string;
  proofOnDone: string;
  targetRoute?: string;
  cardId?: string;
  urgency: NextMoveUrgency;
  effortMinutes: 5 | 10 | 25;
  pressureLabel: string;
  createdAt: string;
};

export type NextMoveSummary = {
  primary?: NextMoveContract;
  backup?: NextMoveContract;
  candidates: NextMoveContract[];
};

export type NextMoveOptions = {
  now?: Date;
};

const URGENCY_SCORE: Record<NextMoveUrgency, number> = {
  high: 300,
  medium: 200,
  low: 100
};

const SOURCE_PRIORITY: Record<NextMoveSource, number> = {
  career: 5,
  agent: 4,
  board: 3,
  recovery: 2,
  companion: 1
};

const IMPROVE_LOCK = "Do not improve the system until this move is done.";

function defaultNow(options?: NextMoveOptions): Date {
  return options?.now ?? new Date();
}

function contractId(prefix: string, key: string): string {
  return `${prefix}-${key}`;
}

function filterEligibleCard(card: LifeCard): boolean {
  return shouldIncludeCard(card);
}

function inferEffortMinutes(doAction: string): 5 | 10 | 25 {
  const length = doAction.trim().length;
  if (length <= 40) {
    return 5;
  }
  if (length >= 120) {
    return 25;
  }
  return 10;
}

function baseContract(
  partial: Omit<NextMoveContract, "createdAt" | "effortMinutes"> & {
    effortMinutes?: 5 | 10 | 25;
  },
  now: Date
): NextMoveContract {
  return {
    ...partial,
    effortMinutes: partial.effortMinutes ?? inferEffortMinutes(partial.doAction),
    createdAt: now.toISOString()
  };
}

function pickColdestActive(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  now: Date
): LifeCard | undefined {
  const active = cards
    .filter((card) => card.state === "active" && filterEligibleCard(card))
    .map((card) => ({ card, warmth: computeCardWarmth(card, logs, now) }))
    .sort((a, b) => WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth]);

  return active[0]?.card;
}

function boardCardContract(
  card: LifeCard,
  options: {
    id: string;
    title: string;
    whyNow: string;
    pressureLabel: string;
    urgency: NextMoveUrgency;
  },
  now: Date
): NextMoveContract {
  return baseContract(
    {
      id: options.id,
      source: "board",
      title: options.title,
      whyNow: options.whyNow,
      doAction: card.nextTinyAction,
      improveLock: IMPROVE_LOCK,
      proofOnDone: `Moved ${card.title} forward.`,
      targetRoute: `/card/${card.id}`,
      cardId: card.id,
      urgency: options.urgency,
      pressureLabel: options.pressureLabel
    },
    now
  );
}

function collectBoardContracts(data: LifeHarnessData, now: Date): NextMoveContract[] {
  const { cards, logs, dailyState } = data;
  const contracts: NextMoveContract[] = [];
  const activeLimit = getActiveLimitStatus(cards);

  if (activeLimit.isOverLimit) {
    const parkTarget =
      pickColdestActive(cards, logs, now) ??
      cards.find((card) => card.state === "active" && filterEligibleCard(card));

    contracts.push(
      baseContract(
        {
          id: contractId("board", "overlimit"),
          source: "board",
          title: parkTarget ? `Park ${parkTarget.title}` : "Park one active card",
          whyNow: `You have ${activeLimit.count} active cards; limit is ${ACTIVE_CARD_LIMIT}. Lighten the board before adding more.`,
          doAction: parkTarget?.nextTinyAction ?? "Move one card to Parked on the board.",
          improveLock: IMPROVE_LOCK,
          proofOnDone: parkTarget
            ? `Parked ${parkTarget.title} to get back under the active limit.`
            : "Got back under the active limit.",
          targetRoute: "/board",
          cardId: parkTarget?.id,
          urgency: "high",
          pressureLabel: "Active over limit"
        },
        now
      )
    );
  }

  const mainQuest = getMainQuest(cards, dailyState);
  if (mainQuest && filterEligibleCard(mainQuest) && mainQuest.nextTinyAction?.trim()) {
    contracts.push(
      boardCardContract(
        mainQuest,
        {
          id: contractId("board", `mainquest-${mainQuest.id}`),
          title: `Advance main quest: ${mainQuest.title}`,
          whyNow: "Main quest is the clearest path forward.",
          pressureLabel: "Main quest",
          urgency: "high"
        },
        now
      )
    );
  }

  for (const card of cards) {
    if (card.state !== "active" || !filterEligibleCard(card) || !card.nextTinyAction?.trim()) {
      continue;
    }

    if (mainQuest?.id === card.id) {
      continue;
    }

    contracts.push(
      boardCardContract(
        card,
        {
          id: contractId("board", `active-${card.id}`),
          title: "Move the active card forward",
          whyNow: "This is already active and has a clear next action.",
          pressureLabel: "Active card",
          urgency: "medium"
        },
        now
      )
    );
  }

  for (const card of cards) {
    if (card.state !== "active" || !filterEligibleCard(card)) {
      continue;
    }

    const warmth = computeCardWarmth(card, logs, now);
    if (!shouldFlagAsNeglected(card, warmth)) {
      continue;
    }

    if (contracts.some((contract) => contract.cardId === card.id)) {
      continue;
    }

    contracts.push(
      boardCardContract(
        card,
        {
          id: contractId("board", `cold-${card.id}`),
          title: `Reheat ${card.title}`,
          whyNow: `${card.title} is ${warmth} — a small touch can reheat it.`,
          pressureLabel: "Cold project",
          urgency: "medium"
        },
        now
      )
    );
  }

  return contracts.slice(0, 3);
}

function collectCareerContracts(data: LifeHarnessData, now: Date): NextMoveContract[] {
  const eligibleCards = data.cards.filter(filterEligibleCard);
  const followUps = getFollowUpsDue(eligibleCards, now).filter(filterEligibleCard);

  if (followUps.length > 0) {
    const card = followUps[0];
    return [
      baseContract(
        {
          id: contractId("career", `followup-${card.id}`),
          source: "career",
          title: `Follow up: ${card.title}`,
          whyNow: "Follow-up is due today.",
          doAction: card.nextTinyAction ?? "Send one follow-up.",
          improveLock: IMPROVE_LOCK,
          proofOnDone: "Sent one external-world follow-up.",
          targetRoute: `/card/${card.id}`,
          cardId: card.id,
          urgency: "high",
          pressureLabel: "Follow-up due"
        },
        now
      )
    ];
  }

  const hub = buildCareerHubSummary({
    jobCandidates: data.jobCandidates,
    cards: eligibleCards,
    jobSources: data.jobSources,
    jobSourceRuns: data.jobSourceRuns,
    resumeModules: data.resumeModules,
    hasCareerPack: data.careerSourcePack !== null,
    now
  });

  const action = hub.nextAction;
  const pressureLabel =
    action.title.toLowerCase().includes("follow") ? "Follow-up due" : "Cold project";

  return [
    baseContract(
      {
        id: contractId("career", "hub"),
        source: "career",
        title: action.title,
        whyNow: action.reason,
        doAction: action.ctaLabel,
        improveLock: IMPROVE_LOCK,
        proofOnDone: "Sent one external-world follow-up.",
        targetRoute: action.href,
        urgency: "medium",
        pressureLabel
      },
      now
    )
  ];
}

function collectAgentContracts(data: LifeHarnessData, now: Date): NextMoveContract[] {
  const summary = buildAgentWorkbenchSummary(data);
  const contracts: NextMoveContract[] = [];

  const review = summary.needsReview[0];
  if (review) {
    contracts.push(
      baseContract(
        {
          id: contractId("agent", `review-${review.sessionId}`),
          source: "agent",
          title: `Review the ${review.agent} session`,
          whyNow: "An agent session is in motion and needs a result logged.",
          doAction: "Open the card and record what came back.",
          improveLock: IMPROVE_LOCK,
          proofOnDone: "Reviewed agent result and logged outcome.",
          targetRoute: `/card/${review.cardId}`,
          cardId: review.cardId,
          urgency: "high",
          pressureLabel: "Agent result waiting"
        },
        now
      )
    );
  }

  const inMotion = summary.inMotion[0];
  if (inMotion) {
    contracts.push(
      baseContract(
        {
          id: contractId("agent", `inmotion-${inMotion.sessionId}`),
          source: "agent",
          title: `Check the ${inMotion.agent} session`,
          whyNow: "An agent session is in motion and may need a nudge.",
          doAction: "Open the card and check session status.",
          improveLock: IMPROVE_LOCK,
          proofOnDone: "Checked in on the in-motion agent session.",
          targetRoute: `/card/${inMotion.cardId}`,
          cardId: inMotion.cardId,
          urgency: "medium",
          pressureLabel: "Agent result waiting"
        },
        now
      )
    );
  }

  const ready = summary.readyToDelegate[0];
  if (ready) {
    contracts.push(
      baseContract(
        {
          id: contractId("agent", `delegate-${ready.cardId}`),
          source: "agent",
          title: `Delegate: ${ready.title}`,
          whyNow: "This card is project-backed and ready for agent delegation.",
          doAction: ready.nextTinyAction || "Open the card and start a delegation packet.",
          improveLock: IMPROVE_LOCK,
          proofOnDone: "Started or queued one delegation move.",
          targetRoute: `/card/${ready.cardId}`,
          cardId: ready.cardId,
          urgency: "medium",
          pressureLabel: "Ready to delegate"
        },
        now
      )
    );
  }

  return contracts.slice(0, 3);
}

function collectRecoveryContracts(
  data: LifeHarnessData,
  now: Date,
  hasWorkContracts: boolean
): NextMoveContract[] {
  const briefing = generateWhileYouWereAway(
    data.cards,
    data.logs,
    data.proofItems,
    data.dailyState,
    now,
    data.jobCandidates,
    data.jobSources,
    data.jobSourceRuns,
    data.careerSourcePack,
    data.resumeModules
  );
  const recovery = computeRecoveryVisibility(briefing, data.dailyState, now);
  const contracts: NextMoveContract[] = [];

  if (recovery.showSalvage) {
    contracts.push(
      baseContract(
        {
          id: contractId("recovery", "salvage"),
          source: "recovery",
          title: "Stabilize the day",
          whyNow: recovery.salvageReason ?? "Recovery move keeps the day salvageable.",
          doAction: "Take a 10-minute walk or eat something real.",
          proofOnDone: "Did one recovery move.",
          urgency: "high",
          pressureLabel: "Day slipping"
        },
        now
      )
    );
  }

  if (recovery.showMvd) {
    contracts.push(
      baseContract(
        {
          id: contractId("recovery", "mvd"),
          source: "recovery",
          title: "Hit minimum viable day",
          whyNow: "Evening is here and the minimum viable day is not complete yet.",
          doAction: "Do one small capture, move, or proof log.",
          proofOnDone: "Did one recovery move.",
          urgency: "medium",
          pressureLabel: "Day slipping"
        },
        now
      )
    );
  }

  if (!hasWorkContracts) {
    contracts.push(
      baseContract(
        {
          id: contractId("recovery", "fallback"),
          source: "recovery",
          title: "Stabilize the body floor",
          whyNow: "Recovery move keeps the day salvageable.",
          doAction: "Take a 10-minute walk or eat something real.",
          proofOnDone: "Did one recovery move.",
          urgency: "low",
          pressureLabel: "Day slipping"
        },
        now
      )
    );
  }

  return contracts.slice(0, 3);
}

function isWorkContract(contract: NextMoveContract): boolean {
  return contract.source !== "recovery" || contract.urgency !== "low";
}

function scoreContract(
  contract: NextMoveContract,
  data: LifeHarnessData,
  recoveryPromoted: boolean
): number {
  let score = URGENCY_SCORE[contract.urgency];

  if (contract.pressureLabel === "Follow-up due") {
    score += 80;
  }
  if (contract.id.includes("agent-review")) {
    score += 70;
  }
  if (contract.cardId && contract.cardId === data.dailyState.mainQuestId) {
    score += 60;
  }
  if (contract.pressureLabel === "Active over limit") {
    score += 55;
  }
  if (contract.source === "recovery" && recoveryPromoted) {
    score += 50;
  }
  if (contract.pressureLabel === "Ready to delegate") {
    score += 20;
  }

  if (contract.cardId) {
    const card = data.cards.find((entry) => entry.id === contract.cardId);
    if (card?.state === "active") {
      score += 30;
    }
  }

  return score;
}

function compareContracts(
  left: NextMoveContract,
  right: NextMoveContract,
  data: LifeHarnessData,
  recoveryPromoted: boolean
): number {
  const scoreDiff =
    scoreContract(right, data, recoveryPromoted) - scoreContract(left, data, recoveryPromoted);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const sourceDiff = SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  return left.title.localeCompare(right.title);
}

function dedupeByCardId(contracts: NextMoveContract[]): NextMoveContract[] {
  const seenCardIds = new Set<string>();
  const deduped: NextMoveContract[] = [];

  for (const contract of contracts) {
    if (contract.cardId) {
      if (seenCardIds.has(contract.cardId)) {
        continue;
      }
      seenCardIds.add(contract.cardId);
    }
    deduped.push(contract);
  }

  return deduped;
}

function getRecoveryPromoted(data: LifeHarnessData, now: Date): boolean {
  const briefing = generateWhileYouWereAway(
    data.cards,
    data.logs,
    data.proofItems,
    data.dailyState,
    now,
    data.jobCandidates,
    data.jobSources,
    data.jobSourceRuns,
    data.careerSourcePack,
    data.resumeModules
  );
  return computeRecoveryVisibility(briefing, data.dailyState, now).shouldPromote;
}

export function buildNextMoveContracts(
  data: LifeHarnessData,
  options?: NextMoveOptions
): NextMoveContract[] {
  const now = defaultNow(options);
  const board = collectBoardContracts(data, now);
  const career = collectCareerContracts(data, now);
  const agent = collectAgentContracts(data, now);
  const work = [...board, ...career, ...agent];
  const recovery = collectRecoveryContracts(data, now, work.length > 0);

  return [...work, ...recovery];
}

export function rankNextMoveContracts(
  contracts: NextMoveContract[],
  data: LifeHarnessData,
  options?: NextMoveOptions
): NextMoveContract[] {
  const now = defaultNow(options);
  const recoveryPromoted = getRecoveryPromoted(data, now);
  const workContracts = contracts.filter(isWorkContract);
  const hasStrongWork = workContracts.some(
    (contract) => contract.urgency === "high" || contract.urgency === "medium"
  );

  const ranked = [...contracts].sort((left, right) =>
    compareContracts(left, right, data, recoveryPromoted)
  );

  let deduped = dedupeByCardId(ranked);

  if (!hasStrongWork && recoveryPromoted) {
    deduped = [...deduped].sort((left, right) =>
      compareContracts(left, right, data, recoveryPromoted)
    );
  }

  return deduped;
}

const CANDIDATE_CAP = 10;

export function buildNextMoveSummary(
  data: LifeHarnessData,
  options?: NextMoveOptions
): NextMoveSummary {
  const contracts = buildNextMoveContracts(data, options);
  const ranked = rankNextMoveContracts(contracts, data, options);
  const candidates = ranked.slice(0, CANDIDATE_CAP);

  return {
    primary: candidates[0],
    backup: candidates[1],
    candidates
  };
}
