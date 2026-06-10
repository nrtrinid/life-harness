import type { AiContextPacket, BoardCardSlice, ContextRankTier, ContextSource, RankedSlice } from "./contextPacket";
import { DEFAULT_GATEWAY_MAX_INPUT_CHARS, GATEWAY_PROMPT_SAFETY_MARGIN_CHARS } from "./harnessContext";
import {
  estimateChatHarnessPromptChars,
  scoreCompactCardPriority,
  type HarnessContextCard,
  type HarnessExportInput
} from "./harnessContext";
import { getFollowUpsDue } from "./career";
import type { LifeCard, LifeLogEntry, PrimaryAction, ProofItem, SensitivityLevel } from "./types";
import { computeCardWarmth, shouldFlagAsNeglected, shouldSuggestReheat } from "./warmth";

const STALE_CAP = 8;
const PROOF_CAP = 20;
const PROOF_COMPACT_CAP = 5;
const MEMORY_BANK_CAP = 10;
const CHAT_MEMORY_CAP = 5;
const MEDIUM_TEXT_LIMIT = 80;

export type CardRankInput = {
  card: LifeCard;
  harnessCard: HarnessContextCard;
  warmth: ReturnType<typeof computeCardWarmth>;
  primaryAction?: PrimaryAction;
  userMessage: string;
  mode: string;
  now: Date;
  data: HarnessExportInput;
};

export function isPounceOrNextActionIntent(message: string, mode: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("pounce") ||
    lower.includes("what should i do next") ||
    lower.includes("today's one") ||
    lower.includes("todays one") ||
    lower.includes("one move") ||
    (mode === "operator" && (lower.includes("next") || lower.includes("today")))
  );
}

export function computeCardRankScore(input: CardRankInput): number {
  const { card, harnessCard, warmth, primaryAction, userMessage, now, data } = input;
  let score = scoreCompactCardPriority(harnessCard);

  if (card.state === "active" && shouldFlagAsNeglected(card, warmth)) {
    score += 20;
  }

  const dueFollowUps = getFollowUpsDue(data.cards, now);
  if (dueFollowUps.some((item) => item.id === card.id)) {
    score += 15;
  }

  if (primaryAction?.cardId === card.id) {
    score += 10;
  }

  const titleLower = harnessCard.title.toLowerCase();
  const messageLower = userMessage.toLowerCase();
  if (titleLower.split(/\s+/).some((token) => token.length >= 4 && messageLower.includes(token))) {
    score += 10;
  }

  if (isPounceOrNextActionIntent(userMessage, input.mode)) {
    if (card.area === "social_career") {
      score += 15;
      if (
        card.state === "parked" ||
        warmth === "cold" ||
        warmth === "dormant" ||
        warmth === "cooling"
      ) {
        score += 15;
      }
      if (isStaleCardBucket(card, warmth)) {
        score += 10;
      }
    }

    if (card.area === "build" && card.state === "active") {
      score -= 20;
    }
  }

  if (harnessCard.title.startsWith("Resume:")) {
    score -= 30;
  }

  if (harnessCard.state === "Parked" && (harnessCard.warmth === "Hot" || harnessCard.warmth === "Warm")) {
    score -= 20;
  }

  return score;
}

export function cardRankTier(score: number): ContextRankTier {
  if (score >= 90) {
    return "high";
  }
  if (score >= 70) {
    return "medium";
  }
  if (score >= 40) {
    return "low";
  }
  return "filler";
}

export function isStaleCardBucket(
  card: LifeCard,
  warmth: ReturnType<typeof computeCardWarmth>
): boolean {
  if (card.state === "active") {
    return shouldFlagAsNeglected(card, warmth);
  }

  if (shouldSuggestReheat(card, warmth)) {
    return true;
  }

  return (
    card.state === "parked" &&
    (card.area === "social_career" || warmth === "cold" || warmth === "dormant")
  );
}

export function rankCardSlice(
  payload: BoardCardSlice,
  input: CardRankInput,
  source: ContextSource
): RankedSlice<BoardCardSlice> {
  const rank = computeCardRankScore(input);
  return {
    source,
    tier: cardRankTier(rank),
    rank,
    sensitivity: input.card.sensitivity ?? "S1",
    payload: { ...payload, isStale: source === "stale_cards" }
  };
}

export function rankProofSlices(
  proofItems: ProofItem[],
  cap = PROOF_CAP
): RankedSlice<{ proofId: string; summary: string; timestamp: string }>[] {
  return [...proofItems]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, cap)
    .map((item, index) => ({
      source: "recent_proof" as const,
      tier: "medium" as const,
      rank: 40 - index,
      sensitivity: "S1" as SensitivityLevel,
      payload: {
        proofId: item.id,
        summary: item.title,
        timestamp: item.timestamp
      }
    }));
}

export function estimatePacketPromptChars(packet: AiContextPacket): number {
  return estimateChatHarnessPromptChars(packet.board.harness, {
    message: packet.userIntent.message
  });
}

export function getPacketSliceCounts(packet: AiContextPacket): {
  active: number;
  stale: number;
  proof: number;
  memory: number;
  recovery: number;
} {
  return {
    active: packet.activeCards.length,
    stale: packet.staleCards.length,
    proof: packet.recentProof.length,
    memory: packet.memories.length,
    recovery: packet.recoverySignals.length
  };
}

function truncateText(text: string, limit = MEDIUM_TEXT_LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

export function applyPacketBudget(
  packet: AiContextPacket,
  options: { maxChars?: number } = {}
): AiContextPacket {
  const maxChars =
    options.maxChars ?? DEFAULT_GATEWAY_MAX_INPUT_CHARS - GATEWAY_PROMPT_SAFETY_MARGIN_CHARS;
  let working = structuredClone(packet);
  working.budget.maxChars = maxChars;

  const estimate = () => estimatePacketPromptChars(working);
  working.budget.estimatedChars = estimate();

  if (estimate() <= maxChars) {
    working.budget.compactionLevel = "none";
    return working;
  }

  working.budget.compactionLevel = "trim_low";
  working.projectDocs = [];
  working.budget.droppedSources = [
    ...new Set<ContextSource>([...working.budget.droppedSources, "project_doc"])
  ];

  if (estimate() <= maxChars) {
    working.budget.estimatedChars = estimate();
    return working;
  }

  working.budget.compactionLevel = "compact";
  working.recentProof = working.recentProof.slice(0, PROOF_COMPACT_CAP);
  working.memories = working.memories.slice(0, MEMORY_BANK_CAP / 2 + CHAT_MEMORY_CAP / 2);
  working.staleCards = working.staleCards.slice(0, Math.min(STALE_CAP, 4));
  working.companion.briefingPrepared = working.companion.briefingPrepared.slice(0, 3);
  working.companion.briefingDetected = working.companion.briefingDetected.slice(0, 3);

  if (estimate() <= maxChars) {
    working.budget.estimatedChars = estimate();
    return working;
  }

  working.budget.compactionLevel = "aggressive";
  while (working.staleCards.length > 0 && estimate() > maxChars) {
    working.staleCards.pop();
    working.budget.droppedSources = [
      ...new Set<ContextSource>([...working.budget.droppedSources, "stale_cards"])
    ];
  }

  for (const slice of working.activeCards) {
    slice.payload.nextTinyAction = truncateText(slice.payload.nextTinyAction);
    slice.payload.whyItMatters = truncateText(slice.payload.whyItMatters);
  }

  working.budget.estimatedChars = estimate();
  return working;
}
