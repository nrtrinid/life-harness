import { getActiveLimitStatus } from "./guards";
import type { DailyState, LifeCard } from "./types";
import { SEED_DEMO_CARD_IDS } from "../data/seed";

const SEED_DEMO_ID_SET = new Set<string>(SEED_DEMO_CARD_IDS);

export function hasDemoSeedCards(cards: LifeCard[]): boolean {
  return cards.some((card) => SEED_DEMO_ID_SET.has(card.id));
}

export function shouldShowDemoTriageBanner(
  cards: LifeCard[],
  dailyState: DailyState
): boolean {
  if (dailyState.demoTriageDismissedAt) {
    return false;
  }
  return hasDemoSeedCards(cards) || getActiveLimitStatus(cards).isOverLimit;
}

export function applyDismissDemoTriage(dailyState: DailyState, nowIso: string): DailyState {
  return {
    ...dailyState,
    demoTriageDismissedAt: nowIso
  };
}
