import type { LifeCard } from "./types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "on",
  "in",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "park",
  "parked",
  "worked",
  "coded",
  "built",
  "walked",
  "lifted",
  "ran",
  "ate",
  "texted",
  "emailed",
  "applied",
  "follow",
  "up",
  "bought",
  "subscription",
  "new",
  "idea",
  "one",
  "some",
  "something",
  "real",
  "minutes",
  "minute",
  "send",
  "open",
  "write",
  "tomorrow",
  "first",
  "move",
  "repo",
  "text",
  "walk"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

function scoreCard(card: LifeCard, queryTokens: string[]): number {
  const titleTokens = tokenize(card.title);
  if (titleTokens.length === 0 || queryTokens.length === 0) {
    return 0;
  }

  let matched = 0;
  for (const titleToken of titleTokens) {
    if (queryTokens.some((queryToken) => titleToken.includes(queryToken) || queryToken.includes(titleToken))) {
      matched += 1;
    }
  }

  return matched / titleTokens.length;
}

export function findCardByTitleTokens(cards: LifeCard[], rawText: string): LifeCard | undefined {
  const queryTokens = tokenize(rawText);
  if (queryTokens.length === 0) {
    return undefined;
  }

  let bestCard: LifeCard | undefined;
  let bestScore = 0;

  for (const card of cards) {
    const score = scoreCard(card, queryTokens);
    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  // Require at least one meaningful title token match
  if (bestScore < 1 / Math.max(bestCard ? tokenize(bestCard.title).length : 1, 1)) {
    return undefined;
  }

  return bestCard;
}
