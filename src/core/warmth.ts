import type { CardState, LifeCard, LifeLogEntry, Warmth } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeWarmthFromAge(daysSinceTouch: number): Warmth {
  if (daysSinceTouch <= 1) {
    return "hot";
  }
  if (daysSinceTouch <= 3) {
    return "warm";
  }
  if (daysSinceTouch <= 7) {
    return "cooling";
  }
  if (daysSinceTouch <= 14) {
    return "cold";
  }
  return "dormant";
}

export function daysSince(isoTimestamp: string, now: Date): number {
  const touched = new Date(isoTimestamp).getTime();
  return (now.getTime() - touched) / MS_PER_DAY;
}

export function getEffectiveLastTouched(card: LifeCard, logs: LifeLogEntry[]): string | undefined {
  const cardTouch = card.lastTouched ? new Date(card.lastTouched).getTime() : undefined;
  const linkedLogs = logs.filter((log) => log.cardId === card.id);
  const latestLogTime = linkedLogs.reduce<number | undefined>((latest, log) => {
    const time = new Date(log.timestamp).getTime();
    if (latest === undefined || time > latest) {
      return time;
    }
    return latest;
  }, undefined);

  if (cardTouch === undefined && latestLogTime === undefined) {
    return undefined;
  }

  const maxTime = Math.max(cardTouch ?? 0, latestLogTime ?? 0);
  return new Date(maxTime).toISOString();
}

export function computeCardWarmth(card: LifeCard, logs: LifeLogEntry[], now: Date): Warmth {
  const effective = getEffectiveLastTouched(card, logs);
  if (!effective) {
    return "dormant";
  }
  return computeWarmthFromAge(daysSince(effective, now));
}

export function isTerminalState(state: CardState): boolean {
  return state === "done" || state === "killed";
}

export function isWaitingCard(card: LifeCard): boolean {
  return card.state === "waiting";
}

export function isNeglectCandidate(card: LifeCard): boolean {
  return card.state === "active" || card.state === "parked";
}

export function shouldFlagAsNeglected(card: LifeCard, warmth: Warmth): boolean {
  if (card.state !== "active") {
    return false;
  }
  return warmth === "cold" || warmth === "dormant";
}

export function shouldSuggestReheat(card: LifeCard, warmth: Warmth): boolean {
  if (isTerminalState(card.state) || isWaitingCard(card)) {
    return false;
  }
  if (!isNeglectCandidate(card)) {
    return false;
  }
  return warmth === "cold" || warmth === "dormant";
}

export function isCooledWhileWaiting(card: LifeCard, warmth: Warmth): boolean {
  return isWaitingCard(card) && (warmth === "cooling" || warmth === "cold" || warmth === "dormant");
}

export const WARMTH_RANK: Record<Warmth, number> = {
  dormant: 0,
  cold: 1,
  cooling: 2,
  warm: 3,
  hot: 4
};
