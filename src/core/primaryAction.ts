import { selectPounceCandidate } from "./briefing";
import { getFollowUpsDue } from "./career";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus, getMainQuest } from "./guards";
import {
  computeCardWarmth,
  shouldFlagAsNeglected,
  WARMTH_RANK
} from "./warmth";
import type { Briefing, DailyState, LifeCard, LifeLogEntry, PrimaryAction } from "./types";

const DEEP_LINK_MAP: Array<{ keyword: string; route: string; label: string }> = [
  { keyword: "paste one job", route: "/career?tab=find&add=1", label: "Add a job" },
  { keyword: "review one fetched candidate", route: "/career?tab=review", label: "Review matches" },
  { keyword: "approve one saved candidate", route: "/career?tab=review", label: "Review matches" },
  { keyword: "run due job sources", route: "/job-sources", label: "Run Sources" },
  { keyword: "run one approved job source", route: "/job-sources", label: "Run Sources" },
  { keyword: "send one follow-up", route: "/career", label: "Open Follow-ups" }
];

function pickColdestActive(cards: LifeCard[], logs: LifeLogEntry[], now: Date): LifeCard | undefined {
  const active = cards
    .filter((card) => card.state === "active")
    .map((card) => ({ card, warmth: computeCardWarmth(card, logs, now) }))
    .sort((a, b) => WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth]);

  return active[0]?.card;
}

function pickReheatCard(cards: LifeCard[], logs: LifeLogEntry[], now: Date): LifeCard | undefined {
  return cards.find(
    (card) =>
      card.state === "active" && shouldFlagAsNeglected(card, computeCardWarmth(card, logs, now))
  );
}

function followUpReasonSuffix(cards: LifeCard[], now: Date): string {
  const due = getFollowUpsDue(cards, now);
  if (due.length === 0) {
    return "";
  }
  return ` Also due today: ${due[0].title} follow-up.`;
}

function extractPounceSmallestAction(briefing: Briefing, dailyState: DailyState): string {
  const pounceLine = briefing.prepared.find((line) => line.startsWith("Suggested pounce:"));
  if (pounceLine) {
    return pounceLine.replace("Suggested pounce: ", "");
  }
  return dailyState.smallestStart ?? "Pick one tiny action.";
}

function matchDeepLink(text: string): { route: string; label: string } | undefined {
  const lower = text.toLowerCase();
  for (const { keyword, route, label } of DEEP_LINK_MAP) {
    if (lower.includes(keyword)) {
      return { route, label };
    }
  }
  return undefined;
}

export function computePrimaryAction(
  briefing: Briefing,
  dailyState: DailyState,
  cards: LifeCard[],
  logs: LifeLogEntry[],
  now: Date
): PrimaryAction {
  const activeLimit = getActiveLimitStatus(cards);
  const followUpExtra = followUpReasonSuffix(cards, now);

  if (activeLimit.isOverLimit) {
    const parkTarget = pickColdestActive(cards, logs, now) ?? cards.find((c) => c.state === "active");
    return {
      kind: "park",
      title: parkTarget ? `Park ${parkTarget.title}` : "Park one active card",
      reason: `You have ${activeLimit.count} active cards; limit is ${ACTIVE_CARD_LIMIT}. Lighten the board before adding more.${followUpExtra}`,
      smallestAction: parkTarget?.nextTinyAction ?? "Move one card to Parked on the board.",
      cardId: parkTarget?.id,
      ctaLabel: "Open Board",
      targetRoute: "/board"
    };
  }

  const followUps = getFollowUpsDue(cards, now);
  if (followUps.length > 0) {
    const card = followUps[0];
    return {
      kind: "follow_up",
      title: card.title,
      reason: `Follow-up is due today.`,
      smallestAction: card.nextTinyAction ?? card.careerApplication?.followUpDate ?? "Send one follow-up.",
      cardId: card.id,
      ctaLabel: "Open Card",
      targetRoute: `/card/${card.id}`
    };
  }

  if (dailyState.pounceMission && !dailyState.pounceStarted) {
    const smallestAction = extractPounceSmallestAction(briefing, dailyState);
    const deepLink = matchDeepLink(smallestAction);
    const pounceCard = selectPounceCandidate(cards, logs, dailyState, now);

    return {
      kind: "pounce",
      title: dailyState.pounceMission,
      reason: "One useful move to keep momentum.",
      smallestAction,
      cardId: pounceCard?.id,
      ctaLabel: deepLink?.label ?? "Start Pounce",
      targetRoute: deepLink?.route
    };
  }

  const reheatCard = pickReheatCard(cards, logs, now);
  if (reheatCard) {
    const warmth = computeCardWarmth(reheatCard, logs, now);
    return {
      kind: "reheat",
      title: reheatCard.title,
      reason: `${reheatCard.title} is ${warmth} — a small touch can reheat it.`,
      smallestAction: reheatCard.nextTinyAction ?? "Do the smallest next step.",
      cardId: reheatCard.id,
      ctaLabel: "Open Card",
      targetRoute: `/card/${reheatCard.id}`
    };
  }

  const mainQuest = getMainQuest(cards, dailyState);
  if (mainQuest?.nextTinyAction) {
    return {
      kind: "main_quest",
      title: mainQuest.title,
      reason: "Main quest is the clearest path forward.",
      smallestAction: mainQuest.nextTinyAction,
      cardId: mainQuest.id,
      ctaLabel: "Open Card",
      targetRoute: `/card/${mainQuest.id}`
    };
  }

  if (cards.length === 0) {
    return {
      kind: "capture",
      title: "Capture one idea",
      reason: "Nothing on the board yet — start with one captured thought.",
      smallestAction: "Type a new idea in Quick Capture below.",
      ctaLabel: "Scroll to Capture"
    };
  }

  return {
    kind: "proof",
    title: "Log one proof item",
    reason: "Preserve what you did — even a small win counts.",
    smallestAction: "Open the log and note one real-world move.",
    ctaLabel: "Open Log",
    targetRoute: "/log"
  };
}
