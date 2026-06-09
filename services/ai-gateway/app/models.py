from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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


class HealthResponse(StrictModel):
    status: HealthStatus
    provider: ProviderKind
    provider_ready: bool
    model: str | None = None
    device: str | None = None
    message: str | None = None


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
