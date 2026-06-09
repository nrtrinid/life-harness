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
