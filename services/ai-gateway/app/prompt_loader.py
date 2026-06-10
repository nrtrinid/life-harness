from pathlib import Path

import json

from app.models import (
    AnalysisMode,
    AskHarnessMode,
    AskHarnessRequest,
    ChatHarnessRequest,
    RawLabRequest,
    RawLabThreadState,
    SensitivityLevel,
)

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


def build_chat_harness_prompt(*, request: ChatHarnessRequest) -> str:
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
    return (
        template.replace("{mode}", request.mode.value)
        .replace("{sensitivity}", request.sensitivity.value)
        .replace("{message}", request.message)
        .replace("{context_json}", context_json)
        .replace("{conversation_history_json}", history_json)
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
