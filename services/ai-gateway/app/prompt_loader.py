from pathlib import Path

import json

from app.models import (
    AnalysisMode,
    AskHarnessMode,
    AskHarnessRequest,
    ChatHarnessRequest,
    SensitivityLevel,
)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "transcript_analysis.md"
_ASK_PROMPT_PATH = Path(__file__).parent / "prompts" / "ask_harness.md"
_CHAT_PROMPT_PATH = Path(__file__).parent / "prompts" / "chat_harness.md"


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
