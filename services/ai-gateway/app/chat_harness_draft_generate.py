from __future__ import annotations

from collections.abc import Callable

from app.config import Settings
from app.models import ChatHarnessRequest

GenerateFn = Callable[[str], str]
GenerateNativeFn = Callable[[ChatHarnessRequest, str], str]

REVISION_PROMPT_MARKER = "Critic verdict:"


def build_chat_harness_deep_draft_generate(
    *,
    settings: Settings,
    request: ChatHarnessRequest,
    generate: GenerateFn,
    generate_native: GenerateNativeFn | None = None,
) -> GenerateFn:
    def draft_generate(generation_prompt: str) -> str:
        if REVISION_PROMPT_MARKER in generation_prompt:
            return generate(generation_prompt)
        if settings.chat_harness_native_chat and generate_native is not None:
            return generate_native(request, generation_prompt)
        return generate(generation_prompt)

    return draft_generate

