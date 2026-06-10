import type { WireChatHarnessThreadState } from "./chatThreadState";
import type {
  HarnessContext,
  HarnessDecision,
  HarnessRecentAnalysis,
  ChatHarnessMode,
  ActiveLimitSignal
} from "./harnessContext";
import type { PrimaryAction, SensitivityLevel } from "./types";

export class ContextPacketBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextPacketBuildError";
  }
}

export type ContextSource =
  | "user_intent"
  | "board_snapshot"
  | "active_cards"
  | "stale_cards"
  | "recent_proof"
  | "recovery_signals"
  | "memory_bank"
  | "chat_summary"
  | "board_diagnosis"
  | "companion"
  | "open_thread"
  | "project_doc"
  | "product_rule"
  | "tool_permission";

export type ContextRankTier = "critical" | "high" | "medium" | "low" | "filler";

export type RankedSlice<T> = {
  source: ContextSource;
  tier: ContextRankTier;
  rank: number;
  sensitivity: SensitivityLevel;
  payload: T;
};

export type UserIntentContext = {
  message: string;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  primaryAction?: {
    kind: string;
    title: string;
    reason: string;
    smallestAction: string;
    cardId?: string;
  };
  taskMode?: string;
};

export type BoardContext = {
  harness: HarnessContext;
  activeLimit: ActiveLimitSignal;
  diagnoses: HarnessRecentAnalysis[];
  productDecisions: HarnessDecision[];
};

export type BoardCardSlice = {
  cardId: string;
  title: string;
  area: string;
  state: string;
  warmth: string;
  progress: number;
  nextTinyAction: string;
  whyItMatters: string;
  isStale: boolean;
  neglectReason?: string;
};

export type RetrievedMemory = {
  memoryId: string;
  kind: string;
  title: string;
  summary: string;
  tags: string[];
  source: "memory_bank" | "chat_summary";
  sourceChatSummaryId?: string;
};

export type CompanionContext = {
  briefingTitle?: string;
  briefingPrepared: string[];
  briefingDetected: string[];
  recovery: {
    showSalvage: boolean;
    showMvd: boolean;
    shouldPromote: boolean;
    salvageReason?: string;
  };
  whileYouWereAwayHighlights: string[];
};

export type OpenThreadContext = {
  recentDigest: string;
  activeGoal: string;
  currentTopic: string;
  openLoops: string[];
  pinnedFacts: string[];
  userSteering: string[];
  doNotRepeat: string[];
  wire: WireChatHarnessThreadState;
};

export type ProjectDocSnippet = {
  docId: string;
  title: string;
  excerpt: string;
  sensitivity: SensitivityLevel;
};

export type ToolPermission =
  | "read_board"
  | "read_memory"
  | "read_thread"
  | "propose_card_update"
  | "propose_log_capture"
  | "propose_memory_save"
  | "navigate_route";

export type ToolPermissionContext = {
  allowed: ToolPermission[];
  denied: ToolPermission[];
  notes: string[];
};

export type AiOutputSchemaRef = {
  name: "chat_harness_answer" | "ask_harness_grounded" | "operator_proposal_bundle";
  version: "0.1";
  schemaRef: string;
  requiresApproval: boolean;
};

export type PacketBudgetMetadata = {
  estimatedChars: number;
  maxChars: number;
  compactionLevel: "none" | "trim_low" | "compact" | "aggressive";
  droppedSources: ContextSource[];
};

export type PacketRedactionMetadata = {
  requestSensitivity: SensitivityLevel;
  excludedCardIds: string[];
  excludedLogIds: string[];
  notes: string[];
};

export type AiContextPacket = {
  packetVersion: "0.1";
  generatedAt: string;
  userIntent: UserIntentContext;
  board: BoardContext;
  activeCards: RankedSlice<BoardCardSlice>[];
  staleCards: RankedSlice<BoardCardSlice>[];
  recentProof: RankedSlice<{ proofId: string; summary: string; timestamp: string }>[];
  recoverySignals: RankedSlice<{
    summary: string;
    kind: "salvage" | "mvd" | "ignored" | "recovered";
  }>[];
  memories: RankedSlice<RetrievedMemory>[];
  companion: CompanionContext;
  openThread: OpenThreadContext;
  projectDocs: RankedSlice<ProjectDocSnippet>[];
  outputSchema: AiOutputSchemaRef;
  tools: ToolPermissionContext;
  budget: PacketBudgetMetadata;
  redaction: PacketRedactionMetadata;
};
