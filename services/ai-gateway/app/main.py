import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from app.config import Settings, get_settings
from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    AskHarnessRequest,
    AskHarnessResponse,
    ChatHarnessRequest,
    ChatHarnessResponse,
    HealthResponse,
    ProviderKind,
    SensitivityLevel,
)
from app.providers.base import (
    ProviderInputError,
    ProviderNotReadyError,
    ProviderParseError,
    TranscriptProvider,
)
from app.providers.mock import MockProvider
from app.providers.openvino_provider import OpenVinoProvider

logger = logging.getLogger(__name__)

SERVICE_ROOT = Path(__file__).resolve().parent.parent
PLAYGROUND_HTML = SERVICE_ROOT / "playground" / "ask_harness.html"
DEFAULT_CONTEXT_FIXTURE = (
    SERVICE_ROOT / "tests" / "fixtures" / "synthetic_harness_context.json"
)

app = FastAPI(
    title="Life Harness AI Gateway",
    description="Local scout gateway — mock default, OpenVINO optional.",
    version="0.3.0",
)


def create_provider(settings: Settings) -> TranscriptProvider:
    if settings.provider == "openvino":
        return OpenVinoProvider(settings)
    return MockProvider()


@lru_cache
def get_provider() -> TranscriptProvider:
    return create_provider(get_settings())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    provider = get_provider()
    ph = provider.health()
    kind = ProviderKind.mock if provider.name == "mock" else ProviderKind.openvino
    return HealthResponse(
        status=ph.status,
        provider=kind,
        provider_ready=ph.provider_ready,
        model=ph.model,
        device=ph.device,
        message=ph.message,
    )


@app.post("/analyze-transcript", response_model=AnalyzeTranscriptResponse)
def analyze_transcript(request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse:
    if request.sensitivity == SensitivityLevel.S3:
        raise HTTPException(
            status_code=422,
            detail="S3: rules-only, not sent to model",
        )

    provider = get_provider()
    # Privacy: log length only, never full transcript
    logger.info(
        "analyze_transcript provider=%s mode=%s sensitivity=%s text_len=%d",
        provider.name,
        request.mode.value,
        request.sensitivity.value,
        len(request.text),
    )

    try:
        return provider.analyze(request)
    except ProviderInputError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    except ProviderNotReadyError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc
    except ProviderParseError as exc:
        logger.warning("provider parse error: %s", exc.message)
        raise HTTPException(status_code=502, detail=exc.message) from exc


@app.post("/ask-harness", response_model=AskHarnessResponse)
def ask_harness_endpoint(request: AskHarnessRequest) -> AskHarnessResponse:
    if request.sensitivity == SensitivityLevel.S3:
        raise HTTPException(
            status_code=422,
            detail="S3: rules-only, not sent to model",
        )

    provider = get_provider()
    logger.info(
        "ask_harness provider=%s mode=%s sensitivity=%s question_len=%d "
        "context_cards=%d history_turns=%d",
        provider.name,
        request.mode.value,
        request.sensitivity.value,
        len(request.question),
        len(request.context.cards),
        len(request.conversation_history),
    )

    try:
        return provider.ask_harness(request)
    except ProviderInputError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    except ProviderNotReadyError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc
    except ProviderParseError as exc:
        logger.warning("provider parse error: %s", exc.message)
        raise HTTPException(status_code=502, detail=exc.message) from exc


@app.post("/chat-harness", response_model=ChatHarnessResponse)
def chat_harness_endpoint(request: ChatHarnessRequest) -> ChatHarnessResponse:
    if request.sensitivity == SensitivityLevel.S3:
        raise HTTPException(
            status_code=422,
            detail="S3: rules-only, not sent to model",
        )

    provider = get_provider()
    logger.info(
        "chat_harness provider=%s mode=%s sensitivity=%s message_len=%d "
        "context_cards=%d history_turns=%d",
        provider.name,
        request.mode.value,
        request.sensitivity.value,
        len(request.message),
        len(request.context.cards),
        len(request.conversation_history),
    )

    try:
        return provider.chat_harness(request)
    except ProviderInputError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    except ProviderNotReadyError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc


@app.get("/playground")
def playground_page() -> FileResponse:
    if not PLAYGROUND_HTML.is_file():
        raise HTTPException(status_code=404, detail="Playground page not found")
    return FileResponse(PLAYGROUND_HTML, media_type="text/html")


@app.get("/ask-harness-playground")
def ask_harness_playground_redirect() -> RedirectResponse:
    return RedirectResponse("/playground", status_code=307)


@app.get("/playground/default-context")
def playground_default_context() -> JSONResponse:
    if not DEFAULT_CONTEXT_FIXTURE.is_file():
        raise HTTPException(status_code=404, detail="Default context fixture not found")
    data = json.loads(DEFAULT_CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})
