from pathlib import Path

import json

from app.models import (
    AnalysisMode,
    AskHarnessMode,
    AskHarnessRequest,
    ChatHarnessRequest,
    ChatHarnessThreadState,
    RawLabRequest,
    RawLabThreadState,
    SensitivityLevel,
)
from app.thread_verifier import reasoning_depth_prompt_suffix

_PROMPT_PATH = Path(__file__).parent / "prompts" / "transcript_analysis.md"
_ASK_PROMPT_PATH = Path(__file__).parent / "prompts" / "ask_harness.md"
_CHAT_PROMPT_PATH = Path(__file__).parent / "prompts" / "chat_harness.md"
_RAW_LAB_PROMPT_PATH = Path(__file__).parent / "prompts" / "raw_lab.md"


def load_prompt_template() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def build_analysis_prompt(
    *,
    mode: AnalysisMode,
    sensitivity: SensitivityLevel,
    transcript: str,
) -> str:
    template = load_prompt_template()
    return (
        template.replace("{mode}", mode.value)
        .replace("{sensitivity}", sensitivity.value)
        .replace("{transcript}", transcript)
    )


def load_ask_harness_template() -> str:
    return _ASK_PROMPT_PATH.read_text(encoding="utf-8")


def build_ask_harness_prompt(*, request: AskHarnessRequest) -> str:
    template = load_ask_harness_template()
    context_json = json.dumps(
        request.context.model_dump(mode="json"),
        indent=2,
        ensure_ascii=False,
    )
    history_json = json.dumps(
        [turn.model_dump(mode="json") for turn in request.conversation_history],
        indent=2,
        ensure_ascii=False,
    )
    return (
        template.replace("{mode}", request.mode.value)
        .replace("{sensitivity}", request.sensitivity.value)
        .replace("{question}", request.question)
        .replace("{context_json}", context_json)
        .replace("{conversation_history_json}", history_json)
    )


def load_chat_harness_template() -> str:
    return _CHAT_PROMPT_PATH.read_text(encoding="utf-8")


def _serialize_chat_harness_thread_state(
    thread_state: ChatHarnessThreadState | None,
) -> str:
    state = thread_state or ChatHarnessThreadState()
    return json.dumps(state.model_dump(mode="json"), indent=2, ensure_ascii=False)


def build_chat_harness_prompt(*, request: ChatHarnessRequest) -> str:
    return _render_chat_harness_template(request=request, message=request.message)


def build_chat_harness_system_prompt(*, request: ChatHarnessRequest) -> str:
    return _render_chat_harness_template(
        request=request,
        message="(see latest user message in chat)",
    )


def _render_chat_harness_template(*, request: ChatHarnessRequest, message: str) -> str:
    template = load_chat_harness_template()
    context_json = json.dumps(
        request.context.model_dump(mode="json"),
        indent=2,
        ensure_ascii=False,
    )
    history_json = json.dumps(
        [turn.model_dump(mode="json") for turn in request.conversation_history],
        indent=2,
        ensure_ascii=False,
    )
    thread_state_json = _serialize_chat_harness_thread_state(request.thread_state)
    reasoning_suffix = reasoning_depth_prompt_suffix(request.reasoning_depth)
    return (
        template.replace("{mode}", request.mode.value)
        .replace("{sensitivity}", request.sensitivity.value)
        .replace("{message}", message)
        .replace("{context_json}", context_json)
        .replace("{conversation_history_json}", history_json)
        .replace("{thread_state_json}", thread_state_json)
        .replace("{reasoning_depth}", request.reasoning_depth.value)
        .replace("{reasoning_depth_suffix}", reasoning_suffix)
    )


RAW_LAB_INPUT_OVERHEAD_CHARS = 128


def load_raw_lab_template() -> str:
    return _RAW_LAB_PROMPT_PATH.read_text(encoding="utf-8")


def _serialize_raw_lab_thread_state(thread_state: RawLabThreadState | None) -> str:
    state = thread_state or RawLabThreadState()
    return json.dumps(state.model_dump(mode="json"), indent=2, ensure_ascii=False)


def build_raw_lab_system_prompt(*, thread_state: RawLabThreadState | None = None) -> str:
    template = load_raw_lab_template()
    return template.replace("{thread_state_json}", _serialize_raw_lab_thread_state(thread_state))


def estimate_raw_lab_input_chars(*, system: str, request: RawLabRequest) -> int:
    history_chars = sum(len(turn.content) for turn in request.recent_turns)
    thread_state_chars = len(_serialize_raw_lab_thread_state(request.thread_state))
    return (
        len(system)
        + history_chars
        + thread_state_chars
        + len(request.message)
        + RAW_LAB_INPUT_OVERHEAD_CHARS
    )
