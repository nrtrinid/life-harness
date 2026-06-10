import type { AiContextPacket, RankedSlice } from "./contextPacket";
import type { WireChatHarnessThreadState } from "./chatThreadState";
import type { HarnessContext } from "./harnessContext";

export type WireContextPacket = {
  packet_version: "0.1";
  generated_at: string;
  user_intent: {
    message: string;
    mode: string;
    sensitivity: string;
    primary_action?: {
      kind: string;
      title: string;
      reason: string;
      smallest_action: string;
      card_id?: string;
    };
    task_mode?: string;
  };
  board: {
    harness: HarnessContext;
    active_limit: {
      count: number;
      limit: number;
      is_at_limit: boolean;
      is_over_limit: boolean;
      message: string;
    };
    diagnoses: { summary: string; patterns_detected: string[] }[];
    product_decisions: { summary: string; reason: string }[];
  };
  active_cards: WireRankedSlice[];
  stale_cards: WireRankedSlice[];
  recent_proof: WireRankedSlice[];
  recovery_signals: WireRankedSlice[];
  memories: WireRankedSlice[];
  companion: {
    briefing_title?: string;
    briefing_prepared: string[];
    briefing_detected: string[];
    recovery: {
      show_salvage: boolean;
      show_mvd: boolean;
      should_promote: boolean;
      salvage_reason?: string;
    };
    while_you_were_away_highlights: string[];
  };
  open_thread: {
    recent_digest: string;
    active_goal: string;
    current_topic: string;
    open_loops: string[];
    pinned_facts: string[];
    user_steering: string[];
    do_not_repeat: string[];
    wire: WireChatHarnessThreadState;
  };
  project_docs: WireRankedSlice[];
  output_schema: {
    name: string;
    version: "0.1";
    schema_ref: string;
    requires_approval: boolean;
  };
  tools: {
    allowed: string[];
    denied: string[];
    notes: string[];
  };
  budget: {
    estimated_chars: number;
    max_chars: number;
    compaction_level: string;
    dropped_sources: string[];
  };
  redaction: {
    request_sensitivity: string;
    excluded_card_ids: string[];
    excluded_log_ids: string[];
    notes: string[];
  };
};

type WireRankedSlice = {
  source: string;
  tier: string;
  rank: number;
  sensitivity: string;
  payload: Record<string, unknown>;
};

function mapRankedSlice<T extends Record<string, unknown>>(slice: RankedSlice<T>): WireRankedSlice {
  return {
    source: slice.source,
    tier: slice.tier,
    rank: slice.rank,
    sensitivity: slice.sensitivity,
    payload: mapPayload(slice.payload)
  };
}

function mapPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    mapped[camelToSnake(key)] = value;
  }
  return mapped;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toWireContextPacket(packet: AiContextPacket): WireContextPacket {
  return {
    packet_version: packet.packetVersion,
    generated_at: packet.generatedAt,
    user_intent: {
      message: packet.userIntent.message,
      mode: packet.userIntent.mode,
      sensitivity: packet.userIntent.sensitivity,
      primary_action: packet.userIntent.primaryAction
        ? {
            kind: packet.userIntent.primaryAction.kind,
            title: packet.userIntent.primaryAction.title,
            reason: packet.userIntent.primaryAction.reason,
            smallest_action: packet.userIntent.primaryAction.smallestAction,
            card_id: packet.userIntent.primaryAction.cardId
          }
        : undefined,
      task_mode: packet.userIntent.taskMode
    },
    board: {
      harness: packet.board.harness,
      active_limit: {
        count: packet.board.activeLimit.count,
        limit: packet.board.activeLimit.limit,
        is_at_limit: packet.board.activeLimit.isAtLimit,
        is_over_limit: packet.board.activeLimit.isOverLimit,
        message: packet.board.activeLimit.message
      },
      diagnoses: packet.board.diagnoses.map((item) => ({
        summary: item.summary,
        patterns_detected: item.patterns_detected
      })),
      product_decisions: packet.board.productDecisions.map((item) => ({
        summary: item.summary,
        reason: item.reason
      }))
    },
    active_cards: packet.activeCards.map((slice) => mapRankedSlice(slice)),
    stale_cards: packet.staleCards.map((slice) => mapRankedSlice(slice)),
    recent_proof: packet.recentProof.map((slice) => mapRankedSlice(slice)),
    recovery_signals: packet.recoverySignals.map((slice) => mapRankedSlice(slice)),
    memories: packet.memories.map((slice) => mapRankedSlice(slice)),
    companion: {
      briefing_title: packet.companion.briefingTitle,
      briefing_prepared: packet.companion.briefingPrepared,
      briefing_detected: packet.companion.briefingDetected,
      recovery: {
        show_salvage: packet.companion.recovery.showSalvage,
        show_mvd: packet.companion.recovery.showMvd,
        should_promote: packet.companion.recovery.shouldPromote,
        salvage_reason: packet.companion.recovery.salvageReason
      },
      while_you_were_away_highlights: packet.companion.whileYouWereAwayHighlights
    },
    open_thread: {
      recent_digest: packet.openThread.recentDigest,
      active_goal: packet.openThread.activeGoal,
      current_topic: packet.openThread.currentTopic,
      open_loops: packet.openThread.openLoops,
      pinned_facts: packet.openThread.pinnedFacts,
      user_steering: packet.openThread.userSteering,
      do_not_repeat: packet.openThread.doNotRepeat,
      wire: packet.openThread.wire
    },
    project_docs: packet.projectDocs.map((slice) => mapRankedSlice(slice)),
    output_schema: {
      name: packet.outputSchema.name,
      version: packet.outputSchema.version,
      schema_ref: packet.outputSchema.schemaRef,
      requires_approval: packet.outputSchema.requiresApproval
    },
    tools: {
      allowed: packet.tools.allowed,
      denied: packet.tools.denied,
      notes: packet.tools.notes
    },
    budget: {
      estimated_chars: packet.budget.estimatedChars,
      max_chars: packet.budget.maxChars,
      compaction_level: packet.budget.compactionLevel,
      dropped_sources: packet.budget.droppedSources
    },
    redaction: {
      request_sensitivity: packet.redaction.requestSensitivity,
      excluded_card_ids: packet.redaction.excludedCardIds,
      excluded_log_ids: packet.redaction.excludedLogIds,
      notes: packet.redaction.notes
    }
  };
}
