from __future__ import annotations

from typing import Protocol

from app.models import ConversationTurn


class InferenceBackend(Protocol):
    def ensure_ready(self) -> None: ...

    def is_model_path_ready(self) -> bool: ...

    def generate(self, prompt: str) -> str: ...

    def generate_chat(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
        generation_overrides: dict | None = None,
    ) -> str: ...

    def generate_chat_iter(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
        generation_overrides: dict | None = None,
        cancel_event: object | None = None,
    ): ...

    def generate_chat_repair(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        draft: str,
        message: str,
        repair_instruction: str | None = None,
    ) -> str: ...
