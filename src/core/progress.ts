import { WARMTH_LABELS } from "./labels";
import { checkCareerUseBeforeImproveLocks } from "./career";
import { computeCardWarmth, isTerminalState, isWaitingCard, shouldSuggestReheat } from "./warmth";
import type { JobCandidate, JobSourceRunResult, LifeCard, LifeLogEntry, LogType, Warmth } from "./types";

const WEEKLY_LOG_TYPES = new Set<LogType>(["win", "pounce", "salvage", "mvd", "clarity"]);

const TRACKED_STATES = new Set<LifeCard["state"]>(["active", "parked"]);

const PROGRESS_PER_WIN = 5;
const PROGRESS_CAP = 100;

export function computeCardProgress(
  card: LifeCard,
  logs: LifeLogEntry[],
  sessionStartedAt?: string
): number {
  const sessionWins = logs.filter(
    (log) =>
      log.cardId === card.id &&
      log.type === "win" &&
      (!sessionStartedAt || log.timestamp >= sessionStartedAt)
  ).length;
  return Math.min(PROGRESS_CAP, card.progress + sessionWins * PROGRESS_PER_WIN);
}

export function buildProgressSummary(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  sessionStartedAt?: string
) {
  const weeklyXp = logs.filter((log) => WEEKLY_LOG_TYPES.has(log.type)).reduce((total, log) => total + log.xp, 0);

  return {
    weeklyXp,
    pounceSessions: logs.filter((log) => log.type === "pounce").length,
    salvageWins: logs.filter((log) => log.type === "salvage").length,
    questProgress: cards
      .filter((card) => card.state === "active" || card.state === "parked")
      .map((card) => ({
        id: card.id,
        title: card.title,
        progress: computeCardProgress(card, logs, sessionStartedAt)
      }))
  };
}

export function buildMomentumWarmth(cards: LifeCard[], logs: LifeLogEntry[], now: Date) {
  const warmthOrder: Warmth[] = ["hot", "warm", "cooling", "cold", "dormant"];
  const tracked = cards.filter((card) => TRACKED_STATES.has(card.state));

  return warmthOrder.map((warmth) => ({
    warmth,
    label: WARMTH_LABELS[warmth],
    count: tracked.filter((card) => computeCardWarmth(card, logs, now) === warmth).length
  }));
}

export function buildCardWarmthList(cards: LifeCard[], logs: LifeLogEntry[], now: Date) {
  return cards
    .filter((card) => TRACKED_STATES.has(card.state))
    .map((card) => ({
      id: card.id,
      title: card.title,
      warmth: computeCardWarmth(card, logs, now),
      warmthLabel: WARMTH_LABELS[computeCardWarmth(card, logs, now)]
    }));
}

export function buildColdDormantProjects(cards: LifeCard[], logs: LifeLogEntry[], now: Date) {
  return cards
    .filter((card) => {
      if (isTerminalState(card.state) || isWaitingCard(card)) {
        return false;
      }
      if (!TRACKED_STATES.has(card.state)) {
        return false;
      }
      const warmth = computeCardWarmth(card, logs, now);
      return shouldSuggestReheat(card, warmth);
    })
    .map((card) => ({
      id: card.id,
      title: card.title,
      state: card.state,
      warmth: computeCardWarmth(card, logs, now),
      warmthLabel: WARMTH_LABELS[computeCardWarmth(card, logs, now)],
      nextTinyAction: card.nextTinyAction
    }));
}

export function checkUseBeforeImproveLocks(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  jobCandidates: JobCandidate[] = [],
  jobSourceRuns: JobSourceRunResult[] = []
) {
  return checkCareerUseBeforeImproveLocks(cards, logs, jobCandidates, jobSourceRuns);
}
