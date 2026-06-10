from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from typing import Protocol, runtime_checkable

from app.backends.llamacpp_backend import (
    LlamaCppError,
    build_llamacpp_backend_for_critic,
)
from app.config import Settings, get_settings
from app.models import CardState, LifeArea, WarmthLevel
from app.prompt_loader import build_synthesis_critic_prompt
from app.providers.base import ProviderParseError, parse_strict_json, sanitize_raw_lab_text
from app.synthesis_models import (
    DeepSynthesisCompletedBody,
    DeepSynthesisRequest,
    SynthesisCritique,
    SynthesisGroundingKind,
)

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], str]

_GENERIC_PHRASES = re.compile(
    r"just prioritize|time management|5-step plan|productivity hack",
    re.IGNORECASE,
)
_WEIRD_PHRASES = re.compile(
    r"you should feel guilty|you owe me|i know you better than|you owe",
    re.IGNORECASE,
)
_COLD_WARMTH = {WarmthLevel.cold, WarmthLevel.cooling, WarmthLevel.dormant}
_BUILD_CAREER_PROMPT_RE = re.compile(r"\b(build|career)\b", re.IGNORECASE)


def _combined_draft_text(draft: DeepSynthesisCompletedBody) -> str:
    parts = [
        draft.circling,
        draft.strongest_idea,
        draft.hidden_risk,
        *draft.connections,
    ]
    for interpretation in draft.interpretations:
        parts.append(interpretation.summary)
    return "\n".join(parts)


def _only_prompt_grounding(refs: list) -> bool:
    return bool(refs) and all(
        ref.kind == SynthesisGroundingKind.inferred_from_prompt for ref in refs
    )


def _context_has_active_cards(request: DeepSynthesisRequest, context_block: str) -> bool:
    active = [card for card in request.context.cards if card.state == CardState.active]
    if active:
        return True
    return "Active card:" in context_block


def _hot_build_titles(request: DeepSynthesisRequest) -> list[str]:
    return [
        card.title
        for card in request.context.cards
        if card.area == LifeArea.build
        and card.state == CardState.active
        and card.warmth in (WarmthLevel.hot, WarmthLevel.warm)
    ]


def _cold_career_titles(request: DeepSynthesisRequest) -> list[str]:
    titles: list[str] = []
    for card in request.context.cards:
        if card.area not in (LifeArea.social_career, LifeArea.body):
            continue
        if card.warmth in _COLD_WARMTH or card.state == CardState.parked:
            titles.append(card.title)
    return titles


def _draft_mentions_any(text: str, titles: list[str]) -> bool:
    lowered = text.lower()
    return any(title.lower() in lowered for title in titles)


def _build_revision_brief(
    *,
    shallow_flags: list[str],
    missing: list[str],
    avoidance: list[str],
    contradictions: list[str],
) -> str:
    if avoidance:
        return "Name the cold career card and one hot build card in circling with board grounding."
    if missing:
        return "Add active-card or proof grounding instead of prompt-only refs."
    if shallow_flags:
        return "Replace generic advice with one board-grounded next move."
    if contradictions:
        return "Use neutral scout tone without guilt or manipulation."
    return "Tighten the synthesis to one grounded move."


def parse_synthesis_critique(raw: str) -> SynthesisCritique | None:
    try:
        parsed = parse_strict_json(sanitize_raw_lab_text(raw), SynthesisCritique)
    except ProviderParseError:
        return None

    overall = parsed.overall
    if overall not in ("pass", "revise"):
        return None

    needs_revision = bool(
        parsed.shallow_flags or parsed.missing or parsed.avoidance or parsed.contradictions
    )
    if needs_revision and overall != "revise":
        overall = "revise"

    if overall == "pass" and needs_revision:
        overall = "revise"

    revision_brief = parsed.revision_brief
    if overall == "revise" and not revision_brief:
        revision_brief = _build_revision_brief(
            shallow_flags=parsed.shallow_flags,
            missing=parsed.missing,
            avoidance=parsed.avoidance,
            contradictions=parsed.contradictions,
        )

    return SynthesisCritique(
        shallow_flags=list(parsed.shallow_flags),
        missing=list(parsed.missing),
        avoidance=list(parsed.avoidance),
        contradictions=list(parsed.contradictions),
        overall=overall,
        revision_brief=revision_brief if overall == "revise" else None,
    )


@runtime_checkable
class SynthesisCriticBackend(Protocol):
    name: str

    def critique_draft(
        self,
        *,
        request: DeepSynthesisRequest,
        context_block: str,
        draft: DeepSynthesisCompletedBody,
    ) -> tuple[SynthesisCritique, list[str]]: ...


class MockSynthesisCriticBackend:
    name = "mock_rules"

    def critique_draft(
        self,
        *,
        request: DeepSynthesisRequest,
        context_block: str,
        draft: DeepSynthesisCompletedBody,
    ) -> tuple[SynthesisCritique, list[str]]:
        shallow_flags: list[str] = []
        missing: list[str] = []
        avoidance: list[str] = []
        contradictions: list[str] = []

        combined = _combined_draft_text(draft)

        if _GENERIC_PHRASES.search(combined):
            shallow_flags.append("Draft uses generic productivity advice instead of board specifics.")

        if _WEIRD_PHRASES.search(combined):
            contradictions.append("Draft uses manipulative or guilt-based tone.")

        major_grounding = (
            draft.circling_grounding
            + draft.strongest_idea_grounding
            + draft.hidden_risk_grounding
        )
        if _context_has_active_cards(request, context_block) and _only_prompt_grounding(
            major_grounding
        ):
            missing.append("Major fields rely only on prompt inference while active cards exist.")

        hot_build = _hot_build_titles(request)
        cold_career = _cold_career_titles(request)
        prompt_signals_tension = (
            _BUILD_CAREER_PROMPT_RE.search(request.user_prompt)
            and bool(hot_build)
            and bool(cold_career)
        )
        if prompt_signals_tension:
            mentions_build = _draft_mentions_any(combined, hot_build)
            mentions_career = _draft_mentions_any(combined, cold_career)
            if not (mentions_build and mentions_career):
                avoidance.append(
                    "Build/career tension is visible on the board but the draft omits one side."
                )

        pounce = draft.next_pounce
        if (
            not pounce.title.strip()
            or not pounce.smallest_action.strip()
            or not pounce.grounding
        ):
            missing.append("next_pounce is missing title, smallest_action, or grounding.")

        if combined.lower().count("pounce") >= 3:
            shallow_flags.append("Draft mentions multiple pounces; deep synthesis allows exactly one.")

        if combined.count(";") >= 4 or combined.lower().count("next step") >= 3:
            shallow_flags.append("Draft enumerates too many next steps.")

        needs_revision = bool(shallow_flags or missing or avoidance or contradictions)
        if not needs_revision:
            return (
                SynthesisCritique(
                    shallow_flags=[],
                    missing=[],
                    avoidance=[],
                    contradictions=[],
                    overall="pass",
                ),
                [],
            )

        return (
            SynthesisCritique(
                shallow_flags=shallow_flags,
                missing=missing,
                avoidance=avoidance,
                contradictions=contradictions,
                overall="revise",
                revision_brief=_build_revision_brief(
                    shallow_flags=shallow_flags,
                    missing=missing,
                    avoidance=avoidance,
                    contradictions=contradictions,
                ),
            ),
            [],
        )


class LlamaCppSynthesisCriticBackend:
    name = "llamacpp_synthesis_critic"

    def __init__(
        self,
        *,
        settings: Settings,
        generate: GenerateFn | None = None,
    ) -> None:
        self._settings = settings
        self._generate = generate or build_llamacpp_backend_for_critic(settings).generate
        self._fallback = MockSynthesisCriticBackend()

    def _critique_with_generate(
        self,
        *,
        request: DeepSynthesisRequest,
        context_block: str,
        draft: DeepSynthesisCompletedBody,
    ) -> tuple[SynthesisCritique, list[str]]:
        draft_json = json.dumps(
            draft.model_dump(mode="json", exclude={"status"}),
            indent=2,
            ensure_ascii=False,
        )
        prompt = build_synthesis_critic_prompt(
            user_prompt=request.user_prompt,
            context_block=context_block,
            draft_json=draft_json,
        )

        try:
            raw = self._generate(prompt)
            critique = parse_synthesis_critique(raw)
            if critique is None:
                logger.warning("synthesis critic JSON parse failed; falling back to mock rules")
                critique, _ = self._fallback.critique_draft(
                    request=request,
                    context_block=context_block,
                    draft=draft,
                )
                return critique, ["Critic JSON parse failed; mock rules critic used."]
            return critique, []
        except LlamaCppError as exc:
            logger.warning("synthesis critic llamacpp failed: %s", exc)
            critique, _ = self._fallback.critique_draft(
                request=request,
                context_block=context_block,
                draft=draft,
            )
            return critique, ["Critic runtime llamacpp unavailable; mock rules critic used."]
        except Exception as exc:
            logger.warning("synthesis critic unexpected failure: %s", exc)
            critique, _ = self._fallback.critique_draft(
                request=request,
                context_block=context_block,
                draft=draft,
            )
            return critique, ["Critic runtime failed unexpectedly; mock rules critic used."]

    def critique_draft(
        self,
        *,
        request: DeepSynthesisRequest,
        context_block: str,
        draft: DeepSynthesisCompletedBody,
    ) -> tuple[SynthesisCritique, list[str]]:
        return self._critique_with_generate(
            request=request,
            context_block=context_block,
            draft=draft,
        )


def get_synthesis_critic_backend(
    settings: Settings | None = None,
) -> SynthesisCriticBackend:
    resolved = settings or get_settings()
    if resolved.critic_runtime == "llamacpp":
        return LlamaCppSynthesisCriticBackend(settings=resolved)
    return MockSynthesisCriticBackend()


def run_synthesis_critique(
    *,
    request: DeepSynthesisRequest,
    context_block: str,
    draft: DeepSynthesisCompletedBody,
    settings: Settings | None = None,
) -> tuple[SynthesisCritique, list[str]]:
    return get_synthesis_critic_backend(settings).critique_draft(
        request=request,
        context_block=context_block,
        draft=draft,
    )
