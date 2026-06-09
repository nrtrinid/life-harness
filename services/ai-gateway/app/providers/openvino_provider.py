from app.config import Settings
from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    HealthStatus,
    ProviderHealth,
)
from app.providers.base import ProviderNotReadyError

try:
    import openvino_genai  # noqa: F401

    _OPENVINO_IMPORTABLE = True
except ImportError:
    _OPENVINO_IMPORTABLE = False

PHASE1_MODEL = "OpenVINO/Qwen3-8B-int4-ov"


def _setup_message(settings: Settings) -> str:
    if not _OPENVINO_IMPORTABLE:
        return (
            "OpenVINO GenAI is not installed (Phase 0 stub). "
            "Phase 1: pip install openvino-genai huggingface_hub, "
            f"download {PHASE1_MODEL} to {settings.model_path}, "
            f"set SCOUT_DEVICE={settings.device}, then enable real inference."
        )
    return (
        "OpenVINO package is present but inference is not enabled in Phase 0. "
        f"Phase 1: download {PHASE1_MODEL} to {settings.model_path}, "
        f"set SCOUT_DEVICE={settings.device}, implement LLMPipeline loading."
    )


class OpenVinoProvider:
    name = "openvino"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._message = _setup_message(settings)

    def health(self) -> ProviderHealth:
        return ProviderHealth(
            status=HealthStatus.degraded,
            provider_ready=False,
            model=PHASE1_MODEL,
            device=self._settings.device,
            message=self._message,
        )

    def analyze(self, request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse:
        raise ProviderNotReadyError(self._message)
