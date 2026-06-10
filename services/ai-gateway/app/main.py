import json
import logging
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings, get_slot_registry
from app.slots.manager import get_slot_manager
from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    AskHarnessRequest,
    AskHarnessResponse,
    ChatHarnessRequest,
    ChatHarnessResponse,
    HealthResponse,
    ProviderKind,
    RawLabRequest,
    RawLabResponse,
    RawLabSelfReflectionRequest,
    RawLabSelfReflectionResponse,
    SensitivityLevel,
)
from app.providers.base import (
    ProviderInputError,
    ProviderNotReadyError,
    ProviderParseError,
    TranscriptProvider,
)
from app.deep_synthesis import run_deep_synthesis
from app.providers.mock import MockProvider
from app.providers.openvino_provider import OpenVinoProvider
from app.synthesis_jobs import create_deep_synthesis_job, get_ai_job
from app.synthesis_models import (
    AiJobStatusResponse,
    DeepSynthesisCompletedBody,
    DeepSynthesisJobEnqueueResponse,
    DeepSynthesisQueuedBody,
    DeepSynthesisRequest,
)

logger = logging.getLogger(__name__)

SERVICE_ROOT = Path(__file__).resolve().parent.parent
PLAYGROUND_HTML = SERVICE_ROOT / "playground" / "ask_harness.html"
DEFAULT_CONTEXT_FIXTURE = (
    SERVICE_ROOT / "tests" / "fixtures" / "synthetic_harness_context.json"
)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.provider == "openvino":
        warm_slots = settings.warm_slots or get_slot_registry().config.defaults.warm_on_start
        if "companion_fast" in warm_slots:
            try:
                get_slot_manager().warm("companion_fast")
            except ProviderNotReadyError as exc:
                logger.warning("companion_fast warm skipped: %s", exc.message)
    yield


app = FastAPI(
    title="Life Harness AI Gateway",
    description="Local scout gateway — mock default, OpenVINO optional.",
    version="0.3.0",
    lifespan=lifespan,
)

# Expo web (localhost / 127.0.0.1) needs CORS for browser fetch; off when SCOUT_DEV_CORS=false.
_EXPO_WEB_ORIGIN_RE = r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def _configure_dev_cors(settings: Settings) -> None:
    if not settings.dev_cors:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=_EXPO_WEB_ORIGIN_RE,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )


_configure_dev_cors(get_settings())


def create_provider(settings: Settings) -> TranscriptProvider:
    if settings.provider == "openvino":
        return OpenVinoProvider(settings)
    return MockProvider()


@lru_cache
def get_provider() -> TranscriptProvider:
    return create_provider(get_settings())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
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
        slots=get_slot_manager().slot_health(),
        budget={
            "max_input_chars": settings.max_input_chars,
            "raw_lab_max_input_chars": settings.raw_lab_max_input_chars,
            "timeout_seconds": settings.timeout_seconds,
        },
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


@app.post(
    "/ai/deep-synthesis",
    response_model=DeepSynthesisCompletedBody | DeepSynthesisQueuedBody,
)
def deep_synthesis_endpoint(
    request: DeepSynthesisRequest,
) -> DeepSynthesisCompletedBody | DeepSynthesisQueuedBody:
    if request.sensitivity == SensitivityLevel.S3:
        raise HTTPException(
            status_code=422,
            detail="S3: excluded from synthesis",
        )

    logger.info(
        "deep_synthesis trigger=%s sensitivity=%s prompt_len=%d context_cards=%d",
        request.trigger.value,
        request.sensitivity.value,
        len(request.user_prompt),
        len(request.context.cards),
    )
    return run_deep_synthesis(request, provider=get_provider())


@app.post(
    "/ai/deep-synthesis-jobs",
    response_model=DeepSynthesisJobEnqueueResponse,
)
def deep_synthesis_jobs_endpoint(
    request: DeepSynthesisRequest,
) -> DeepSynthesisJobEnqueueResponse:
    if request.sensitivity == SensitivityLevel.S3:
        raise HTTPException(
            status_code=422,
            detail="S3: excluded from synthesis",
        )

    logger.info(
        "deep_synthesis_job trigger=%s sensitivity=%s prompt_len=%d context_cards=%d profile=%s",
        request.trigger.value,
        request.sensitivity.value,
        len(request.user_prompt),
        len(request.context.cards),
        request.pipeline_profile.value,
    )
    return create_deep_synthesis_job(request)


@app.get("/ai/jobs/{job_id}", response_model=AiJobStatusResponse)
def get_ai_job_endpoint(job_id: str) -> AiJobStatusResponse:
    job = get_ai_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


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


@app.post("/raw-lab", response_model=RawLabResponse)
def raw_lab_endpoint(request: RawLabRequest) -> RawLabResponse:
    # Future: if RawLabRequest gains sensitivity, reject S3 here before provider call.
    # if request.sensitivity == SensitivityLevel.S3:
    #     raise HTTPException(status_code=422, detail="S3: rules-only, not sent to model")

    provider = get_provider()
    logger.info(
        "raw_lab provider=%s message_len=%d history_turns=%d self_memories=%d",
        provider.name,
        len(request.message),
        len(request.recent_turns),
        len(request.companion_self_memories),
    )

    try:
        return provider.raw_lab(request)
    except ProviderInputError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    except ProviderNotReadyError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc


def _chunk_text(text: str, chunk_size: int = 48) -> list[str]:
    if not text:
        return []
    return [text[index : index + chunk_size] for index in range(0, len(text), chunk_size)]


@app.post("/raw-lab/self-reflection", response_model=RawLabSelfReflectionResponse)
def raw_lab_self_reflection_endpoint(
    request: RawLabSelfReflectionRequest,
) -> RawLabSelfReflectionResponse:
    provider = get_provider()
    logger.info(
        "raw_lab_self_reflection provider=%s history_turns=%d existing_memories=%d",
        provider.name,
        len(request.recent_turns),
        len(request.existing_self_memories),
    )

    try:
        return provider.raw_lab_self_reflection(request)
    except ProviderNotReadyError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc


@app.post("/raw-lab/stream")
def raw_lab_stream_endpoint(request: RawLabRequest) -> StreamingResponse:
    provider = get_provider()
    logger.info(
        "raw_lab_stream provider=%s message_len=%d history_turns=%d",
        provider.name,
        len(request.message),
        len(request.recent_turns),
    )

    def event_stream():
        try:
            response = provider.raw_lab(request)
            answer = response.answer
            for chunk in _chunk_text(answer):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield (
                "data: "
                + json.dumps(
                    {
                        "done": True,
                        "answer": answer,
                        "mode": response.mode,
                        "safety_notes": response.safety_notes,
                        "used_context": response.used_context,
                    }
                )
                + "\n\n"
            )
        except ProviderInputError as exc:
            yield f"data: {json.dumps({'error': exc.message, 'status': 422})}\n\n"
        except ProviderNotReadyError as exc:
            yield f"data: {json.dumps({'error': exc.message, 'status': 503})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
