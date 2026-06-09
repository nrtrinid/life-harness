import logging
from functools import lru_cache

from fastapi import FastAPI, HTTPException

from app.config import Settings, get_settings
from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
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

app = FastAPI(
    title="Life Harness AI Gateway",
    description="Local scout gateway — mock default, OpenVINO optional.",
    version="0.2.0",
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
