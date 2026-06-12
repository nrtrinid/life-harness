import json
from pathlib import Path

from app.models import (
    AskHarnessMode,
    ChatHarnessRequest,
    ChatHarnessThreadState,
    ChatRole,
    ConversationTurn,
    HarnessContext,
    SensitivityLevel,
)
from app.context_packet import AiContextPacketWire
from app.context_packet_render import resolve_context_bundle_for_prompt
from app.prompt_loader import build_chat_harness_prompt

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
PACKET_FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"
)
# Keep in sync with life-harness/src/core/harnessContext.ts CHAT_HARNESS_PROMPT_SHELL_CHARS
EXPECTED_SHELL_CHARS = 5472
# Keep in sync with life-harness/src/core/harnessContext.ts CHAT_HARNESS_PACKET_PROMPT_SHELL_CHARS
EXPECTED_PACKET_SHELL_CHARS = 5472


def test_chat_harness_prompt_shell_chars_match_typescript_constant():
    context = HarnessContext.model_validate(
        json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
        conversation_history=[
            ConversationTurn(role=ChatRole.user, content="prior"),
            ConversationTurn(role=ChatRole.assistant, content="answer"),
        ],
        thread_state=ChatHarnessThreadState(),
    )
    prompt = build_chat_harness_prompt(request=request)
    context_json = json.dumps(context.model_dump(mode="json"), indent=2, ensure_ascii=False)
    history_json = json.dumps(
        [turn.model_dump(mode="json") for turn in request.conversation_history],
        indent=2,
        ensure_ascii=False,
    )
    thread_state_json = json.dumps(
        request.thread_state.model_dump(mode="json"), indent=2, ensure_ascii=False
    )
    shell_chars = (
        len(prompt)
        - len(context_json)
        - len(history_json)
        - len(thread_state_json)
        - len(request.message)
    )
    assert shell_chars == EXPECTED_SHELL_CHARS, (
        f"CHAT_HARNESS_PROMPT_SHELL_CHARS drift: expected {EXPECTED_SHELL_CHARS}, "
        f"computed {shell_chars}. Update harnessContext.ts and this test."
    )


def test_chat_harness_packet_prompt_shell_chars_match_typescript_constant():
    context = HarnessContext.model_validate(
        json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
        context_packet=packet,
        conversation_history=[
            ConversationTurn(role=ChatRole.user, content="prior"),
            ConversationTurn(role=ChatRole.assistant, content="answer"),
        ],
        thread_state=ChatHarnessThreadState(),
    )
    prompt = build_chat_harness_prompt(request=request)
    context_bundle = resolve_context_bundle_for_prompt(request)
    history_json = json.dumps(
        [turn.model_dump(mode="json") for turn in request.conversation_history],
        indent=2,
        ensure_ascii=False,
    )
    thread_state_json = json.dumps(
        request.thread_state.model_dump(mode="json"), indent=2, ensure_ascii=False
    )
    shell_chars = (
        len(prompt)
        - len(context_bundle)
        - len(history_json)
        - len(thread_state_json)
        - len(request.message)
    )
    assert shell_chars == EXPECTED_PACKET_SHELL_CHARS, (
        f"CHAT_HARNESS_PACKET_PROMPT_SHELL_CHARS drift: expected "
        f"{EXPECTED_PACKET_SHELL_CHARS}, computed {shell_chars}. "
        "Update harnessContext.ts and this test."
    )
