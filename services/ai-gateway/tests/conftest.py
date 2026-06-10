import json
import os
from pathlib import Path

import pytest

from app.synthesis_models import DeepSynthesisRequest

HARNESS_FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
)


@pytest.fixture
def harness_context() -> dict:
    return json.loads(HARNESS_FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def synthesis_request(harness_context) -> DeepSynthesisRequest:
    return DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="What are we circling between build work and career?",
        context=harness_context,
        pipeline_profile="with_critic",
    )


@pytest.fixture(autouse=True)
def _clear_gateway_caches():
    from app.config import get_slot_registry
    from app.main import get_provider
    from app.orchestrator.inference_orchestrator import get_inference_orchestrator
    from app.slots.manager import get_slot_manager
    from app.synthesis_jobs import clear_synthesis_jobs_for_tests

    get_provider.cache_clear()
    get_slot_manager.cache_clear()
    get_inference_orchestrator.cache_clear()
    get_slot_registry.cache_clear()
    clear_synthesis_jobs_for_tests()
    os.environ["SCOUT_PROVIDER"] = "mock"
    os.environ.pop("SCOUT_DEEP_ENABLED", None)
    os.environ.pop("SCOUT_MODEL_PATH", None)
    yield
    get_provider.cache_clear()
    get_slot_manager.cache_clear()
    get_inference_orchestrator.cache_clear()
    get_slot_registry.cache_clear()
    clear_synthesis_jobs_for_tests()
