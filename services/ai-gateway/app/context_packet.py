from enum import Enum
from typing import Literal

from pydantic import Field

from app.models import (
    AskHarnessMode,
    ChatHarnessThreadState,
    HarnessContext,
    HarnessDecision,
    HarnessRecentAnalysis,
    SensitivityLevel,
    StrictModel,
)


class ContextSource(str, Enum):
    user_intent = "user_intent"
    board_snapshot = "board_snapshot"
    active_cards = "active_cards"
    stale_cards = "stale_cards"
    recent_proof = "recent_proof"
    recovery_signals = "recovery_signals"
    memory_bank = "memory_bank"
    chat_summary = "chat_summary"
    board_diagnosis = "board_diagnosis"
    companion = "companion"
    open_thread = "open_thread"
    project_doc = "project_doc"
    product_rule = "product_rule"
    tool_permission = "tool_permission"


class ContextRankTier(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    filler = "filler"


class CompactionLevel(str, Enum):
    none = "none"
    trim_low = "trim_low"
    compact = "compact"
    aggressive = "aggressive"


class RecoverySignalKind(str, Enum):
    salvage = "salvage"
    mvd = "mvd"
    ignored = "ignored"
    recovered = "recovered"


class MemorySource(str, Enum):
    memory_bank = "memory_bank"
    chat_summary = "chat_summary"


class ToolPermission(str, Enum):
    read_board = "read_board"
    read_memory = "read_memory"
    read_thread = "read_thread"
    propose_card_update = "propose_card_update"
    propose_log_capture = "propose_log_capture"
    propose_memory_save = "propose_memory_save"
    navigate_route = "navigate_route"


class OutputSchemaName(str, Enum):
    chat_harness_answer = "chat_harness_answer"
    ask_harness_grounded = "ask_harness_grounded"
    operator_proposal_bundle = "operator_proposal_bundle"


class PrimaryActionWire(StrictModel):
    kind: str
    title: str
    reason: str
    smallest_action: str
    card_id: str | None = None


class UserIntentWire(StrictModel):
    message: str
    mode: AskHarnessMode
    sensitivity: SensitivityLevel
    primary_action: PrimaryActionWire | None = None
    task_mode: str | None = None


class ActiveLimitSignalWire(StrictModel):
    count: int
    limit: int
    is_at_limit: bool
    is_over_limit: bool
    message: str


class BoardContextWire(StrictModel):
    harness: HarnessContext
    active_limit: ActiveLimitSignalWire
    diagnoses: list[HarnessRecentAnalysis] = Field(default_factory=list)
    product_decisions: list[HarnessDecision] = Field(default_factory=list)


class BoardCardSlicePayload(StrictModel):
    card_id: str
    title: str
    area: str
    state: str
    warmth: str
    progress: int = Field(..., ge=0, le=100)
    next_tiny_action: str
    why_it_matters: str
    is_stale: bool
    neglect_reason: str | None = None


class ProofSlicePayload(StrictModel):
    proof_id: str
    summary: str
    timestamp: str


class RecoverySlicePayload(StrictModel):
    summary: str
    kind: RecoverySignalKind


class RetrievedMemoryPayload(StrictModel):
    memory_id: str
    kind: str
    title: str
    summary: str
    tags: list[str] = Field(default_factory=list)
    source: MemorySource
    source_chat_summary_id: str | None = None


class ProjectDocPayload(StrictModel):
    doc_id: str
    title: str
    excerpt: str
    sensitivity: SensitivityLevel


class RankedBoardCardSlice(StrictModel):
    source: ContextSource
    tier: ContextRankTier
    rank: int
    sensitivity: SensitivityLevel
    payload: BoardCardSlicePayload


class RankedProofSlice(StrictModel):
    source: ContextSource
    tier: ContextRankTier
    rank: int
    sensitivity: SensitivityLevel
    payload: ProofSlicePayload


class RankedRecoverySlice(StrictModel):
    source: ContextSource
    tier: ContextRankTier
    rank: int
    sensitivity: SensitivityLevel
    payload: RecoverySlicePayload


class RankedMemorySlice(StrictModel):
    source: ContextSource
    tier: ContextRankTier
    rank: int
    sensitivity: SensitivityLevel
    payload: RetrievedMemoryPayload


class RankedProjectDocSlice(StrictModel):
    source: ContextSource
    tier: ContextRankTier
    rank: int
    sensitivity: SensitivityLevel
    payload: ProjectDocPayload


class CompanionRecoveryWire(StrictModel):
    show_salvage: bool
    show_mvd: bool
    should_promote: bool
    salvage_reason: str | None = None


class CompanionContextWire(StrictModel):
    briefing_title: str | None = None
    briefing_prepared: list[str] = Field(default_factory=list)
    briefing_detected: list[str] = Field(default_factory=list)
    recovery: CompanionRecoveryWire
    while_you_were_away_highlights: list[str] = Field(default_factory=list)


class OpenThreadContextWire(StrictModel):
    recent_digest: str = ""
    active_goal: str = ""
    current_topic: str = ""
    open_loops: list[str] = Field(default_factory=list)
    pinned_facts: list[str] = Field(default_factory=list)
    user_steering: list[str] = Field(default_factory=list)
    do_not_repeat: list[str] = Field(default_factory=list)
    wire: ChatHarnessThreadState


class OutputSchemaRefWire(StrictModel):
    name: OutputSchemaName
    version: Literal["0.1"]
    schema_ref: str
    requires_approval: bool


class ToolPermissionContextWire(StrictModel):
    allowed: list[ToolPermission] = Field(default_factory=list)
    denied: list[ToolPermission] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PacketBudgetWire(StrictModel):
    estimated_chars: int
    max_chars: int
    compaction_level: CompactionLevel
    dropped_sources: list[ContextSource] = Field(default_factory=list)


class PacketRedactionWire(StrictModel):
    request_sensitivity: SensitivityLevel
    excluded_card_ids: list[str] = Field(default_factory=list)
    excluded_log_ids: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class UntrustedContextBlockWire(StrictModel):
    id: str
    kind: str
    title: str
    sensitivity: str
    markdown: str


class AiContextPacketWire(StrictModel):
    packet_version: Literal["0.1"]
    generated_at: str
    user_intent: UserIntentWire
    board: BoardContextWire
    active_cards: list[RankedBoardCardSlice] = Field(default_factory=list)
    stale_cards: list[RankedBoardCardSlice] = Field(default_factory=list)
    recent_proof: list[RankedProofSlice] = Field(default_factory=list)
    recovery_signals: list[RankedRecoverySlice] = Field(default_factory=list)
    memories: list[RankedMemorySlice] = Field(default_factory=list)
    companion: CompanionContextWire
    open_thread: OpenThreadContextWire
    project_docs: list[RankedProjectDocSlice] = Field(default_factory=list)
    output_schema: OutputSchemaRefWire
    tools: ToolPermissionContextWire
    untrusted_blocks: list[UntrustedContextBlockWire] | None = None
    budget: PacketBudgetWire
    redaction: PacketRedactionWire


def _rebuild_context_packet_forward_refs() -> None:
    from app.models import ChatHarnessRequest
    from app.synthesis_models import DeepSynthesisRequest

    types_namespace = {"AiContextPacketWire": AiContextPacketWire}
    ChatHarnessRequest.model_rebuild(_types_namespace=types_namespace)
    DeepSynthesisRequest.model_rebuild(_types_namespace=types_namespace)


_rebuild_context_packet_forward_refs()
