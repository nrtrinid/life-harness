import { buildAssistantActionSchemaHint } from "./assistantActionRegistry";
import {
  routeCapabilities,
  routingToToolPermissions,
  type HarnessRoute
} from "./capabilityRouter";
import {
  buildUntrustedBlocksFromRouting,
  resolveTrustedUserMessage
} from "./untrustedContextBlock";
import { generateWhileYouWereAway } from "./briefing";
import {
  createEmptySharedChatThreadState,
  classifyTurnIntent,
  toWireChatHarnessThreadState,
  type SharedChatThreadState
} from "./chatThreadState";
import type { AiContextPacket, RankedSlice, RetrievedMemory } from "./contextPacket";
import {
  assertRequestSensitivityAllowed,
  filterPinnedFacts,
  redactCardSlice,
  redactLogSummary,
  shouldIncludeCard,
  shouldIncludeLog
} from "./contextPacketRedaction";
import {
  applyPacketBudget,
  isStaleCardBucket,
  rankCardSlice,
  rankProofSlices
} from "./contextPacketRanking";
import {
  buildHarnessContextCard,
  buildHarnessLogEntry,
  getActiveLimitSignal,
  resolveChatHarnessContextForGateway,
  type ChatHarnessMode,
  type HarnessExportInput
} from "./harnessContext";
import {
  getActiveMemoryItems,
  isMemoryAllowedInExistingContext,
  MEMORY_UNCLASSIFIED_SENSITIVITY
} from "./harnessMemoryBank";
import { computePrimaryAction } from "./primaryAction";
import { computeRecoveryVisibility } from "./recovery";
import type { SensitivityLevel } from "./types";
import { computeCardWarmth, shouldFlagAsNeglected } from "./warmth";
import { nowIso } from "./ids";

export type ContextPacketBuildInput = {
  data: HarnessExportInput;
  userIntent: {
    message: string;
    mode: ChatHarnessMode;
    sensitivity: SensitivityLevel;
  };
  route?: HarnessRoute;
  threadState?: SharedChatThreadState;
  now?: Date;
  preferredExport?: "full" | "compact";
};

function buildMemorySlices(data: HarnessExportInput): RankedSlice<RetrievedMemory>[] {
  const slices: RankedSlice<RetrievedMemory>[] = [];
  const activeMemory = getActiveMemoryItems(data.memoryItems ?? []).filter(
    isMemoryAllowedInExistingContext
  );

  for (const [index, item] of activeMemory.slice(0, 10).entries()) {
    slices.push({
      source: "memory_bank",
      tier: "high",
      rank: 75 - index,
      // Legacy unclassified memories keep the pre-existing S1 packet label for
      // compatibility only. This is not canonical record classification and
      // must not be used by retrieval eligibility.
      sensitivity:
        item.sensitivity === MEMORY_UNCLASSIFIED_SENSITIVITY
          ? "S1"
          : item.sensitivity,
      payload: {
        memoryId: item.id,
        kind: item.kind,
        title: item.title,
        summary: item.summary,
        tags: item.tags,
        source: "memory_bank"
      }
    });
  }

  for (const [index, summary] of (data.chatSummaries ?? []).slice(0, 5).entries()) {
    slices.push({
      source: "chat_summary",
      tier: "low",
      rank: 35 - index,
      sensitivity: "S1",
      payload: {
        memoryId: summary.id,
        kind: "chat_summary",
        title: summary.userMessage.slice(0, 60),
        summary: summary.assistantSummary,
        tags: summary.patterns,
        source: "chat_summary",
        sourceChatSummaryId: summary.id
      }
    });
  }

  return slices.sort((left, right) => right.rank - left.rank);
}

function buildRecoverySlices(
  briefing: ReturnType<typeof generateWhileYouWereAway>,
  recovery: ReturnType<typeof computeRecoveryVisibility>
): RankedSlice<{ summary: string; kind: "salvage" | "mvd" | "ignored" | "recovered" }>[] {
  const slices: RankedSlice<{ summary: string; kind: "salvage" | "mvd" | "ignored" | "recovered" }>[] =
    [];

  if (recovery.showSalvage) {
    slices.push({
      source: "recovery_signals",
      tier: "medium",
      rank: 55,
      sensitivity: "S1",
      payload: {
        summary: recovery.salvageReason ?? "Salvage mode may help re-enter gently.",
        kind: "salvage"
      }
    });
  }

  if (recovery.showMvd) {
    slices.push({
      source: "recovery_signals",
      tier: "medium",
      rank: 50,
      sensitivity: "S1",
      payload: {
        summary: "Minimum Viable Day is still open tonight.",
        kind: "mvd"
      }
    });
  }

  for (const [index, line] of briefing.prepared
    .filter((item) => item.toLowerCase().includes("salvage"))
    .slice(0, 2)
    .entries()) {
    slices.push({
      source: "recovery_signals",
      tier: "medium",
      rank: 48 - index,
      sensitivity: "S1",
      payload: { summary: line, kind: "salvage" }
    });
  }

  return slices;
}

export function buildAiContextPacket(
  input: ContextPacketBuildInput,
  options: { maxChars?: number } = {}
): AiContextPacket {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const { data, userIntent } = input;

  assertRequestSensitivityAllowed(userIntent.sensitivity);

  const briefing = generateWhileYouWereAway(
    data.cards,
    data.logs,
    data.proofItems,
    data.dailyState,
    now
  );
  const primaryAction = computePrimaryAction(
    briefing,
    data.dailyState,
    data.cards,
    data.logs,
    now
  );
  const recovery = computeRecoveryVisibility(briefing, data.dailyState, now);
  let harness = resolveChatHarnessContextForGateway(data, {
    preferredMode: input.preferredExport,
    message: userIntent.message
  });
  const cardTitleById = new Map(data.cards.map((card) => [card.id, card.title]));
  const redactedLogSummaries = new Map(
    data.logs
      .filter((log) => shouldIncludeLog(log))
      .map((log) => {
        const cardTitle = log.cardId ? cardTitleById.get(log.cardId) ?? "General" : "General";
        const raw = log.rawText?.trim();
        return [raw ?? log.id, redactLogSummary(log, cardTitle)] as const;
      })
  );
  harness = {
    ...harness,
    logs: harness.logs
      .filter((entry) => {
        const match = data.logs.find(
          (log) =>
            !shouldIncludeLog(log) &&
            (log.rawText?.trim() === entry.summary || buildHarnessLogEntry(log, entry.card_title).summary === entry.summary)
        );
        return !match;
      })
      .map((entry) => {
        const redacted = redactedLogSummaries.get(entry.summary);
        if (redacted) {
          return { ...entry, summary: redacted };
        }
        return entry;
      })
  };
  const activeLimit = getActiveLimitSignal(data);

  const excludedCardIds: string[] = [];
  const excludedLogIds: string[] = [];
  const redactionNotes: string[] = [];

  const activeCards: RankedSlice<import("./contextPacket").BoardCardSlice>[] = [];
  const staleCards: RankedSlice<import("./contextPacket").BoardCardSlice>[] = [];

  for (const card of data.cards) {
    if (!shouldIncludeCard(card)) {
      excludedCardIds.push(card.id);
      redactionNotes.push(`Excluded S3 card: ${card.title}`);
      continue;
    }

    const warmth = computeCardWarmth(card, data.logs, now);
    const harnessCard = buildHarnessContextCard(card);
    const payload = redactCardSlice(
      card,
      harnessCard.why_it_matters,
      harnessCard.next_tiny_action
    );
    if (shouldFlagAsNeglected(card, warmth)) {
      payload.neglectReason = "Active card is cold or dormant.";
    }

    const rankInput = {
      card,
      harnessCard,
      warmth,
      primaryAction,
      userMessage: userIntent.message,
      mode: userIntent.mode,
      now,
      data
    };

    if (card.state === "active") {
      activeCards.push(rankCardSlice(payload, rankInput, "active_cards"));
    } else if (isStaleCardBucket(card, warmth)) {
      staleCards.push(rankCardSlice(payload, rankInput, "stale_cards"));
    }
  }

  activeCards.sort((left, right) => right.rank - left.rank);
  staleCards.sort((left, right) => right.rank - left.rank);

  const baseThreadState = input.threadState ?? createEmptySharedChatThreadState();
  const threadState: SharedChatThreadState = {
    ...baseThreadState,
    pinnedFacts: filterPinnedFacts(baseThreadState.pinnedFacts)
  };
  const wire = toWireChatHarnessThreadState(threadState);

  const diagnoses = harness.recent_analyses.filter((item) =>
    item.summary.toLowerCase().includes("diagnosis")
  );
  const productDecisions = harness.decisions;
  const taskMode = classifyTurnIntent(userIntent.message);
  const routing = routeCapabilities({
    route: input.route ?? "companion",
    message: userIntent.message,
    mode: userIntent.mode,
    sensitivity: userIntent.sensitivity,
    taskMode
  });
  const toolPermissions = routingToToolPermissions(routing);
  const untrustedBlocks = buildUntrustedBlocksFromRouting(userIntent.message, routing);
  const packetUserMessage =
    untrustedBlocks.length > 0
      ? resolveTrustedUserMessage(userIntent.message, routing, untrustedBlocks)
      : userIntent.message;
  const metadataCapabilityNotes =
    toolPermissions.metadataCapabilities.length > 0
      ? [
          `Routed capabilities (metadata): ${toolPermissions.metadataCapabilities.join(", ")}`
        ]
      : [];

  const packet: AiContextPacket = {
    packetVersion: "0.1",
    generatedAt,
    userIntent: {
      message: packetUserMessage,
      mode: userIntent.mode,
      sensitivity: userIntent.sensitivity,
      primaryAction: {
        kind: primaryAction.kind,
        title: primaryAction.title,
        reason: primaryAction.reason,
        smallestAction: primaryAction.smallestAction,
        cardId: primaryAction.cardId
      },
      taskMode
    },
    board: {
      harness,
      activeLimit,
      diagnoses,
      productDecisions
    },
    activeCards,
    staleCards: staleCards.slice(0, 8),
    recentProof: rankProofSlices(data.proofItems),
    recoverySignals: buildRecoverySlices(briefing, recovery),
    memories: buildMemorySlices(data),
    companion: {
      briefingTitle: briefing.title,
      briefingPrepared: briefing.prepared.slice(0, 6),
      briefingDetected: briefing.detected.slice(0, 6),
      recovery: {
        showSalvage: recovery.showSalvage,
        showMvd: recovery.showMvd,
        shouldPromote: recovery.shouldPromote,
        salvageReason: recovery.salvageReason
      },
      whileYouWereAwayHighlights: [...briefing.updated, ...briefing.detected].slice(0, 6)
    },
    openThread: {
      recentDigest: threadState.recentDigest,
      activeGoal: threadState.activeGoal,
      currentTopic: threadState.currentTopic,
      openLoops: threadState.openLoops,
      pinnedFacts: filterPinnedFacts(threadState.pinnedFacts),
      userSteering: threadState.userSteering,
      doNotRepeat: threadState.doNotRepeat,
      wire
    },
    projectDocs: [],
    outputSchema: {
      name: "chat_harness_answer",
      version: "0.1",
      schemaRef: "chat_harness_v0.1",
      requiresApproval: true
    },
    tools: {
      allowed: toolPermissions.allowed,
      denied: toolPermissions.denied,
      notes: [...routing.notes, ...metadataCapabilityNotes, buildAssistantActionSchemaHint()]
    },
    routing,
    untrustedBlocks: untrustedBlocks.length > 0 ? untrustedBlocks : undefined,
    budget: {
      estimatedChars: 0,
      maxChars: options.maxChars ?? 0,
      compactionLevel: "none",
      droppedSources: []
    },
    redaction: {
      requestSensitivity: userIntent.sensitivity,
      excludedCardIds,
      excludedLogIds,
      notes: redactionNotes
    }
  };

  for (const log of data.logs) {
    if (log.sensitivity === "S3") {
      excludedLogIds.push(log.id);
    }
  }

  return applyPacketBudget(packet, options);
}

// Re-export for tests that need stable timestamps without coupling to nowIso()
export function buildAiContextPacketAt(
  input: ContextPacketBuildInput,
  options: { maxChars?: number } = {}
): AiContextPacket {
  return buildAiContextPacket(
    {
      ...input,
      now: input.now ?? new Date(nowIso())
    },
    options
  );
}
