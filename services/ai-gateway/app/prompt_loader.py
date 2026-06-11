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
from app.context_packet_render import (
    resolve_context_bundle_for_prompt,
    resolve_critic_context_bundle_for_prompt,
)
from app.synthesis_context import (
    build_deep_synthesis_context_block,
    resolve_deep_synthesis_history_for_prompt,
    resolve_thread_state_for_synthesis_prompt,
)
from app.thread_verifier import reasoning_depth_prompt_suffix

_PROMPT_PATH = Path(__file__).parent / "prompts" / "transcript_analysis.md"
_ASK_PROMPT_PATH = Path(__file__).parent / "prompts" / "ask_harness.md"
_CHAT_PROMPT_PATH = Path(__file__).parent / "prompts" / "chat_harness.md"
_CRITIC_PROMPT_PATH = Path(__file__).parent / "prompts" / "chat_harness_critic.md"
_RAW_LAB_PROMPT_PATH = Path(__file__).parent / "prompts" / "raw_lab.md"
_RAW_LAB_SELF_REFLECTION_PROMPT_PATH = (
    Path(__file__).parent / "prompts" / "raw_lab_self_reflection.md"
)
_RAW_LAB_THREAD_REFLECTION_PROMPT_PATH = (
    Path(__file__).parent / "prompts" / "raw_lab_thread_reflection.md"
)
_DEEP_SYNTHESIS_FAST_ONLY_PROMPT_PATH = (
    Path(__file__).parent / "prompts" / "deep_synthesis_fast_only.md"
)
_SYNTHESIS_CRITIC_PROMPT_PATH = Path(__file__).parent / "prompts" / "synthesis_critic.md"


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


def load_chat_harness_critic_template() -> str:
    return _CRITIC_PROMPT_PATH.read_text(encoding="utf-8")


def build_chat_harness_critic_prompt(
    *,
    request: ChatHarnessRequest,
    draft_json: str,
    max_draft_chars: int = 2000,
) -> str:
    template = load_chat_harness_critic_template()
    context_bundle = resolve_critic_context_bundle_for_prompt(request)
    return (
        template.replace("{message}", request.message)
        .replace("{mode}", request.mode.value)
        .replace("{context_bundle}", context_bundle)
        .replace("{draft_json}", draft_json[:max_draft_chars])
    )


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
    context_json = resolve_context_bundle_for_prompt(request)
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


def _serialize_companion_self_memories(
    memories: list | None,
) -> str:
    if not memories:
        return "[]"
    payload = [memory.model_dump(mode="json") for memory in memories]
    return json.dumps(payload, indent=2, ensure_ascii=False)


def _build_companion_self_memories_preface(count: int) -> str:
    if count <= 0:
        return (
            "Active Companion Self-Memories in this request: 0\n\n"
            "No approved companion self-memories were provided in this request."
        )
    noun = "memory" if count == 1 else "memories"
    return (
        f"Active Companion Self-Memories in this request: {count}\n\n"
        f"These are approved self-{noun} you may reference as Raw Lab."
    )


def build_raw_lab_system_prompt(
    *,
    thread_state: RawLabThreadState | None = None,
    companion_self_memories: list | None = None,
    reasoning_depth: str = "fast",
) -> str:
    template = load_raw_lab_template()
    memory_count = len(companion_self_memories or [])
    return (
        template.replace("{thread_state_json}", _serialize_raw_lab_thread_state(thread_state))
        .replace("{reasoning_depth}", reasoning_depth)
        .replace(
            "{companion_self_memories_preface}",
            _build_companion_self_memories_preface(memory_count),
        )
        .replace(
            "{companion_self_memories_json}",
            _serialize_companion_self_memories(companion_self_memories),
        )
    )


def load_raw_lab_self_reflection_template() -> str:
    return _RAW_LAB_SELF_REFLECTION_PROMPT_PATH.read_text(encoding="utf-8")


def build_raw_lab_self_reflection_prompt(
    *,
    recent_turns: list,
    thread_state: RawLabThreadState | None,
    existing_self_memories: list | None,
) -> str:
    template = load_raw_lab_self_reflection_template()
    turns_json = json.dumps(
        [turn.model_dump(mode="json") for turn in recent_turns],
        indent=2,
        ensure_ascii=False,
    )
    return (
        template.replace("{recent_turns_json}", turns_json)
        .replace("{thread_state_json}", _serialize_raw_lab_thread_state(thread_state))
        .replace(
            "{existing_self_memories_json}",
            _serialize_companion_self_memories(existing_self_memories),
        )
    )


def load_raw_lab_thread_reflection_template() -> str:
    return _RAW_LAB_THREAD_REFLECTION_PROMPT_PATH.read_text(encoding="utf-8")


def build_raw_lab_thread_reflection_prompt(
    *,
    recent_turns: list,
    thread_state: RawLabThreadState | None,
    companion_self_memories: list | None,
) -> str:
    template = load_raw_lab_thread_reflection_template()
    turns_json = json.dumps(
        [turn.model_dump(mode="json") for turn in recent_turns],
        indent=2,
        ensure_ascii=False,
    )
    return (
        template.replace("{recent_turns_json}", turns_json)
        .replace("{thread_state_json}", _serialize_raw_lab_thread_state(thread_state))
        .replace(
            "{companion_self_memories_json}",
            _serialize_companion_self_memories(companion_self_memories),
        )
    )


def load_deep_synthesis_fast_only_template() -> str:
    return _DEEP_SYNTHESIS_FAST_ONLY_PROMPT_PATH.read_text(encoding="utf-8")


def load_synthesis_critic_template() -> str:
    return _SYNTHESIS_CRITIC_PROMPT_PATH.read_text(encoding="utf-8")


def build_synthesis_critic_prompt(
    *,
    user_prompt: str,
    context_block: str,
    draft_json: str,
    max_draft_chars: int = 6000,
) -> str:
    template = load_synthesis_critic_template()
    return (
        template.replace("{user_prompt}", user_prompt)
        .replace("{context_block}", context_block)
        .replace("{draft_json}", draft_json[:max_draft_chars])
    )


def build_deep_synthesis_fast_only_prompt(*, request) -> tuple[str, list[str]]:
    template = load_deep_synthesis_fast_only_template()
    context_block, context_degraded = build_deep_synthesis_context_block(request)
    history_json, history_excluded = resolve_deep_synthesis_history_for_prompt(request)
    formatter_notes = list(context_degraded) + list(history_excluded)

    if history_excluded:
        appendix_lines = ["- Excluded/summarized:"]
        appendix_lines.extend(f"  - {note}" for note in history_excluded)
        if "- Excluded/summarized:" in context_block:
            context_block = context_block + "\n" + "\n".join(
                line for line in appendix_lines if line != "- Excluded/summarized:"
            )
        else:
            context_block = context_block + "\n" + "\n".join(appendix_lines)

    thread_state_json = resolve_thread_state_for_synthesis_prompt(request)
    lenses_json = json.dumps(
        [lens.value for lens in request.interpretation_lenses],
        indent=2,
        ensure_ascii=False,
    )
    prompt = (
        template.replace("{trigger}", request.trigger.value)
        .replace("{sensitivity}", request.sensitivity.value)
        .replace("{user_prompt}", request.user_prompt)
        .replace("{context_block}", context_block)
        .replace("{conversation_history_json}", history_json)
        .replace("{thread_state_json}", thread_state_json)
        .replace("{interpretation_lenses_json}", lenses_json)
    )
    return prompt, formatter_notes


def estimate_raw_lab_input_chars(*, system: str, request: RawLabRequest) -> int:
    history_chars = sum(len(turn.content) for turn in request.recent_turns)
    thread_state_chars = len(_serialize_raw_lab_thread_state(request.thread_state))
    memories_chars = len(_serialize_companion_self_memories(request.companion_self_memories))
    return (
        len(system)
        + history_chars
        + thread_state_chars
        + memories_chars
        + len(request.message)
        + RAW_LAB_INPUT_OVERHEAD_CHARS
    )
