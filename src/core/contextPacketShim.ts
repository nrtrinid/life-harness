import type { AiContextPacket } from "./contextPacket";
import {
  trimConversationHistoryForPromptBudget,
  type ConversationTurn,
  type HarnessContext,
  type HarnessContextCard
} from "./harnessContext";
import { DEFAULT_GATEWAY_MAX_INPUT_CHARS, GATEWAY_PROMPT_SAFETY_MARGIN_CHARS } from "./harnessContext";
import { estimatePacketPromptChars, getPacketSliceCounts } from "./contextPacketRanking";
import type { BoardCardSlice } from "./contextPacket";

const EXCLUDED_S3_CARD_PREFIX = "Excluded S3 card: ";

function excludedTitlesFromPacket(packet: AiContextPacket): Set<string> {
  return new Set(
    packet.redaction.notes
      .filter((note) => note.startsWith(EXCLUDED_S3_CARD_PREFIX))
      .map((note) => note.slice(EXCLUDED_S3_CARD_PREFIX.length))
  );
}

function sliceToHarnessCard(slice: BoardCardSlice): HarnessContextCard {
  return {
    title: slice.title,
    area: slice.area as HarnessContextCard["area"],
    state: slice.state as HarnessContextCard["state"],
    progress: slice.progress,
    warmth: slice.warmth as HarnessContextCard["warmth"],
    next_tiny_action: slice.nextTinyAction,
    why_it_matters: slice.whyItMatters
  };
}

export function packetToHarnessContext(packet: AiContextPacket): HarnessContext {
  const excludedTitles = excludedTitlesFromPacket(packet);

  const rankedCards = [...packet.activeCards, ...packet.staleCards]
    .sort((left, right) => right.rank - left.rank)
    .map((slice) => sliceToHarnessCard(slice.payload))
    .filter((card) => !excludedTitles.has(card.title));

  const rankedTitles = new Set(rankedCards.map((card) => card.title));
  const supplemental = packet.board.harness.cards.filter(
    (card) =>
      !excludedTitles.has(card.title) &&
      !rankedTitles.has(card.title) &&
      (card.state === "Inbox" || card.state === "Waiting")
  );

  const mergedCards = [...rankedCards, ...supplemental];

  const proofItems = packet.recentProof.map((slice) => ({
    summary: slice.payload.summary,
    timestamp: slice.payload.timestamp
  }));

  return {
    cards: mergedCards,
    logs: packet.board.harness.logs,
    proof_items: proofItems.length > 0 ? proofItems : packet.board.harness.proof_items,
    recent_analyses: packet.board.harness.recent_analyses,
    decisions: packet.board.harness.decisions
  };
}

export function resolveSendBundleFromPacket(
  packet: AiContextPacket,
  options: {
    conversationHistory?: ConversationTurn[];
    message?: string;
    threadStateJsonChars?: number;
  } = {}
): { context: HarnessContext; conversationHistory: ConversationTurn[] } {
  const context = packetToHarnessContext(packet);
  const message = options.message ?? packet.userIntent.message;
  const history = options.conversationHistory ?? [];
  const maxPromptChars = DEFAULT_GATEWAY_MAX_INPUT_CHARS - GATEWAY_PROMPT_SAFETY_MARGIN_CHARS;

  const conversationHistory = trimConversationHistoryForPromptBudget(
    history,
    context,
    message,
    maxPromptChars,
    options.threadStateJsonChars ?? 0
  );

  return { context, conversationHistory };
}

export function formatPacketSliceSummary(packet: AiContextPacket): string {
  const counts = getPacketSliceCounts(packet);
  const headroom = Math.max(0, packet.budget.maxChars - packet.budget.estimatedChars);
  const headroomLabel =
    headroom >= 1000 ? `~${(headroom / 1000).toFixed(1)}k` : `~${headroom}`;

  return [
    `${counts.active} active`,
    `${counts.stale} stale`,
    `${counts.proof} proof`,
    `${counts.memory} memory`,
    `${counts.recovery} recovery`,
    packet.budget.compactionLevel,
    `${headroomLabel} headroom`
  ].join(" · ");
}

export function estimatePacketHeadroom(packet: AiContextPacket): number {
  return Math.max(0, packet.budget.maxChars - estimatePacketPromptChars(packet));
}
