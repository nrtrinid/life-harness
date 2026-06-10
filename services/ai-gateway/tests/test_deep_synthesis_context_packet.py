import copy
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.context_packet import AiContextPacketWire
from app.main import app
from app.prompt_loader import build_deep_synthesis_fast_only_prompt
from app.synthesis_context import (
    DEEP_SYNTHESIS_CONTEXT_ITEM_MAX_CHARS,
    DEEP_SYNTHESIS_CONTEXT_MAX_CHARS,
    build_deep_synthesis_context_block,
    resolve_deep_synthesis_history_for_prompt,
)
from app.synthesis_jobs import clear_synthesis_jobs_for_tests
from app.synthesis_models import DeepSynthesisRequest

os.environ.setdefault("SCOUT_PROVIDER", "mock")

HARNESS_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
PACKET_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"


@pytest.fixture
def harness_context() -> dict:
    return json.loads(HARNESS_FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def packet_data() -> dict:
    return json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def synthesis_request(harness_context, packet_data) -> DeepSynthesisRequest:
    return DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="What am I avoiding between build heat and cold career?",
        context=harness_context,
        context_packet=packet_data,
        pipeline_profile="fast_only",
    )


def test_build_context_block_with_packet_includes_tiers(synthesis_request):
    block, degraded = build_deep_synthesis_context_block(synthesis_request)
    assert not degraded
    assert "Context packet:" in block
    assert "- Critical:" in block
    assert "- High:" in block
    assert "EV Tracker / Kalshi" in block
    assert "[ev-tracker-kalshi]" in block
    assert "Career / Networking" in block


def test_legacy_no_packet_omits_full_harness_json(harness_context):
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="What should I focus on?",
        context=harness_context,
        pipeline_profile="fast_only",
    )
    block, _ = build_deep_synthesis_context_block(request)
    assert "Context packet:" in block
    assert '"cards":' not in block
    assert "legacy board summary" in block


def test_critical_high_survive_budget_trimming(packet_data, harness_context):
    inflated = copy.deepcopy(packet_data)
    inflated["project_docs"] = [
        {
            "source": "project_doc",
            "tier": "low",
            "rank": index,
            "sensitivity": "S1",
            "payload": {
                "doc_id": f"doc-{index}",
                "title": f"Filler doc {index}",
                "excerpt": "x" * 400,
                "sensitivity": "S1",
            },
        }
        for index in range(30)
    ]
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="Focus test",
        context=harness_context,
        context_packet=inflated,
        pipeline_profile="fast_only",
    )
    block, _ = build_deep_synthesis_context_block(request)
    assert len(block) <= DEEP_SYNTHESIS_CONTEXT_MAX_CHARS + 4
    assert "EV Tracker / Kalshi" in block
    assert "Career / Networking" in block
    assert "Filler doc 0" not in block
    assert block.count("Filler doc") < 30


def test_item_cap_truncates_long_slice(packet_data, harness_context):
    inflated = copy.deepcopy(packet_data)
    inflated["active_cards"][0]["payload"]["next_tiny_action"] = "z" * 1200
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="Truncate test",
        context=harness_context,
        context_packet=inflated,
        pipeline_profile="fast_only",
    )
    block, _ = build_deep_synthesis_context_block(request)
    for line in block.splitlines():
        if line.strip().startswith("- Active card:"):
            assert len(line) <= DEEP_SYNTHESIS_CONTEXT_ITEM_MAX_CHARS + 8


def test_digest_replaces_full_history(harness_context, packet_data):
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="Thread test",
        context=harness_context,
        context_packet=packet_data,
        thread_state={"recent_digest": "User asked about career avoidance twice."},
        conversation_history=[
            {"role": "user", "content": "Long prior turn " * 50},
            {"role": "assistant", "content": "Long reply " * 50},
        ],
        pipeline_profile="fast_only",
    )
    history_block, excluded = resolve_deep_synthesis_history_for_prompt(request)
    assert "recent_digest" in history_block
    assert "Long prior turn" not in history_block
    assert any("digest" in note.lower() for note in excluded)

    prompt, notes = build_deep_synthesis_fast_only_prompt(request=request)
    assert "Full chat history trimmed" in prompt or any(
        "digest" in note.lower() for note in notes
    )


def test_s3_slice_omitted_from_packet_block(packet_data, harness_context):
    mutated = copy.deepcopy(packet_data)
    mutated["active_cards"].append(
        {
            "source": "active_cards",
            "tier": "critical",
            "rank": 999,
            "sensitivity": "S3",
            "payload": {
                "card_id": "secret-card",
                "title": "Secret Therapy Notes",
                "area": "Mind",
                "state": "Active",
                "warmth": "Cold",
                "progress": 0,
                "next_tiny_action": "Do not leak",
                "why_it_matters": "Private",
                "is_stale": False,
            },
        }
    )
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="S3 slice test",
        context=harness_context,
        context_packet=mutated,
        pipeline_profile="fast_only",
    )
    block, _ = build_deep_synthesis_context_block(request)
    assert "Secret Therapy Notes" not in block


def test_malformed_packet_stripped_at_validation(harness_context):
    request = DeepSynthesisRequest.model_validate(
        {
            "trigger": "user_prompt",
            "sensitivity": "S1",
            "user_prompt": "Malformed packet test",
            "context": harness_context,
            "context_packet": {"packet_version": "9.9", "generated_at": "bad"},
            "pipeline_profile": "fast_only",
        }
    )
    assert request.context_packet is None
    block, degraded = build_deep_synthesis_context_block(request)
    assert "legacy board summary" in block


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


def test_http_malformed_packet_still_completes(client, harness_context):
    payload = {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": "Still works without valid packet",
        "context": harness_context,
        "context_packet": {"packet_version": "9.9"},
        "pipeline_profile": "fast_only",
    }
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_http_s3_request_rejected_before_model(client, harness_context):
    payload = {
        "trigger": "user_prompt",
        "sensitivity": "S3",
        "user_prompt": "Should not run",
        "context": harness_context,
        "pipeline_profile": "fast_only",
    }
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 422


def test_openvino_prompt_uses_compact_packet_not_raw_json(
    synthesis_request,
):
    captured: list[str] = []

    def _capture(prompt: str) -> str:
        captured.append(prompt)
        return "{}"

    from app.deep_synthesis_openvino import run_openvino_fast_only

    run_openvino_fast_only(
        synthesis_request,
        generate=_capture,
        max_input_chars=500_000,
    )
    assert captured
    prompt = captured[0]
    assert "Context packet:" in prompt
    assert "EV Tracker / Kalshi" in prompt
    assert '"packet_version"' not in prompt
    assert '"why_it_matters"' not in prompt


def test_packet_context_block_shorter_than_full_harness_json(harness_context, packet_data):
    request = DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="Compare prompt size",
        context=harness_context,
        context_packet=packet_data,
        pipeline_profile="fast_only",
    )
    block, _ = build_deep_synthesis_context_block(request)
    full_context_json = json.dumps(harness_context, indent=2)
    assert len(block) < len(full_context_json)


def test_with_critic_still_queues_with_packet(client, harness_context, packet_data):
    fake_provider = MagicMock()
    fake_provider.name = "openvino"
    payload = {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": "Queue test with packet",
        "context": harness_context,
        "context_packet": packet_data,
        "pipeline_profile": "with_critic",
    }
    with patch("app.main.get_provider", return_value=fake_provider):
        response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    fake_provider.deep_synthesis_fast_only.assert_not_called()
