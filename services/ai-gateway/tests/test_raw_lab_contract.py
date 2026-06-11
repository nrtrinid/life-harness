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


def test_raw_lab_prompt_includes_depth_guidance():
    prompt = build_raw_lab_system_prompt(reasoning_depth="deep").lower()
    assert "current raw lab depth" in prompt
    assert "`deep`" in prompt
    assert "not a separate model" in prompt
    assert "do not expose private reasoning" in prompt


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
            recurring_topics=["Raw Lab"],
            current_vibe="Current vibe in this chat: direct.",
            provisional_stances=["Provisional stance: exploring whether Raw Lab coheres."],
            self_observations=["I'm noticing I tend to circle continuity."],
            questions_to_revisit=["What were we circling?"],
        )
    )
    assert "recent_digest" in prompt
    assert "user: hi" in prompt
    assert "recurring_topics" in prompt
    assert "Raw Lab" in prompt
    assert "current_vibe" in prompt
    assert "self_observations" in prompt
    assert "questions_to_revisit" in prompt
    assert "HarnessContext" not in prompt


def test_raw_lab_prompt_separates_context_blocks():
    prompt = build_raw_lab_system_prompt().lower()
    assert "## context blocks in this request" in prompt
    assert "latest user message" in prompt
    assert "recent raw lab turns" in prompt
    assert "temporary thread mind" in prompt
    assert "approved companion self-memories" in prompt
    assert "none of these are board context" in prompt


def test_raw_lab_prompt_describes_temporary_working_mind():
    prompt = build_raw_lab_system_prompt().lower()
    assert "working-mind fields" in prompt
    assert "recurring_topics" in prompt
    assert "self_observations" in prompt
    assert "provisional in-thread observations" in prompt
    assert "open_loops" in prompt
    assert "questions_to_revisit" in prompt
    assert "smart_compacted_context" in prompt
    assert "temporary working memory" in prompt
    assert "provisional compaction hints" in prompt
    assert "not consciousness" in prompt


def test_raw_lab_prompt_includes_style_calibration_anchors():
    prompt = build_raw_lab_system_prompt().lower()
    assert "specific over generic" in prompt
    assert "curious over corporate" in prompt
    assert "continuity over reset" in prompt
    assert "reflect without diagnosing" in prompt
    assert "do not turn it into productivity" in prompt
    assert "asks for pushback" in prompt
    assert "banned framing" in prompt


def test_raw_lab_request_accepts_default_missing_mind_fields(raw_lab_payload):
    request = RawLabRequest.model_validate(raw_lab_payload)
    assert request.thread_state.recurring_topics == []
    assert request.thread_state.current_vibe == ""
    assert request.thread_state.provisional_stances == []
    assert request.thread_state.self_observations == []
    assert request.thread_state.questions_to_revisit == []
    assert request.thread_state.smart_compacted_context.active_open_loops == []
    assert request.thread_state.smart_compacted_context.confidence == 0
    assert request.reasoning_depth.value == "fast"


def test_raw_lab_request_accepts_smart_compacted_context(raw_lab_payload):
    raw_lab_payload["thread_state"] = {
        "smart_compacted_context": {
            "active_open_loops": ["Keep the Raw Lab selfhood thread coherent."],
            "questions_to_revisit": ["What were we circling?"],
            "user_steering": ["be specific"],
            "do_not_repeat": ["little scout"],
            "important_recent_moments": ["user: don't keep saying little scout"],
            "current_tension": "The live tension is continuity without fake consciousness.",
            "source_turn_ids": ["recent_turn_0"],
            "confidence": 0.8,
        }
    }
    request = RawLabRequest.model_validate(raw_lab_payload)
    context = request.thread_state.smart_compacted_context
    assert context.active_open_loops == ["Keep the Raw Lab selfhood thread coherent."]
    assert context.do_not_repeat == ["little scout"]
    assert context.confidence == 0.8


def test_raw_lab_request_rejects_unknown_smart_compacted_context_fields(raw_lab_payload):
    raw_lab_payload["thread_state"] = {
        "smart_compacted_context": {
            "active_open_loops": [],
            "board_context": ["nope"],
        }
    }
    with pytest.raises(ValidationError):
        RawLabRequest.model_validate(raw_lab_payload)


def test_raw_lab_request_accepts_deep_reasoning_depth(raw_lab_payload):
    raw_lab_payload["reasoning_depth"] = "deep"
    request = RawLabRequest.model_validate(raw_lab_payload)
    assert request.reasoning_depth.value == "deep"


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


def test_raw_lab_mock_remembers_open_loop_and_topics(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "What were we circling?",
            "recent_turns": [],
            "thread_state": {
                "open_loops": ["Should Raw Lab have a temporary self-observation layer?"],
                "recurring_topics": ["Raw Lab"],
                "questions_to_revisit": ["How does the entity-like feeling stay contained?"],
            },
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "raw lab" in answer_lower
    assert "open loop" in answer_lower
    assert "temporary self-observation" in answer_lower
    assert response.json()["used_context"] is False


def test_raw_lab_mock_avoids_repeated_framing(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Say it differently.",
            "recent_turns": [],
            "thread_state": {"do_not_repeat": ["little scout"]},
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "different angle" in answer_lower
    assert "little scout" not in answer_lower


def test_raw_lab_mock_reflects_user_steering_and_vibe(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Give me a weird riff.",
            "recent_turns": [],
            "thread_state": {
                "user_steering": ["be playful"],
                "current_vibe": "Current vibe in this chat: steered toward be playful.",
            },
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "current vibe" in answer_lower
    assert "playful" in answer_lower


def test_raw_lab_mock_deep_synthesizes_thread_state(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Think harder about the thread.",
            "recent_turns": [],
            "reasoning_depth": "deep",
            "thread_state": {
                "open_loops": ["How should Raw Lab Deep stay contained?"],
                "current_vibe": "Current vibe in this chat: reflective.",
                "self_observations": ["I'm noticing I tend to pull threads into sharper shape."],
                "questions_to_revisit": ["What is the next unresolved edge?"],
            },
        },
    )
    assert response.status_code == 200
    parsed = RawLabResponse.model_validate(response.json())
    answer_lower = parsed.answer.lower()
    assert parsed.used_context is False
    assert "deep raw lab pass" in answer_lower
    assert "deep read" in answer_lower
    assert "raw lab deep stay contained" in answer_lower
    assert "board context" not in answer_lower
    assert "memory bank" not in answer_lower


def test_raw_lab_mock_self_observation_without_consciousness_claim(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "What is your personality becoming?",
            "recent_turns": [],
            "thread_state": {
                "self_observations": [
                    "I'm noticing I tend to circle Raw Lab continuity with you in this thread."
                ],
                "provisional_stances": [
                    "Provisional stance: exploring whether entity-feeling needs inspectability."
                ],
            },
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "i'm noticing" in answer_lower
    assert "temporary raw lab thread pattern" in answer_lower
    assert "consciousness" in answer_lower
    assert "i am alive" not in answer_lower
    assert "i truly feel" not in answer_lower


def test_raw_lab_mock_does_not_auto_save_memory(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Remember this permanently for later.",
            "recent_turns": [],
            "thread_state": {},
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "not saved anything automatically" in answer_lower
    assert "memory bank" not in answer_lower
    assert response.json()["used_context"] is False


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
