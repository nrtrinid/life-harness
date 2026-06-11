import json
from pathlib import Path

from app.models import (
    AskHarnessMode,
    ChatHarnessRequest,
    ChatHarnessThreadState,
    HarnessContext,
    SensitivityLevel,
)
from app.prompt_loader import build_chat_harness_prompt

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"

ASSISTANT_ACTION_KINDS = [
    "quick_capture",
    "log_win",
    "park_card",
    "update_next_tiny_action",
    "create_agent_session",
]


def test_chat_harness_prompt_includes_assistant_actions_instructions() -> None:
    context = HarnessContext.model_validate(
        json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
        thread_state=ChatHarnessThreadState(),
    )
    prompt = build_chat_harness_prompt(request=request)
    assert "assistant-actions" in prompt
    assert "the `answer` string value" in prompt
    assert "outside the JSON response envelope" in prompt
    for kind in ASSISTANT_ACTION_KINDS:
        assert kind in prompt
