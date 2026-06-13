import type { CardState, LifeCard } from "./types";

export type QuestStartKind = "activate" | "openDetail" | "hidden";

export type QuestStartAction = {
  kind: QuestStartKind;
  label: string;
};

export type QuestStateSecondaryAction = {
  kind: "setState";
  state: CardState;
  label: string;
};

export type QuestViewDetailAction = {
  kind: "viewDetail";
  label: string;
};

export type QuestSecondaryAction = QuestStateSecondaryAction | QuestViewDetailAction;

/** Mirrors legacy CardStateButtons targets (inbox is never a button target). */
export const LEGACY_STATE_BUTTON_TARGETS: CardState[] = ["active", "parked", "waiting", "done", "killed"];

const SECONDARY_STATE_LABELS: Record<CardState, string> = {
  inbox: "Inbox",
  active: "Activate",
  parked: "Park",
  waiting: "Move to waiting",
  done: "Done",
  killed: "Archive"
};

export function getQuestStartAction(card: Pick<LifeCard, "state">): QuestStartAction {
  switch (card.state) {
    case "inbox":
    case "parked":
    case "waiting":
      return { kind: "activate", label: "Start" };
    case "active":
      return { kind: "openDetail", label: "Continue" };
    case "done":
    case "killed":
      return { kind: "hidden", label: "" };
  }
}

export function isQuestDoneAvailable(card: Pick<LifeCard, "state">): boolean {
  return card.state !== "done" && card.state !== "killed";
}

function secondaryStateLabel(state: CardState, currentState: CardState): string {
  if (state === "active" && (currentState === "done" || currentState === "killed")) {
    return "Reopen";
  }
  return SECONDARY_STATE_LABELS[state];
}

function shouldOfferSecondaryState(state: CardState, currentState: CardState): boolean {
  if (state === currentState) {
    return false;
  }

  if (state === "active") {
    if (currentState === "done" || currentState === "killed") {
      return true;
    }
    if (currentState === "inbox" || currentState === "parked" || currentState === "waiting") {
      return false;
    }
    return false;
  }

  if (state === "done" && currentState !== "done" && currentState !== "killed") {
    return false;
  }

  return LEGACY_STATE_BUTTON_TARGETS.includes(state);
}

export function getQuestSecondaryActions(card: Pick<LifeCard, "state">): QuestSecondaryAction[] {
  const stateActions: QuestStateSecondaryAction[] = LEGACY_STATE_BUTTON_TARGETS.filter((state) =>
    shouldOfferSecondaryState(state, card.state)
  ).map((state) => ({
    kind: "setState" as const,
    state,
    label: secondaryStateLabel(state, card.state)
  }));

  return [...stateActions, { kind: "viewDetail", label: "View detail" }];
}

/** Every legacy button target still reachable via Start / Done / More. */
export function getLegacyReachableStates(card: Pick<LifeCard, "state">): CardState[] {
  return LEGACY_STATE_BUTTON_TARGETS.filter((state) => state !== card.state);
}

export function getQuestReachableStates(card: Pick<LifeCard, "state">): CardState[] {
  const reachable = new Set<CardState>();

  const start = getQuestStartAction(card);
  if (start.kind === "activate") {
    reachable.add("active");
  }

  if (isQuestDoneAvailable(card)) {
    reachable.add("done");
  }

  for (const action of getQuestSecondaryActions(card)) {
    if (action.kind === "setState") {
      reachable.add(action.state);
    }
  }

  return LEGACY_STATE_BUTTON_TARGETS.filter((state) => reachable.has(state));
}
