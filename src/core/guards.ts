import { CARD_STATE_LABELS } from "./labels";
import type { CardState, DailyState, LifeCard } from "./types";

export const ACTIVE_CARD_LIMIT = 3;
export const MAIN_QUEST_LIMIT = 1;
export const CARD_STATES: CardState[] = ["inbox", "active", "parked", "waiting", "done", "killed"];

export { CARD_STATE_LABELS };

export function groupCardsByState(cards: LifeCard[]): Record<CardState, LifeCard[]> {
  return CARD_STATES.reduce<Record<CardState, LifeCard[]>>(
    (groups, state) => ({
      ...groups,
      [state]: cards.filter((card) => card.state === state)
    }),
    {
      inbox: [],
      active: [],
      parked: [],
      waiting: [],
      done: [],
      killed: []
    }
  );
}

export function getActiveLimitStatus(cards: LifeCard[]) {
  const count = cards.filter((card) => card.state === "active").length;

  return {
    count,
    limit: ACTIVE_CARD_LIMIT,
    isAtLimit: count >= ACTIVE_CARD_LIMIT,
    isOverLimit: count > ACTIVE_CARD_LIMIT
  };
}

export function getMainQuest(cards: LifeCard[], dailyState: DailyState) {
  if (!dailyState.mainQuestId) {
    return undefined;
  }

  return cards.find((card) => card.id === dailyState.mainQuestId);
}

export function canActivateCard(cards: LifeCard[], cardId: string): { ok: boolean; message?: string } {
  const card = cards.find((item) => item.id === cardId);
  if (!card) {
    return { ok: false, message: "Card not found." };
  }

  if (card.state === "active") {
    return { ok: true };
  }

  const { count } = getActiveLimitStatus(cards);
  if (count >= ACTIVE_CARD_LIMIT) {
    return {
      ok: false,
      message: `Active is full (${ACTIVE_CARD_LIMIT}/${ACTIVE_CARD_LIMIT}). Park, wait, finish, or kill one first.`
    };
  }

  return { ok: true };
}
