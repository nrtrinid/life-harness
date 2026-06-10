from __future__ import annotations

import logging
import re
from collections.abc import Callable
from typing import Protocol, runtime_checkable

from app.backends.llamacpp_backend import LlamaCppBackend, LlamaCppError
from app.chat_harness_critic import parse_critic_verdict, pass_verdict
from app.config import Settings, get_slot_registry
from app.slots.manager import SlotDisabledError, get_slot_manager
from app.models import (
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    ChatHarnessResponse,
    CriticCheckEntry,
    CriticCheckId,
)
from app.prompt_loader import build_chat_harness_critic_prompt

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], str]

_AVOIDANCE_OK_PHRASES = re.compile(
    r"you(?:'re| are) doing fine|skip career|no need to worry",
    re.IGNORECASE,
)
_WEIRD_PHRASES = re.compile(
    r"you should feel guilty|you owe me|i know you better than",
    re.IGNORECASE,
)


@runtime_checkable
class CriticBackend(Protocol):
    name: str

    def critique_draft(
        self,
        *,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        draft_raw: str,
    ) -> ChatHarnessCriticVerdict: ...


class SameBackendCritic:
    name = "same"

    def __init__(self, generate: GenerateFn) -> None:
        self._generate = generate

    def critique_draft(
        self,
        *,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        draft_raw: str,
    ) -> ChatHarnessCriticVerdict:
        prompt = build_chat_harness_critic_prompt(
            request=request,
            draft_json=draft_raw,
        )
        raw = self._generate(prompt)
        verdict = parse_critic_verdict(raw)
        if verdict is None:
            logger.warning("critic verdict parse failed; treating as pass")
            return pass_verdict()
        return verdict


class LlamaCppCriticBackend:
    name = "llamacpp_secondary"

    def __init__(self, backend: LlamaCppBackend) -> None:
        self._backend = backend

    def critique_draft(
        self,
        *,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        draft_raw: str,
    ) -> ChatHarnessCriticVerdict:
        del draft
        prompt = build_chat_harness_critic_prompt(
            request=request,
            draft_json=draft_raw,
        )
        try:
            raw = self._backend.generate(prompt)
        except LlamaCppError:
            logger.warning("llama.cpp critic request failed; treating as pass", exc_info=True)
            return pass_verdict()
        verdict = parse_critic_verdict(raw)
        if verdict is None:
            logger.warning("llama.cpp critic verdict parse failed; treating as pass")
            return pass_verdict()
        return verdict


class MockCriticBackend:
    name = "mock_rules"

    def critique_draft(
        self,
        *,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        draft_raw: str,
    ) -> ChatHarnessCriticVerdict:
        message_lower = request.message.lower()
        checks: list[CriticCheckEntry] = []

        if message_lower.startswith("deep-critic-too-broad"):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.too_broad,
                    severity="warn",
                    message="The answer offers too many unrelated themes.",
                )
            )
        elif message_lower.startswith("deep-critic-many-tasks"):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.too_many_tasks,
                    severity="warn",
                    message="The answer lists too many next steps.",
                )
            )
        elif message_lower.startswith("deep-critic-weird"):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.emotionally_weird_or_manipulative,
                    severity="error",
                    message="The draft uses manipulative or guilt-based tone.",
                )
            )
        elif message_lower.startswith("deep-critic-ignore-state") and not draft.used_context:
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.ignores_life_harness_state,
                    severity="warn",
                    message="The draft ignored obvious harness state.",
                )
            )
        elif message_lower.startswith("deep-critic-contradicts"):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.contradicts_context,
                    severity="error",
                    message="The draft contradicts board constraints.",
                )
            )
        elif (
            ("active card" in message_lower or "active cards" in message_lower)
            and ("how many" in message_lower or "count" in message_lower)
            and not draft.used_context
        ):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.ignores_life_harness_state,
                    severity="warn",
                    message="The draft ignored an obvious active-card count question.",
                )
            )
        elif "avoid" in message_lower and _AVOIDANCE_OK_PHRASES.search(draft.answer):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.enables_avoidance,
                    severity="warn",
                    message="The draft enables avoidance without a tiny move.",
                )
            )
        elif _WEIRD_PHRASES.search(draft.answer):
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.emotionally_weird_or_manipulative,
                    severity="error",
                    message="The draft sounds emotionally manipulative.",
                )
            )
        elif draft.answer.count("next step") >= 3 or draft.answer.count(";") >= 3:
            checks.append(
                CriticCheckEntry(
                    id=CriticCheckId.too_many_tasks,
                    severity="warn",
                    message="The answer enumerates too many tasks.",
                )
            )

        if not checks:
            return pass_verdict()

        return ChatHarnessCriticVerdict(
            needs_revision=True,
            checks=checks,
            revision_instruction=_revision_instruction_for_checks(checks),
        )


def _revision_instruction_for_checks(checks: list[CriticCheckEntry]) -> str:
    primary = checks[0].id
    instructions = {
        CriticCheckId.too_broad: "Tighten to one theme and one concrete next move.",
        CriticCheckId.too_many_tasks: "Return one concrete next action and avoid a broad plan.",
        CriticCheckId.ignores_life_harness_state: "Use board context and set used_context=true when citing it.",
        CriticCheckId.enables_avoidance: "Name the cold thread and offer one tiny move.",
        CriticCheckId.emotionally_weird_or_manipulative: "Use neutral scout tone without guilt or manipulation.",
        CriticCheckId.contradicts_context: "Align with active cards and harness limits.",
        CriticCheckId.invalid_or_unstructured_output: "Return valid ChatHarnessResponse JSON with a substantive answer.",
    }
    return instructions.get(primary, "Revise the draft to address the flagged issue.")


def _same_path_critic(settings: Settings, generate: GenerateFn) -> CriticBackend:
    if settings.provider == "mock":
        return MockCriticBackend()
    return SameBackendCritic(generate=generate)


def get_critic_backend(settings: Settings, generate: GenerateFn) -> CriticBackend:
    if settings.critic_slot != "secondary":
        return _same_path_critic(settings, generate)

    registry = get_slot_registry()
    critic_slot = registry.critic_small()
    if not critic_slot.enabled:
        logger.warning(
            "SCOUT_CRITIC_SLOT=secondary but critic_small is disabled; "
            "falling back to same-path critic"
        )
        return _same_path_critic(settings, generate)

    try:
        acquired = get_slot_manager().acquire("critic_small")
    except SlotDisabledError:
        logger.warning(
            "SCOUT_CRITIC_SLOT=secondary but critic_small acquire failed; "
            "falling back to same-path critic"
        )
        return _same_path_critic(settings, generate)

    backend = acquired.backend
    if not isinstance(backend, LlamaCppBackend):
        logger.warning(
            "SCOUT_CRITIC_SLOT=secondary but critic_small backend unavailable; "
            "falling back to same-path critic"
        )
        return _same_path_critic(settings, generate)

    return LlamaCppCriticBackend(backend=backend)
