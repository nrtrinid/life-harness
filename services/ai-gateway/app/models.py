import logging
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.context_packet import AiContextPacketWire


class AnalysisMode(str, Enum):
    operator = "operator"
    reflection = "reflection"
    coach = "coach"


class SensitivityLevel(str, Enum):
    S0 = "S0"
    S1 = "S1"
    S2 = "S2"
    S3 = "S3"


class LifeArea(str, Enum):
    build = "Build"
    body = "Body"
    money_independence = "Money / Independence"
    social_career = "Social / Career"
    stability_vices = "Stability / Vices"


class CardState(str, Enum):
    inbox = "Inbox"
    active = "Active"
    parked = "Parked"
    waiting = "Waiting"
    done = "Done"
    killed = "Killed"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AnalyzeTranscriptRequest(StrictModel):
    text: str = Field(..., min_length=1, max_length=32_000)
    mode: AnalysisMode = AnalysisMode.operator
    sensitivity: SensitivityLevel = SensitivityLevel.S1


class PossibleCard(StrictModel):
    title: str
    area: LifeArea
    state: CardState
    next_tiny_action: str
    why_it_matters: str


class AnalyzeTranscriptResponse(StrictModel):
    summary: str
    themes: list[str]
    possible_cards: list[PossibleCard]
    next_actions: list[str]
    pounce_mission: str
    things_to_park: list[str]
    patterns_detected: list[str]
    confidence_notes: list[str]


class HealthStatus(str, Enum):
    ok = "ok"
    degraded = "degraded"


class ProviderKind(str, Enum):
    mock = "mock"
    openvino = "openvino"


class SlotHealthStatus(str, Enum):
    disabled = "disabled"
    ready = "ready"
    warming = "warming"
    degraded = "degraded"


class SlotHealthEntry(StrictModel):
    enabled: bool
    state: SlotHealthStatus


class GatewayBudgetLimits(StrictModel):
    max_input_chars: int
    raw_lab_max_input_chars: int
    timeout_seconds: float


class HealthResponse(StrictModel):
    status: HealthStatus
    provider: ProviderKind
    provider_ready: bool
    model: str | None = None
    device: str | None = None
    message: str | None = None
    slots: dict[str, SlotHealthEntry] | None = None
    budget: GatewayBudgetLimits


class ProviderHealth(StrictModel):
    status: HealthStatus
    provider_ready: bool
    model: str | None = None
    device: str | None = None
    message: str | None = None


class ErrorDetail(StrictModel):
    detail: str


class AskHarnessMode(str, Enum):
    operator = "operator"
    reflection = "reflection"
    builder = "builder"
    general = "general"


class WarmthLevel(str, Enum):
    hot = "Hot"
    warm = "Warm"
    cooling = "Cooling"
    cold = "Cold"
    dormant = "Dormant"


class LogType(str, Enum):
    win = "win"
    leak = "leak"
    note = "note"
    decision = "decision"
    pounce = "pounce"
    salvage = "salvage"


class GroundingSourceType(str, Enum):
    card = "card"
    log = "log"
    proof = "proof"
    analysis = "analysis"
    decision = "decision"
    conversation = "conversation"
    none = "none"


class ChatRole(str, Enum):
    user = "user"
    assistant = "assistant"


class HarnessContextCard(StrictModel):
    title: str
    area: LifeArea
    state: CardState
    progress: int = Field(..., ge=0, le=100)
    warmth: WarmthLevel
    next_tiny_action: str
    why_it_matters: str


class HarnessLogEntry(StrictModel):
    timestamp: str
    summary: str
    area: str
    card_title: str
    type: LogType


class HarnessProofItem(StrictModel):
    summary: str
    timestamp: str


class HarnessRecentAnalysis(StrictModel):
    summary: str
    patterns_detected: list[str]


class HarnessDecision(StrictModel):
    summary: str
    reason: str


class HarnessContext(StrictModel):
    cards: list[HarnessContextCard] = Field(default_factory=list)
    logs: list[HarnessLogEntry] = Field(default_factory=list)
    proof_items: list[HarnessProofItem] = Field(default_factory=list)
    recent_analyses: list[HarnessRecentAnalysis] = Field(default_factory=list)
    decisions: list[HarnessDecision] = Field(default_factory=list)


class ConversationTurn(StrictModel):
    role: ChatRole
    content: str = Field(..., min_length=1)


class AskHarnessRequest(StrictModel):
    question: str = Field(..., min_length=1)
    mode: AskHarnessMode = AskHarnessMode.operator
    sensitivity: SensitivityLevel = SensitivityLevel.S1
    context: HarnessContext
    conversation_history: list[ConversationTurn] = Field(default_factory=list)


class GroundingItem(StrictModel):
    source_type: GroundingSourceType
    label: str
    summary: str


class ProposedCardUpdate(StrictModel):
    card_title: str
    proposed_change: str
    requires_approval: Literal[True] = True


class AskHarnessResponse(StrictModel):
    answer: str
    grounding: list[GroundingItem]
    patterns_detected: list[str]
    suggested_next_actions: list[str]
    proposed_card_updates: list[ProposedCardUpdate]
    confidence_notes: list[str]
    safety_notes: list[str]


class ThreadTaskMode(str, Enum):
    casual = "casual"
    ask_factual = "ask_factual"
    teach = "teach"
    write_code = "write_code"
    debug = "debug"
    brainstorm = "brainstorm"
    plan = "plan"
    reflect = "reflect"
    roleplay = "roleplay"
    style_steering = "style_steering"
    grounded_operator = "grounded_operator"
    builder = "builder"


class ChatHarnessCodeBlock(StrictModel):
    language: str = ""
    code: str = ""
    purpose: str = ""


class ChatHarnessThreadReferenceState(StrictModel):
    last_options: list[str] = Field(default_factory=list)
    last_code_block: ChatHarnessCodeBlock | None = None
    last_plan: str = ""
    last_named_thing: str = ""
    likely_reference: str = ""


class ChatHarnessThreadState(StrictModel):
    recent_digest: str = ""
    active_goal: str = ""
    current_topic: str = ""
    task_mode: ThreadTaskMode = ThreadTaskMode.casual
    open_loops: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    pinned_facts: list[str] = Field(default_factory=list)
    user_steering: list[str] = Field(default_factory=list)
    do_not_repeat: list[str] = Field(default_factory=list)
    references: ChatHarnessThreadReferenceState = Field(
        default_factory=ChatHarnessThreadReferenceState
    )
    updated_at: str | None = None


class ReasoningDepth(str, Enum):
    fast = "fast"
    deliberate = "deliberate"
    deep = "deep"


class CriticCheckId(str, Enum):
    too_many_tasks = "too_many_tasks"
    too_broad = "too_broad"
    ignores_life_harness_state = "ignores_life_harness_state"
    enables_avoidance = "enables_avoidance"
    emotionally_weird_or_manipulative = "emotionally_weird_or_manipulative"
    contradicts_context = "contradicts_context"
    invalid_or_unstructured_output = "invalid_or_unstructured_output"
    no_issue = "no_issue"


class CriticCheckEntry(StrictModel):
    id: CriticCheckId
    severity: Literal["info", "warn", "error"]
    message: str = Field(..., max_length=300)


class ChatHarnessCriticVerdict(StrictModel):
    needs_revision: bool
    checks: list[CriticCheckEntry] = Field(default_factory=list)
    revision_instruction: str = Field(default="", max_length=400)


class ChatHarnessRequest(StrictModel):
    message: str = Field(..., min_length=1)
    mode: AskHarnessMode = AskHarnessMode.general
    sensitivity: SensitivityLevel = SensitivityLevel.S1
    context: HarnessContext
    conversation_history: list[ConversationTurn] = Field(default_factory=list)
    thread_state: ChatHarnessThreadState = Field(default_factory=ChatHarnessThreadState)
    reasoning_depth: ReasoningDepth = ReasoningDepth.fast
    context_packet: "AiContextPacketWire | None" = None

    @model_validator(mode="before")
    @classmethod
    def strip_invalid_context_packet(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw_packet = data.get("context_packet")
        if raw_packet is None:
            return data
        from app.context_packet import AiContextPacketWire

        try:
            AiContextPacketWire.model_validate(raw_packet)
        except ValidationError:
            logger.warning("Invalid context_packet stripped; falling back to legacy context")
            data = dict(data)
            data["context_packet"] = None
        return data


class ChatHarnessResponse(StrictModel):
    answer: str
    used_context: bool
    confidence_notes: list[str]
    safety_notes: list[str]


class RawLabTurn(StrictModel):
    role: ChatRole
    content: str = Field(..., min_length=1)


class RawLabPersonalityState(StrictModel):
    voice_traits: list[str] = Field(default_factory=list)
    conversational_instincts: list[str] = Field(default_factory=list)
    recurring_interests: list[str] = Field(default_factory=list)
    user_responds_well_to: list[str] = Field(default_factory=list)
    user_dislikes: list[str] = Field(default_factory=list)
    current_stance: str = ""
    growth_notes: list[str] = Field(default_factory=list)
    updated_at: str | None = None


class RawLabSmartCompactedContext(StrictModel):
    active_open_loops: list[str] = Field(default_factory=list)
    questions_to_revisit: list[str] = Field(default_factory=list)
    user_steering: list[str] = Field(default_factory=list)
    do_not_repeat: list[str] = Field(default_factory=list)
    recurring_topics: list[str] = Field(default_factory=list)
    provisional_stances: list[str] = Field(default_factory=list)
    self_observations: list[str] = Field(default_factory=list)
    important_recent_moments: list[str] = Field(default_factory=list)
    current_tension: str = ""
    discarded_noise_summary: str = ""
    source_turn_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class RawLabThreadState(StrictModel):
    recent_digest: str = ""
    active_goal: str = ""
    current_topic: str = ""
    task_mode: ThreadTaskMode = ThreadTaskMode.casual
    pinned_facts: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    open_loops: list[str] = Field(default_factory=list)
    user_steering: list[str] = Field(default_factory=list)
    tone_preferences: list[str] = Field(default_factory=list)
    do_not_repeat: list[str] = Field(default_factory=list)
    recurring_topics: list[str] = Field(default_factory=list)
    current_vibe: str = ""
    provisional_stances: list[str] = Field(default_factory=list)
    self_observations: list[str] = Field(default_factory=list)
    questions_to_revisit: list[str] = Field(default_factory=list)
    smart_compacted_context: RawLabSmartCompactedContext = Field(
        default_factory=RawLabSmartCompactedContext
    )
    references: ChatHarnessThreadReferenceState = Field(
        default_factory=ChatHarnessThreadReferenceState
    )
    personality: RawLabPersonalityState = Field(default_factory=RawLabPersonalityState)
    updated_at: str | None = None


class RawLabCompanionSelfMemory(StrictModel):
    id: str
    kind: str
    subject: Literal["companion_self", "interaction_pattern", "user_preference"]
    scope: str = "raw_lab"
    text: str = Field(..., min_length=1, max_length=280)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    sensitivity: Literal["S0", "S1", "S2"] = "S0"


class RawLabRequest(StrictModel):
    message: str = Field(..., min_length=1)
    recent_turns: list[RawLabTurn] = Field(default_factory=list)
    thread_state: RawLabThreadState = Field(default_factory=RawLabThreadState)
    companion_self_memories: list[RawLabCompanionSelfMemory] = Field(default_factory=list)
    reasoning_depth: ReasoningDepth = ReasoningDepth.fast


class RawLabResponse(StrictModel):
    answer: str
    mode: Literal["raw_lab"] = "raw_lab"
    safety_notes: list[str]
    used_context: Literal[False] = False


class RawLabSelfReflectionRequest(StrictModel):
    recent_turns: list[RawLabTurn] = Field(default_factory=list)
    thread_state: RawLabThreadState = Field(default_factory=RawLabThreadState)
    existing_self_memories: list[RawLabCompanionSelfMemory] = Field(default_factory=list)


class RawLabSelfMemoryProposal(StrictModel):
    kind: str
    subject: Literal["companion_self", "interaction_pattern", "user_preference"] = (
        "companion_self"
    )
    text: str = Field(..., min_length=1, max_length=280)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    sensitivity: Literal["S0", "S1", "S2"] = "S0"
    reason: str = ""


class RawLabSelfReflectionResponse(StrictModel):
    proposals: list[RawLabSelfMemoryProposal] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    used_context: Literal[False] = False


class RawLabThreadReflectionRequest(StrictModel):
    recent_turns: list[RawLabTurn] = Field(default_factory=list)
    thread_state: RawLabThreadState = Field(default_factory=RawLabThreadState)
    companion_self_memories: list[RawLabCompanionSelfMemory] = Field(default_factory=list)


class RawLabThreadReflectionProposal(StrictModel):
    self_observations: list[str] = Field(default_factory=list)
    questions_to_revisit: list[str] = Field(default_factory=list)
    provisional_stances: list[str] = Field(default_factory=list)
    current_vibe: str = ""
    do_not_repeat: list[str] = Field(default_factory=list)
    user_steering: list[str] = Field(default_factory=list)


class RawLabThreadReflectionResponse(StrictModel):
    proposals: RawLabThreadReflectionProposal = Field(
        default_factory=RawLabThreadReflectionProposal
    )
    safety_notes: list[str] = Field(default_factory=list)
    used_context: Literal[False] = False


