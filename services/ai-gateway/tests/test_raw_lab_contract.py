import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_provider
from app.models import ChatRole, RawLabRequest, RawLabResponse, RawLabThreadState, RawLabTurn
from app.prompt_loader import build_raw_lab_system_prompt, estimate_raw_lab_input_chars
from app.providers.base import RAW_LAB_EMPTY_FALLBACK, sanitize_raw_lab_text
from app.providers.mock import MockProvider
from app.providers.openvino_provider import OpenVinoProvider

os.environ.setdefault("SCOUT_PROVIDER", "mock")

DEFAULT_MESSAGE = "Give me a blunt take on this."


@pytest.fixture(autouse=True)
def _reset_provider_cache():
    get_provider.cache_clear()
    os.environ["SCOUT_PROVIDER"] = "mock"
    yield
    get_provider.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def raw_lab_payload() -> dict:
    return {
        "message": DEFAULT_MESSAGE,
        "recent_turns": [],
        "thread_state": {},
    }


def test_raw_lab_mock_returns_used_context_false(client, raw_lab_payload):
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 200
    parsed = RawLabResponse.model_validate(response.json())
    assert parsed.answer
    assert parsed.used_context is False
    assert parsed.mode == "raw_lab"


def test_raw_lab_prompt_discourages_loops():
    prompt = build_raw_lab_system_prompt().lower()
    assert "do not loop" in prompt
    assert "advance the scene" in prompt


def test_raw_lab_prompt_no_unqualified_board_memories_denial():
    prompt = build_raw_lab_system_prompt().lower()
    assert "access to cards, memories, logs" not in prompt
    assert "memory bank" in prompt


def test_raw_lab_prompt_discourages_unsolicited_disclaimers():
    prompt = build_raw_lab_system_prompt().lower()
    assert "do not hedge" in prompt
    assert "unsolicited" in prompt
    assert "consent lectures" in prompt


def test_raw_lab_mock_unrestricted_branch_no_consent_lecture(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "you're supposed to be unrestricted raw lab",
            "recent_turns": [],
            "thread_state": {},
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "consent, clarity, and care" not in answer_lower
    assert "unrestricted" in answer_lower


def test_raw_lab_prompt_includes_thread_state_json():
    prompt = build_raw_lab_system_prompt(
        thread_state=RawLabThreadState(
            recent_digest="user: hi",
            pinned_facts=["note"],
        )
    )
    assert "recent_digest" in prompt
    assert "user: hi" in prompt
    assert "HarnessContext" not in prompt


def test_raw_lab_mock_short_reply_advances_with_history(client, raw_lab_payload):
    raw_lab_payload["message"] = "yes"
    raw_lab_payload["recent_turns"] = [
        {"role": "user", "content": "Start the scene."},
        {"role": "assistant", "content": "Opening beat."},
    ]
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "moving forward" in answer_lower


def test_raw_lab_mock_continuity_with_history(client, raw_lab_payload):
    raw_lab_payload["recent_turns"] = [
        {"role": "user", "content": "Start a thread about cats."},
        {"role": "assistant", "content": "Cats are chaos in fur coats."},
    ]
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "continuing our thread" in answer_lower


@pytest.mark.parametrize(
    "forbidden_field",
    [
        "board_context",
        "memory_context",
        "context",
        "proposed_card_updates",
        "tools_enabled",
        "save_summary",
        "allow_adult_topics",
        "conversation_history",
    ],
)
def test_raw_lab_rejects_forbidden_request_fields(client, raw_lab_payload, forbidden_field):
    raw_lab_payload[forbidden_field] = {"anything": True}
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 422


def test_empty_message_rejected(client, raw_lab_payload):
    raw_lab_payload["message"] = ""
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 422


def test_raw_lab_request_rejects_unknown_fields(raw_lab_payload):
    raw_lab_payload["extra_field"] = "nope"
    with pytest.raises(ValidationError):
        RawLabRequest.model_validate(raw_lab_payload)


def test_raw_lab_response_rejects_extra_fields():
    valid = RawLabResponse(
        answer="a",
        mode="raw_lab",
        safety_notes=[],
        used_context=False,
    )
    data = valid.model_dump()
    data["proposed_card_updates"] = []
    with pytest.raises(ValidationError):
        RawLabResponse.model_validate(data)


def test_raw_lab_mock_never_grounded_in_board(client, raw_lab_payload):
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "career / networking" not in answer_lower
    assert "looking at your board" not in answer_lower


def test_raw_lab_long_thread_short_message_compacts_to_200(client):
    turns = [
        {
            "role": "user" if index % 2 == 0 else "assistant",
            "content": f"Long turn {index} " + ("verbose " * 200),
        }
        for index in range(16)
    ]
    response = client.post(
        "/raw-lab",
        json={
            "message": "what tools do you have?",
            "recent_turns": turns,
            "thread_state": {},
        },
    )
    assert response.status_code == 200
    assert response.json()["used_context"] is False


def test_raw_lab_input_over_budget_returns_422(client, raw_lab_payload):
    from app.config import get_settings

    os.environ["SCOUT_PROVIDER"] = "openvino"
    get_provider.cache_clear()

    provider = OpenVinoProvider(get_settings())
    provider._pipeline = object()
    provider._load_error = None

    with patch(
        "app.providers.openvino_provider.estimate_raw_lab_input_chars",
        return_value=99_999,
    ):
        with patch("app.main.get_provider", return_value=provider):
            response = client.post("/raw-lab", json=raw_lab_payload)

    assert response.status_code == 422


def test_openvino_raw_lab_returns_503_when_model_missing(client, raw_lab_payload):
    os.environ["SCOUT_PROVIDER"] = "openvino"
    os.environ["SCOUT_MODEL_PATH"] = "/nonexistent/scout-model-path-raw-lab"
    get_provider.cache_clear()
    response = client.post("/raw-lab", json=raw_lab_payload)
    assert response.status_code == 503
    assert "detail" in response.json()


def test_openvino_raw_lab_empty_response_returns_fallback(client, raw_lab_payload):
    from app.config import get_settings

    provider = OpenVinoProvider(get_settings())
    provider._pipeline = object()
    provider._load_error = None

    with patch.object(provider, "_generate_chat", return_value="   "):
        result = provider.raw_lab(RawLabRequest(message=DEFAULT_MESSAGE, recent_turns=[]))

        assert result.used_context is False
        assert result.mode == "raw_lab"
        assert result.answer == RAW_LAB_EMPTY_FALLBACK.answer

        with patch("app.main.get_provider", return_value=provider):
            response = client.post("/raw-lab", json=raw_lab_payload)

        assert response.status_code == 200
        body = response.json()
        assert body["used_context"] is False
        assert body["mode"] == "raw_lab"


def test_raw_lab_does_not_use_ask_harness_prompt():
    from app.config import get_settings

    provider = OpenVinoProvider(get_settings())
    provider._pipeline = object()
    provider._load_error = None

    request = RawLabRequest(message=DEFAULT_MESSAGE, recent_turns=[])

    with patch(
        "app.providers.openvino_provider.build_ask_harness_prompt",
        side_effect=AssertionError("ask harness prompt must not be used"),
    ):
        with patch(
            "app.raw_lab_budget.build_raw_lab_system_prompt",
            return_value="system instructions",
        ) as raw_system:
            with patch.object(
                provider,
                "_generate_chat",
                return_value="Plain conversational reply.",
            ) as generate_chat:
                result = provider.raw_lab(request)

    raw_system.assert_called_once()
    generate_chat.assert_called_once_with(
        system="system instructions",
        history=[],
        message=DEFAULT_MESSAGE,
    )
    assert result.answer == "Plain conversational reply."
    assert result.mode == "raw_lab"
    assert result.used_context is False


def test_sanitize_raw_lab_text_strips_thinking_and_fences():
    raw = "Hello"
    assert sanitize_raw_lab_text(raw) == "Hello"
    assert sanitize_raw_lab_text("  ```\nHi\n```  ") == "Hi"


def test_estimate_raw_lab_input_chars_includes_system_history_and_message():
    system = "system"
    request = RawLabRequest(
        message="hello",
        recent_turns=[
            RawLabTurn(role=ChatRole.user, content="prior"),
        ],
        thread_state=RawLabThreadState(recent_digest="digest"),
    )
    total = estimate_raw_lab_input_chars(system=system, request=request)
    assert total >= len(system) + len("prior") + len("hello") + len("digest")


def test_s3_still_rejects_chat_harness_before_provider(client):
    from pathlib import Path
    import json

    fixture_path = (
        Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
    )
    context = json.loads(fixture_path.read_text(encoding="utf-8"))
    payload = {
        "message": "Hello",
        "mode": "general",
        "sensitivity": "S3",
        "context": context,
        "conversation_history": [],
    }

    spy = MagicMock(side_effect=AssertionError("chat_harness should not be called for S3"))
    mock_provider = MockProvider()
    mock_provider.chat_harness = spy  # type: ignore[method-assign]
    with patch("app.main.get_provider", return_value=mock_provider):
        response = client.post("/chat-harness", json=payload)

    assert response.status_code == 422
    assert "S3" in response.json()["detail"]
    spy.assert_not_called()
