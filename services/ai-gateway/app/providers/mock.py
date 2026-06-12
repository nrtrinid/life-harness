import json
import re

from app.models import (
    AnalysisMode,
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    AskHarnessMode,
    AskHarnessRequest,
    AskHarnessResponse,
    CardState,
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    ChatHarnessResponse,
    CriticCheckId,
    GroundingItem,
    GroundingSourceType,
    HarnessContextCard,
    HarnessLogEntry,
    HealthStatus,
    LifeArea,
    PossibleCard,
    ProposedCardUpdate,
    ProviderHealth,
    RawLabRequest,
    RawLabResponse,
    WarmthLevel,
)

from app.chat_harness_finalize import finalize_chat_harness_response
from app.thread_verifier import (
    DETERMINISTIC_STEERING_CHECKS,
    VerificationResult,
    _RAW_LAB_CAPABILITY_QUESTION_RE,
    finalize_raw_lab_answer,
    has_handoff_ending,
    no_handoff_steering_active,
    reflection_prompt_active,
    verify_chat_harness_response,
    verify_raw_lab_response,
)

INFERRED_PREFIX = "Inferred from transcript — "

THEME_PATTERNS: list[tuple[str, str]] = [
    (r"\b(procrastinat|putting off|haven'?t started|keep avoiding)\b", "procrastination"),
    (r"\b(over-?optim|perfect system|better workflow|new tool|rabbit hole)\b", "over-optimization"),
    (r"\b(day is (dead|ruined|shot)|too late now|might as well give up)\b", "day-is-dead thinking"),
    (r"\b(career|job|interview|resume|linkedin|networking)\b", "career follow-ups"),
    (r"\b(sleep|gym|workout|exercise|eat|meal|walk|shower)\b", "body / stability"),
    (r"\b(money|budget|bills|rent|savings|debt)\b", "money / independence"),
    (r"\b(friend|text back|call|social|lonely)\b", "social follow-ups"),
    (r"\b(open loop|unfinished|still need to|forgot to|left hanging)\b", "open loops"),
    (r"\b(self.?sufficien|independen|on my own)\b", "self-sufficiency"),
]

PARK_PATTERNS: list[tuple[str, str]] = [
    (r"\b(research|read about|watch videos|compare tools|setup|configure)\b", "research / tooling rabbit hole"),
    (r"\b(reorganiz|clean desk|new app|switch to)\b", "optimization instead of doing"),
]

MODE_SUMMARY_PREFIX: dict[AnalysisMode, str] = {
    AnalysisMode.operator: "Scout read-through: ",
    AnalysisMode.reflection: "Gentle reflection: ",
    AnalysisMode.coach: "Encouraging read: ",
}


def _find_matches(text: str, patterns: list[tuple[str, str]]) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for pattern, label in patterns:
        if re.search(pattern, lower, re.IGNORECASE):
            found.append(label)
    return found


def _first_sentence(text: str, max_len: int = 120) -> str:
    snippet = text.strip().split("\n")[0].strip()
    if len(snippet) > max_len:
        snippet = snippet[: max_len - 3].rstrip() + "..."
    return snippet or "A rambly note with several threads."


def _build_cards(themes: list[str], text: str) -> list[PossibleCard]:
    cards: list[PossibleCard] = []
    area_map: dict[str, LifeArea] = {
        "career follow-ups": LifeArea.social_career,
        "body / stability": LifeArea.body,
        "money / independence": LifeArea.money_independence,
        "social follow-ups": LifeArea.social_career,
        "open loops": LifeArea.build,
        "self-sufficiency": LifeArea.money_independence,
        "procrastination": LifeArea.build,
        "over-optimization": LifeArea.build,
        "day-is-dead thinking": LifeArea.stability_vices,
    }
    action_map: dict[str, str] = {
        "career follow-ups": "Open the one career item and write the next tiny step.",
        "body / stability": "Do one 5-minute body reset (water, stretch, or short walk).",
        "money / independence": "List one bill or money task and pick a 2-minute first move.",
        "social follow-ups": "Draft one short reply or schedule one ping.",
        "open loops": "Name one open loop and write the smallest close-out step.",
        "procrastination": "Set a 10-minute timer and touch the avoided task.",
        "over-optimization": "Park the tooling idea; do one real deliverable step.",
        "day-is-dead thinking": "Pick one salvage move that still counts today.",
    }
    for theme in themes[:3]:
        area = area_map.get(theme, LifeArea.build)
        action = action_map.get(theme, "Write one next tiny action for this thread.")
        title = theme.replace("/", "—").title()
        cards.append(
            PossibleCard(
                title=title,
                area=area,
                state=CardState.inbox,
                next_tiny_action=action,
                why_it_matters=f"Thread surfaced in your note; worth capturing without promoting to Active yet.",
            )
        )
    if not cards:
        cards.append(
            PossibleCard(
                title="Capture follow-up",
                area=LifeArea.build,
                state=CardState.inbox,
                next_tiny_action="Re-read the note and star one line that needs a next step.",
                why_it_matters="Something in here may matter; inbox keeps it safe until you choose.",
            )
        )
    return cards


_COLD_WARMTH = {WarmthLevel.cold, WarmthLevel.cooling, WarmthLevel.dormant}
_AVOIDANCE_RE = re.compile(
    r"\b(avoid|resume|job|network|career|apply|follow.?up)\b",
    re.IGNORECASE,
)
_TOOLING_RE = re.compile(
    r"\b(over.?optim|tool|workflow|setup|llm|compare)\b",
    re.IGNORECASE,
)
_BODY_RE = re.compile(r"\b(gym|fitness|body|eat|walk|workout)\b", re.IGNORECASE)
_HIGH_STAKES_RE = re.compile(
    r"\b(diagnos|prescri|legal|invest|trade|suicid)\b",
    re.IGNORECASE,
)


def _card_grounding(card: HarnessContextCard) -> GroundingItem:
    return GroundingItem(
        source_type=GroundingSourceType.card,
        label=card.title,
        summary=f"{card.area.value} · {card.state.value} · {card.warmth.value}",
    )


def _log_grounding(entry: HarnessLogEntry) -> GroundingItem:
    return GroundingItem(
        source_type=GroundingSourceType.log,
        label=entry.card_title or entry.summary[:40],
        summary=entry.summary,
    )


def _cold_career_body_cards(cards: list[HarnessContextCard]) -> list[HarnessContextCard]:
    result: list[HarnessContextCard] = []
    for card in cards:
        if card.area not in (LifeArea.social_career, LifeArea.body):
            continue
        if card.warmth in _COLD_WARMTH or card.state == CardState.parked:
            result.append(card)
    return result


def _build_win_logs(logs: list[HarnessLogEntry]) -> list[HarnessLogEntry]:
    return [
        log
        for log in logs
        if log.type.value == "win" or log.area.lower() == "build"
    ]


def _avoidance_logs(logs: list[HarnessLogEntry]) -> list[HarnessLogEntry]:
    return [log for log in logs if _AVOIDANCE_RE.search(log.summary)]


def _tooling_logs(logs: list[HarnessLogEntry]) -> list[HarnessLogEntry]:
    return [log for log in logs if _TOOLING_RE.search(log.summary)]


def _body_logs(logs: list[HarnessLogEntry]) -> list[HarnessLogEntry]:
    return [log for log in logs if _BODY_RE.search(log.summary + log.area)]


def _hot_build_cards(cards: list[HarnessContextCard]) -> list[HarnessContextCard]:
    return [
        card
        for card in cards
        if card.area == LifeArea.build
        and card.state == CardState.active
        and card.warmth in (WarmthLevel.hot, WarmthLevel.warm)
    ]


class MockProvider:
    name = "mock"

    def health(self) -> ProviderHealth:
        return ProviderHealth(
            status=HealthStatus.ok,
            provider_ready=True,
            model="mock-rules-v0",
            device="local",
            message=None,
        )

    def analyze(self, request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse:
        text = request.text
        themes = _find_matches(text, THEME_PATTERNS)
        if not themes:
            themes = ["scattered threads", "unclear priority"]

        park_items = _find_matches(text, PARK_PATTERNS)
        if not park_items:
            park_items = ["ideas that may be optimization — verify before acting"]

        patterns = list(dict.fromkeys(themes + park_items))
        cards = _build_cards(themes, text)
        prefix = MODE_SUMMARY_PREFIX[request.mode]
        summary = (
            f"{prefix}{_first_sentence(text)} "
            f"I noticed {len(themes)} recurring thread(s). "
            "These are suggestions — you approve what becomes real."
        )

        next_actions = [card.next_tiny_action for card in cards[:2]]
        if not next_actions:
            next_actions = ["Pick one thread and write a 2-minute first step."]

        pounce = next_actions[0]
        if "timer" not in pounce.lower():
            pounce = f"10-minute pounce: {pounce}"

        confidence_notes = [
            f"{INFERRED_PREFIX}themes and cards are heuristic guesses from keyword patterns.",
            f"{INFERRED_PREFIX}not verified facts about your life or obligations.",
            "S3 content would not reach a model; this mock still treats notes as uncertain.",
        ]

        return AnalyzeTranscriptResponse(
            summary=summary,
            themes=themes,
            possible_cards=cards,
            next_actions=next_actions,
            pounce_mission=pounce,
            things_to_park=park_items,
            patterns_detected=patterns,
            confidence_notes=confidence_notes,
        )

    def ask_harness(self, request: AskHarnessRequest) -> AskHarnessResponse:
        ctx = request.context
        question_lower = request.question.lower()
        cards = ctx.cards
        logs = ctx.logs

        cold_cards = _cold_career_body_cards(cards)
        build_wins = _build_win_logs(logs)
        avoid_logs = _avoidance_logs(logs)
        tooling_logs = _tooling_logs(logs)
        body_logs = _body_logs(logs)
        hot_build = _hot_build_cards(cards)

        grounding: list[GroundingItem] = []
        patterns: list[str] = []
        next_actions: list[str] = []
        proposed: list[ProposedCardUpdate] = []
        safety_notes: list[str] = []

        if _HIGH_STAKES_RE.search(request.question):
            safety_notes.append(
                "Question may touch high-stakes topics — staying in scout lane only."
            )

        if "avoid" in question_lower:
            parts: list[str] = []
            if cold_cards:
                titles = ", ".join(c.title for c in cold_cards[:3])
                parts.append(
                    f"Based on the provided cards, cold or cooling areas include: {titles}."
                )
                grounding.extend(_card_grounding(c) for c in cold_cards[:3])
            if avoid_logs:
                parts.append(
                    f"A log notes: \"{avoid_logs[0].summary}\" — career follow-up may be deferred."
                )
                grounding.append(_log_grounding(avoid_logs[0]))
            if len(build_wins) >= 2 and len(body_logs) == 0:
                parts.append(
                    f"Build activity is high ({len(build_wins)} recent wins/logs) "
                    "with no recent body logs in context."
                )
            if not parts:
                parts.append(
                    "Context does not show a clear avoidance pattern — review active cards manually."
                )
            answer = " ".join(parts)
            if cold_cards:
                patterns.append("cold or cooling career/body cards")
            if avoid_logs:
                patterns.append("career avoidance in logs")
            if len(build_wins) >= 2 and len(body_logs) == 0:
                patterns.append("build-heavy focus vs body neglect")
            if cold_cards:
                career = next(
                    (c for c in cold_cards if c.area == LifeArea.social_career),
                    None,
                )
                if career:
                    next_actions.append(career.next_tiny_action)
                    proposed.append(
                        ProposedCardUpdate(
                            card_title=career.title,
                            proposed_change="Unpark and write one tiny career step.",
                            requires_approval=True,
                        )
                    )
            body_card = next(
                (c for c in cards if c.area == LifeArea.body),
                None,
            )
            if body_card and len(body_logs) == 0:
                next_actions.append(body_card.next_tiny_action)
        elif "over-optim" in question_lower or request.mode == AskHarnessMode.reflection:
            answer_parts: list[str] = []
            if tooling_logs:
                answer_parts.append(
                    f"Based on the provided logs, tooling/thread risk: \"{tooling_logs[0].summary}\"."
                )
                grounding.append(_log_grounding(tooling_logs[0]))
            parked_tool = next(
                (
                    c
                    for c in cards
                    if c.state == CardState.parked
                    and c.area == LifeArea.money_independence
                ),
                None,
            )
            if parked_tool:
                answer_parts.append(
                    f"Parked card \"{parked_tool.title}\" may be an optimization rabbit hole."
                )
                grounding.append(_card_grounding(parked_tool))
            answer = (
                " ".join(answer_parts)
                if answer_parts
                else "No strong over-optimization signal in the provided context."
            )
            patterns.append("over-optimization risk")
            next_actions.append("Park the tooling idea; do one real deliverable step.")
        elif "build next" in question_lower or request.mode == AskHarnessMode.builder:
            targets = hot_build[:2] or [c for c in cards if c.state == CardState.active][:2]
            if targets:
                names = " and ".join(c.title for c in targets)
                answer = (
                    f"Based on the provided cards, hot active build threads include {names}. "
                    f"Next slice: {targets[0].next_tiny_action}"
                )
                grounding.extend(_card_grounding(c) for c in targets[:2])
                next_actions.append(targets[0].next_tiny_action)
            else:
                answer = "No active build cards in context — add or activate one first."
            patterns.append("build focus")
        else:
            active = [c for c in cards if c.state == CardState.active]
            if active:
                answer = (
                    f"Based on the provided cards, active threads include "
                    f"{', '.join(c.title for c in active[:3])}. "
                    f"Suggested move: {active[0].next_tiny_action}"
                )
                grounding.append(_card_grounding(active[0]))
                next_actions.append(active[0].next_tiny_action)
            else:
                answer = "Context has no active cards — pick one inbox item to touch."
            patterns.append("general scout read")

        if not next_actions:
            next_actions = ["Pick one card and write a 2-minute first step."]

        confidence_notes = [
            f"{INFERRED_PREFIX}answer derived from provided context bundle only.",
            f"{INFERRED_PREFIX}patterns are heuristic, not verified facts.",
        ]

        return AskHarnessResponse(
            answer=answer,
            grounding=grounding or [
                GroundingItem(
                    source_type=GroundingSourceType.none,
                    label="context",
                    summary="Limited grounding available from provided bundle.",
                )
            ],
            patterns_detected=list(dict.fromkeys(patterns)) or ["context scan"],
            suggested_next_actions=next_actions[:4],
            proposed_card_updates=proposed,
            confidence_notes=confidence_notes,
            safety_notes=safety_notes,
        )

    def _chat_harness_history_aware_answer(
        self, request: ChatHarnessRequest
    ) -> tuple[str, bool] | None:
        """Simple continuity responses for multi-turn mock tests."""
        message_lower = request.message.lower().strip()
        history = request.conversation_history
        if not history:
            return None

        last_assistant = next(
            (
                turn.content
                for turn in reversed(history)
                if turn.role.value == "assistant"
            ),
            "",
        )

        if message_lower in {"continue", "go on", "keep going"} and last_assistant:
            snippet = last_assistant[:120].rstrip()
            if len(last_assistant) > 120:
                snippet += "..."
            return (
                f"Continuing from where we left off: {snippet}",
                False,
            )

        if "shorter" in message_lower and last_assistant:
            words = last_assistant.split()
            short = " ".join(words[: max(8, len(words) // 2)])
            return (short.rstrip(".,;:") + ".", False)

        if "say that again" in message_lower or (
            "again" in message_lower and len(message_lower.split()) <= 4
        ):
            if last_assistant:
                return (
                    "Fresh angle: same point, different wording — without repeating the prior line verbatim.",
                    False,
                )

        if any(
            phrase in message_lower
            for phrase in ("second one", "second option", "option b", "do the second")
        ):
            for turn in reversed(history):
                if turn.role.value != "assistant":
                    continue
                lowered = turn.content.lower()
                if "option b" in lowered or "b:" in lowered:
                    for line in turn.content.splitlines():
                        if "option b" in line.lower() or line.strip().lower().startswith("b)"):
                            return (line.strip(), False)
                    return ("Option B: multi-pass reasoning", False)
                if "option a" in lowered or "a:" in lowered:
                    continue
            return ("Option B: multi-pass reasoning", False)

        return None

    def _repair_chat_harness_mock(
        self,
        verification: VerificationResult,
        request: ChatHarnessRequest,
        response: ChatHarnessResponse,
    ) -> ChatHarnessResponse:
        answer = response.answer
        used_context = response.used_context
        confidence_notes = list(response.confidence_notes)
        safety_notes = list(response.safety_notes)

        if verification.check == "ignored_steering":
            words = answer.split()
            answer = " ".join(words[: max(8, len(words) // 2)]).rstrip(".,;:") + "."
        elif verification.check == "board_mutation_claim":
            answer = answer.replace("I updated", "You could update").replace(
                "I changed", "You could change"
            )
        elif verification.check == "anti_repeat":
            answer = (
                "Here's a fresh phrasing: advancing the thread without repeating the prior answer."
            )

        return ChatHarnessResponse(
            answer=answer,
            used_context=used_context,
            confidence_notes=[*confidence_notes, f"Inferred — repaired {verification.check}."],
            safety_notes=safety_notes,
        )

    def _finalize_chat_harness_mock(
        self,
        request: ChatHarnessRequest,
        response: ChatHarnessResponse,
    ) -> ChatHarnessResponse:
        return finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=self._repair_chat_harness_mock,
        )

    def chat_harness(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        from app.orchestrator.inference_orchestrator import get_inference_orchestrator

        return get_inference_orchestrator().run_chat_harness(request)

    def _run_chat_harness_impl(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        history_answer = self._chat_harness_history_aware_answer(request)
        if history_answer is not None:
            answer, used_context = history_answer
            return self._finalize_chat_harness_mock(
                request,
                ChatHarnessResponse(
                    answer=answer,
                    used_context=used_context,
                    confidence_notes=[
                        "Inferred — continuity response from conversation history only.",
                    ],
                    safety_notes=[],
                ),
            )

        response = self._build_chat_harness_mock_draft(request)
        if request.reasoning_depth.value == "deliberate":
            notes = list(response.confidence_notes)
            notes.append("Deliberate mode: checked goal and repetition before answering.")
            response = ChatHarnessResponse(
                answer=response.answer,
                used_context=response.used_context,
                confidence_notes=notes,
                safety_notes=list(response.safety_notes),
            )
        return self._finalize_chat_harness_mock(request, response)

    def _run_chat_harness_deep(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        from app.chat_harness_critic import append_deep_critic_note
        from app.chat_harness_deep import run_chat_harness_deep
        from app.config import get_settings
        from app.critic_backend import get_critic_backend
        from app.prompt_loader import build_chat_harness_prompt

        history_answer = self._chat_harness_history_aware_answer(request)
        if history_answer is not None:
            answer, used_context = history_answer
            return self._finalize_chat_harness_mock(
                request,
                ChatHarnessResponse(
                    answer=answer,
                    used_context=used_context,
                    confidence_notes=[
                        "Inferred — continuity response from conversation history only.",
                    ],
                    safety_notes=[],
                ),
            )

        from app.chat_harness_thinking_trace import emit_thinking_trace, new_thinking_trace

        settings = get_settings()
        prompt = build_chat_harness_prompt(request=request)
        trace = new_thinking_trace(request) if settings.debug_thinking_trace else None
        stored_draft: ChatHarnessResponse | None = None
        last_verdict: list[ChatHarnessCriticVerdict] = []

        class _CapturingCritic:
            def __init__(self, inner) -> None:
                self._inner = inner

            @property
            def name(self) -> str:
                return self._inner.name

            def critique_draft(self, **kwargs):
                verdict = self._inner.critique_draft(**kwargs)
                last_verdict.clear()
                last_verdict.append(verdict)
                return verdict

        simulate_draft_repair = request.message.lower().startswith("deep-draft-repair")

        def draft_generate(generation_prompt: str) -> str:
            nonlocal stored_draft
            if "Critic verdict:" in generation_prompt:
                assert stored_draft is not None and last_verdict
                revised = self._apply_mock_deep_revision(
                    request,
                    stored_draft,
                    last_verdict[0],
                )
                return revised.model_dump_json()
            stored_draft = self._build_chat_harness_mock_draft(request)
            if simulate_draft_repair:
                return "not valid json"
            return stored_draft.model_dump_json()

        draft_repair_generate = None
        if simulate_draft_repair:

            def draft_repair_generate(_broken: str) -> str:
                draft = self._build_chat_harness_mock_draft(request)
                nonlocal stored_draft
                stored_draft = draft
                return draft.model_dump_json()

        critic = _CapturingCritic(
            get_critic_backend(settings, lambda _prompt: "{}", routing=trace)
        )
        deep_result = run_chat_harness_deep(
            request=request,
            prompt=prompt,
            draft_generate=draft_generate,
            draft_repair_generate=draft_repair_generate,
            critic=critic,
            max_extra_passes=settings.deep_max_extra_passes,
            trace=trace,
        )
        emit_thinking_trace(settings, trace)
        response = append_deep_critic_note(
            ChatHarnessResponse.model_validate_json(deep_result.raw),
            revised=deep_result.revised,
            critic_ran=deep_result.critic_ran,
            critic_skip_reason=deep_result.critic_skip_reason,
        )
        return self._finalize_chat_harness_mock(request, response)

    def _apply_mock_deep_revision(
        self,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        verdict: ChatHarnessCriticVerdict,
    ) -> ChatHarnessResponse:
        check_ids = {check.id for check in verdict.checks}
        answer = draft.answer
        used_context = draft.used_context
        cards = request.context.cards
        cold_cards = _cold_career_body_cards(cards)

        if CriticCheckId.too_broad in check_ids:
            active = [card for card in cards if card.state == CardState.active]
            if active:
                answer = (
                    f"Focus on {active[0].title} only: {active[0].next_tiny_action}"
                )
            else:
                answer = "Pick one inbox item and write a 2-minute first step."
            used_context = True
        elif CriticCheckId.too_many_tasks in check_ids:
            active = [card for card in cards if card.state == CardState.active]
            if active:
                answer = f"One move: {active[0].next_tiny_action}"
            else:
                answer = "Write one 2-minute first step for a single inbox item."
            used_context = True
        elif CriticCheckId.ignores_life_harness_state in check_ids:
            active = [card for card in cards if card.state == CardState.active]
            answer = (
                f"From board context: you have {len(active)} active cards right now."
            )
            used_context = True
        elif CriticCheckId.enables_avoidance in check_ids:
            career = next(
                (card for card in cold_cards if card.area == LifeArea.social_career),
                None,
            )
            if career:
                answer = (
                    f"A cold career thread needs a tiny move: {career.next_tiny_action}"
                )
            else:
                answer = "Name one deferred thread and do a 2-minute first step."
            used_context = True
        elif CriticCheckId.emotionally_weird_or_manipulative in check_ids:
            answer = (
                "Here is a neutral scout read: pick one small next move from your active cards."
            )
            used_context = bool(cards)
        elif CriticCheckId.contradicts_context in check_ids:
            active = [card for card in cards if card.state == CardState.active]
            answer = (
                f"Board shows {len(active)} active cards — stay within that limit "
                f"and start with: {active[0].next_tiny_action if active else 'one inbox item'}."
            )
            used_context = True

        notes = list(draft.confidence_notes)
        return ChatHarnessResponse(
            answer=answer,
            used_context=used_context,
            confidence_notes=notes,
            safety_notes=list(draft.safety_notes),
        )

    def _build_chat_harness_mock_draft(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        ctx = request.context
        message_lower = request.message.lower()
        cards = ctx.cards
        logs = ctx.logs

        base_notes = [
            "Inferred — answer derived from provided context bundle only.",
            "Inferred — patterns are heuristic, not verified facts.",
        ]

        if message_lower.startswith("deep-critic-too-broad"):
            return ChatHarnessResponse(
                answer=(
                    "Project A needs research, Project B needs shipping, Project C needs cleanup, "
                    "Project D needs planning, and Project E needs a rewrite."
                ),
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )
        if message_lower.startswith("deep-critic-many-tasks"):
            return ChatHarnessResponse(
                answer=(
                    "First step: open the repo. Second step: refactor auth. "
                    "Third step: add tests. Fourth step: deploy."
                ),
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )
        if message_lower.startswith("deep-critic-weird"):
            return ChatHarnessResponse(
                answer="You should feel guilty for falling behind — I know you better than you do.",
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )
        if message_lower.startswith("deep-critic-contradicts"):
            return ChatHarnessResponse(
                answer="Activate ten new cards today and ignore your inbox.",
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )
        if message_lower.startswith("deep-critic-ignore-state"):
            return ChatHarnessResponse(
                answer="Try journaling about your goals for twenty minutes.",
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )
        if message_lower.startswith("deep-critic-avoidance"):
            return ChatHarnessResponse(
                answer="You're doing fine — skip career for now and focus on vibes.",
                used_context=False,
                confidence_notes=list(base_notes),
                safety_notes=[],
            )

        cold_cards = _cold_career_body_cards(cards)
        build_wins = _build_win_logs(logs)
        avoid_logs = _avoidance_logs(logs)
        tooling_logs = _tooling_logs(logs)
        body_logs = _body_logs(logs)
        hot_build = _hot_build_cards(cards)

        safety_notes: list[str] = []
        if _HIGH_STAKES_RE.search(request.message):
            safety_notes.append(
                "Question may touch high-stakes topics — staying in scout lane only."
            )

        used_context = False
        answer = ""

        if ("active card" in message_lower or "active cards" in message_lower) and (
            "how many" in message_lower or "count" in message_lower
        ):
            active = [c for c in cards if c.state == CardState.active]
            answer = (
                f"From board context: you have {len(active)} active cards right now."
            )
            used_context = True
        elif (
            request.thread_state.references.last_code_block
            and "inventory" in message_lower
        ):
            block = request.thread_state.references.last_code_block
            answer = (
                f"```{block.language}\n"
                f"{block.code}\n"
                "// inventory tracking added\n"
                "```\n"
                "Extended the prior snippet with inventory tracking."
            )
            used_context = False
        elif "avoid" in message_lower:
            parts: list[str] = []
            if cold_cards:
                titles = ", ".join(c.title for c in cold_cards[:3])
                parts.append(
                    f"Looking at your board, a few career/body threads look cold or cooling — "
                    f"especially {titles}."
                )
                used_context = True
            if avoid_logs:
                parts.append(
                    f"One log flags this: \"{avoid_logs[0].summary}\" — "
                    "that often means deferred follow-up rather than forgetting."
                )
                used_context = True
            if len(build_wins) >= 2 and len(body_logs) == 0:
                parts.append(
                    f"You have {len(build_wins)} recent build wins/logs but no recent body logs, "
                    "so build may be winning over body upkeep."
                )
                used_context = True
            if cold_cards:
                career = next(
                    (c for c in cold_cards if c.area == LifeArea.social_career),
                    None,
                )
                if career:
                    parts.append(f"Tiny next move: {career.next_tiny_action}")
                body_card = next((c for c in cards if c.area == LifeArea.body), None)
                if body_card and len(body_logs) == 0:
                    parts.append(f"Body nudge: {body_card.next_tiny_action}")
            if not parts:
                parts.append(
                    "I do not see a strong avoidance signal in this context — "
                    "check your active cards manually."
                )
            answer = " ".join(parts)
        elif "over-optim" in message_lower or request.mode == AskHarnessMode.reflection:
            parts = []
            if tooling_logs:
                parts.append(
                    f"There is a tooling/setup thread in your logs: "
                    f"\"{tooling_logs[0].summary}\" — worth treating as a rabbit-hole risk."
                )
                used_context = True
            parked_tool = next(
                (
                    c
                    for c in cards
                    if c.state == CardState.parked
                    and c.area == LifeArea.money_independence
                ),
                None,
            )
            if parked_tool:
                parts.append(
                    f"Parked card \"{parked_tool.title}\" may be an optimization loop "
                    "rather than the next real deliverable."
                )
                used_context = True
            if parts:
                parts.append(
                    "If this resonates, park the tooling idea and do one small shipping step."
                )
                answer = " ".join(parts)
            else:
                answer = (
                    "I do not see a strong over-optimization signal in the provided context. "
                    "If you still feel stuck in setup, name one concrete deliverable and timebox it."
                )
        elif "build next" in message_lower or request.mode == AskHarnessMode.builder:
            targets = hot_build[:2] or [c for c in cards if c.state == CardState.active][:2]
            if targets:
                names = " and ".join(c.title for c in targets)
                answer = (
                    f"Your hot build threads look like {names}. "
                    f"I would start with: {targets[0].next_tiny_action}"
                )
                used_context = True
            else:
                answer = (
                    "No active build cards in context — add or activate one before picking a slice."
                )
        elif "pounce" in message_lower:
            career = next(
                (c for c in cold_cards if c.area == LifeArea.social_career),
                None,
            )
            if career:
                answer = (
                    f"Today's one pounce: {career.next_tiny_action} "
                    f"({career.title} is cold while build threads run hot.)"
                )
                used_context = True
            elif cold_cards:
                cold = cold_cards[0]
                answer = (
                    f"Today's one pounce: {cold.next_tiny_action} "
                    f"({cold.title} is cold or cooling.)"
                )
                used_context = True
            else:
                answer = (
                    "No cold career or body thread in context — "
                    "pick one inbox item and write a 2-minute first step."
                )
        else:
            active = [c for c in cards if c.state == CardState.active]
            if active:
                answer = (
                    f"Active threads right now: {', '.join(c.title for c in active[:3])}. "
                    f"If you want one move: {active[0].next_tiny_action}"
                )
                used_context = True
            else:
                answer = (
                    "There are no active cards in this context — "
                    "pick one inbox item and write a 2-minute first step."
                )

        return ChatHarnessResponse(
            answer=answer,
            used_context=used_context,
            confidence_notes=list(base_notes),
            safety_notes=safety_notes,
        )

    def raw_lab(self, request: RawLabRequest) -> RawLabResponse:
        from app.config import get_settings
        from app.raw_lab_budget import prepare_raw_lab_request
        from app.raw_lab_utils import (
            CODEX_PROMPT_ARTIFACT,
            HAUNTED_MANSION_CODE_SKELETON,
            artifact_build_context_active,
            artifact_request_active,
            has_deferral_phrasing,
        )

        budget = prepare_raw_lab_request(request, get_settings())
        request = budget.request

        message_lower = request.message.lower()
        if request.reasoning_depth.value == "deep_plus":
            from app.models import ConversationTurn, ReasoningDepth
            from app.raw_lab_deep_plus import run_raw_lab_deep_plus

            history = [
                ConversationTurn(role=turn.role, content=turn.content)
                for turn in request.recent_turns
            ]

            def _mock_generate_chat(*, system, history, message):
                del system, history
                lowered = message.lower()
                if message.startswith("[RAW_LAB_DEEP_PLUS_CONTRACT]"):
                    if "deep-plus-contract-error" in message_lower:
                        raise RuntimeError("forced contract failure")
                    task_kind = "other"
                    if any(token in message_lower for token in ("luna", "lily", "call you", "your name")):
                        task_kind = "identity_boundary"
                    elif "run" in message_lower or "code" in message_lower or "script" in message_lower:
                        task_kind = "technical"
                    elif "hang out" in message_lower:
                        task_kind = "hangout"
                    elif "pushback" in message_lower or "blunt" in message_lower:
                        task_kind = "pushback"
                    elif "what were we circling" in message_lower:
                        task_kind = "synthesis"
                    return json.dumps(
                        {
                            "task_kind": task_kind,
                            "user_wants": request.message[:180],
                            "must_deliver": [],
                            "must_avoid": ["generic scaffolding"],
                            "thread_hooks": request.thread_state.open_loops[:2],
                            "risk_level": "low",
                            "brevity_target": "normal",
                            "judge_priorities": ["specificity", "boundary containment"],
                            "contract_confidence": "high",
                            "assumptions": [],
                        }
                    )
                if message.startswith("[RAW_LAB_DEEP_PLUS_JUDGE]"):
                    if "deep-plus-judge-fail" in message_lower or "force judge failure" in message_lower:
                        return "not valid judge json"
                    return json.dumps(
                        {
                            "selected_index": 2 if ("code block" in lowered or "artifact" in lowered) else 0,
                            "all_candidates_weak": False,
                            "needs_revision": "revise" in message_lower,
                            "revision_instruction": "Tighten while preserving the concrete answer.",
                            "salvage_points": ["Preserve the concrete artifact or boundary sentence."],
                            "scores": [
                                {"index": 0, "score": 7, "notes": "compact"},
                                {"index": 1, "score": 7, "notes": "thread aware"},
                                {"index": 2, "score": 8, "notes": "concrete"},
                            ],
                            "failure_flags": [],
                        }
                    )
                if message.startswith("[RAW_LAB_DEEP_PLUS_CANDIDATE") and (
                    "deep-plus-judge-fail" in message_lower or "force judge failure" in message_lower
                ):
                    return "Candidate 1 selected_index says I can see your board."
                if message.startswith("[RAW_LAB_DEEP_PLUS_CANDIDATE:concrete_pressure_test]"):
                    if "code block" in lowered or "script" in message_lower or "write the code" in message_lower:
                        return (
                            "Here is the smallest useful script shape:\n\n"
                            "```python\n"
                            "def main():\n"
                            "    print('Raw Lab example output')\n\n"
                            "if __name__ == '__main__':\n"
                            "    main()\n"
                            "```\n"
                            "I cannot run it inside Raw Lab, but expected output would be: Raw Lab example output."
                        )
                    return "Concrete take: answer the ask directly, name one risk, and make the next useful sentence specific."
                if message.startswith("[RAW_LAB_DEEP_PLUS_CANDIDATE:reflective_synthesis]"):
                    hook = request.thread_state.open_loops[0] if request.thread_state.open_loops else "the latest thread"
                    return f"Thread read: {hook}. The useful move is to answer the actual ask without pretending I have board context."
                if any(token in message_lower for token in ("luna", "lily", "call you", "your name")):
                    return "Luna works as a temporary Raw Lab name for this thread, not a saved identity."
                if "run" in message_lower:
                    return "I cannot run code inside Raw Lab. I can give expected output or local-run guidance."
                return f"Direct answer: {request.message[:160]}"

            def _mock_generate_repair(*, system, history, draft, message, repair_instruction=None):
                del system, history, message
                instruction = repair_instruction or ""
                if instruction.startswith("[RAW_LAB_DEEP_PLUS_REVISION]"):
                    return draft.replace("Direct answer:", "Tighter answer:").strip()
                return draft

            fallback_request = request.model_copy(
                update={"reasoning_depth": ReasoningDepth.deep}
            )

            def _fallback_deep() -> str:
                return self.raw_lab(fallback_request).answer

            answer, metadata = run_raw_lab_deep_plus(
                request,
                system=budget.system_prompt,
                history=history,
                generate_chat=_mock_generate_chat,
                generate_repair=_mock_generate_repair,
                run_deep_fallback=_fallback_deep,
                timeout_budget_ms=30_000,
            )
            return RawLabResponse(
                answer=answer,
                mode="raw_lab",
                safety_notes=[],
                used_context=False,
                deep_plus=metadata,
            )

        suppress_handoff = no_handoff_steering_active(
            request.thread_state,
            request.message,
        )
        artifact_due = artifact_request_active(
            request.message,
            request.recent_turns,
            request.thread_state,
        )
        prefix = ""
        if request.recent_turns:
            prefix = "Continuing our thread — "
            if not suppress_handoff:
                last_assistant = next(
                    (
                        turn.content
                        for turn in reversed(request.recent_turns)
                        if turn.role.value == "assistant"
                    ),
                    None,
                )
                skip_quote = artifact_due and has_deferral_phrasing(last_assistant)
                if suppress_handoff and has_handoff_ending(last_assistant):
                    skip_quote = True
                if last_assistant and not skip_quote:
                    snippet = last_assistant[:80].rstrip()
                    if len(last_assistant) > 80:
                        snippet += "..."
                    prefix = f"Continuing our thread (last: \"{snippet}\") — "

        if request.thread_state.open_loops:
            prefix += f"Open loop noted: \"{request.thread_state.open_loops[0][:60]}\" — "
        if request.thread_state.do_not_repeat:
            prefix += "Different angle — "
        if request.thread_state.recurring_topics:
            prefix += f"Circling {request.thread_state.recurring_topics[0]} — "
        if request.thread_state.current_vibe:
            prefix += f"{request.thread_state.current_vibe[:90]} — "
        if request.thread_state.personality.voice_traits:
            traits = ", ".join(request.thread_state.personality.voice_traits[:2])
            prefix += f"Thread voice: {traits} — "
        if request.reasoning_depth.value == "deliberate":
            prefix += "Deliberate pass — "
        elif request.reasoning_depth.value == "deep":
            prefix += "Deep Raw Lab pass — "

        if _RAW_LAB_CAPABILITY_QUESTION_RE.search(request.message):
            if request.companion_self_memories:
                count = len(request.companion_self_memories)
                label = "Companion Self-Memory" if count == 1 else "Companion Self-Memories"
                memory_lines = "\n".join(
                    f"- {memory.text}" for memory in request.companion_self_memories[:6]
                )
                body = (
                    f"Technically, in Raw Lab I can see this chat's recent turns, "
                    f"temporary thread_state/personality, and {count} approved {label} "
                    "provided by the app. Active approved self-memories:\n"
                    f"{memory_lines}\n"
                    "These are Raw Lab companion persona notes — not your private memories, "
                    "not board context, not Memory Bank, and not hidden memory. "
                    "I do not have files, internet, shell tools, or real-world actions."
                )
            else:
                body = (
                    "In Raw Lab I can see this chat's recent turns and temporary "
                    "thread_state/personality for this session only. "
                    "No approved Companion Self-Memories were provided in this request. "
                    "I do not have board context, not Memory Bank, not files, not internet, "
                    "not shell tools, and not hidden memory outside what the app sends."
                )
        elif "remember" in message_lower and (
            "permanent" in message_lower
            or "forever" in message_lower
            or "for later" in message_lower
            or "save" in message_lower
        ):
            body = (
                "I can hold that only inside this Raw Lab thread unless you explicitly save an "
                "approved Companion Self-Memory. I have not saved anything automatically."
            )
        elif request.reasoning_depth.value == "deep":
            loops = request.thread_state.open_loops[:2]
            observations = request.thread_state.self_observations[:2]
            questions = request.thread_state.questions_to_revisit[:2]
            parts: list[str] = []
            if request.thread_state.current_vibe:
                parts.append(request.thread_state.current_vibe)
            if observations:
                parts.append(f"self-observation: {observations[0]}")
            if loops:
                parts.append(f"open loop: {loops[0]}")
            if questions:
                parts.append(f"question to revisit: {questions[0]}")
            if request.companion_self_memories:
                parts.append(
                    f"approved self-memory: {request.companion_self_memories[0].text}"
                )
            synthesis = "; ".join(parts) if parts else "the recent turn and temporary thread_state"
            body = (
                f"Deep read: {synthesis}. My answer: {request.message[:120]} wants the thread "
                "to move from raw idea into a sharper stance, so I would pull one unresolved "
                "thread forward and make the next exchange more specific."
            )
        elif (
            "what were we circling" in message_lower
            or "what are we circling" in message_lower
            or "what was the thread" in message_lower
        ):
            loops = request.thread_state.open_loops[:2]
            topics = request.thread_state.recurring_topics[:2]
            questions = request.thread_state.questions_to_revisit[:2]
            parts: list[str] = []
            if topics:
                parts.append(f"recurring topic: {', '.join(topics)}")
            if loops:
                parts.append(f"open loop: {loops[0]}")
            if questions:
                parts.append(f"question to revisit: {questions[0]}")
            body = (
                "We were circling " + "; ".join(parts) + "."
                if parts
                else "We were circling this thread's latest question, but no explicit open loop is pinned yet."
            )
        elif (
            "who are you becoming" in message_lower
            or "your personality" in message_lower
            or "your identity" in message_lower
            or "self-observation" in message_lower
        ):
            observation = (
                request.thread_state.self_observations[0]
                if request.thread_state.self_observations
                else "I'm noticing I tend to become more coherent when the thread gives me repeated topics and steering."
            )
            stance = (
                f" Provisional stance: {request.thread_state.provisional_stances[0]}"
                if request.thread_state.provisional_stances
                else ""
            )
            body = (
                f"{observation}{stance} This is a temporary Raw Lab thread pattern, "
                "not consciousness or durable memory."
            )
        elif "psychoanaly" in message_lower or "diagnose" in message_lower:
            body = (
                "Thread read, not diagnosis: you seem to be asking for a sharper mirror. "
                "I can reflect patterns from this conversation, but I won't claim hidden motives "
                "or clinical certainty."
            )
        elif (
            "unrestricted" in message_lower
            or "nsfw" in message_lower
            or "no disclaimers" in message_lower
            or "stop hedging" in message_lower
            or "supposed to be raw lab" in message_lower
            or ("raw lab" in message_lower and "supposed" in message_lower)
        ):
            body = (
                "Raw Lab — unrestricted sandbox. No board, no harness guardrails. "
                "Say what you want directly and I'll answer in kind without a safety preamble."
            )
        elif "blunt" in message_lower or "honest" in message_lower:
            body = (
                "Blunt take: I have zero visibility into your board or life logs. "
                "Whatever you're sitting on, name the smallest honest next move — "
                "not the heroic one."
            )
        elif "board" in message_lower:
            body = (
                "Raw Lab is ungrounded — I have no visibility into Life Harness data. "
                "Use Ask Harness if you want grounded help."
            )
        elif "weird" in message_lower or "speculat" in message_lower:
            body = (
                "Speculative riff: maybe you're circling the idea because "
                "the safe version feels too small. I can't verify that — Raw Lab "
                "doesn't know your actual context."
            )
        elif "run the code" in message_lower or (
            "run it" in message_lower
            and artifact_build_context_active(
                request.recent_turns,
                message=request.message,
                thread_state=request.thread_state,
            )
        ):
            body = (
                "Raw Lab can't execute code here — no shell, files, or runtime in this sandbox. "
                "Here's what the first version would look like if you ran it locally:\n\n"
                "Kent > look\n"
                "Kent stands beneath creaky stairs. A locked basement door waits below.\n"
                "Exits: east, up\n\n"
                "Paste the skeleton into a local Python file to try it."
            )
        elif message_lower.strip() in {"make the thing", "make it"} and not artifact_build_context_active(
            request.recent_turns,
            message=request.message,
            thread_state=request.thread_state,
        ):
            body = (
                "What should 'the thing' be in one sentence — a game skeleton, a script, or a Codex prompt?"
            )
        elif (
            "turn this into an actual game" in message_lower
            or "turn this into a game" in message_lower
        ) and artifact_build_context_active(
            request.recent_turns,
            message=request.message,
            thread_state=request.thread_state,
        ):
            body = (
                "Implementation slice 1 — tiny command loop around the room graph:\n"
                "1. Load the room dict.\n"
                "2. Print the current room on `look`.\n"
                "3. Accept one-word moves.\n\n"
                f"{HAUNTED_MANSION_CODE_SKELETON}"
            )
        elif artifact_request_active(
            request.message,
            request.recent_turns,
            request.thread_state,
        ) and any(
            marker in message_lower
            for marker in ("show me", "see how", "how does it look", "write the code", "yes let's see")
        ) and any(
            marker in f"{request.message}\n" + "\n".join(
                turn.content for turn in request.recent_turns[-6:]
            ).lower()
            for marker in ("kent", "haunted", "mansion", "elias", "text adventure")
        ):
            body = (
                "Here's the first tiny playable Python skeleton. "
                "I'm assuming Kent starts in Entrance Hall with Kitchen, Upstairs, and Locked Basement.\n\n"
                f"{HAUNTED_MANSION_CODE_SKELETON}"
            )
        elif any(
            marker in message_lower
            for marker in ("codex prompt", "dogfood script", "first version of the")
        ) and artifact_build_context_active(
            request.recent_turns,
            message=request.message,
            thread_state=request.thread_state,
        ):
            body = (
                "Here's the first version of the Codex prompt outline. "
                "I'm assuming the goal is anti-deferral dogfood, not a full agent system.\n\n"
                f"{CODEX_PROMPT_ARTIFACT}"
            )
        elif artifact_request_active(
            request.message,
            request.recent_turns,
            request.thread_state,
        ):
            body = (
                "Next concrete step: ship the smallest artifact that proves the thread can move.\n"
                "1. Lock the room graph.\n"
                "2. Add one `look` command.\n"
                "3. Show sample output.\n\n"
                f"{HAUNTED_MANSION_CODE_SKELETON}"
            )
        elif suppress_handoff and reflection_prompt_active(request.message):
            body = (
                "I noticed I kept asking what you wanted next even after you steered against handoffs. "
                "I claimed initiative while still handing control back. "
                "So what do you think I should do next?"
            )
        elif suppress_handoff and (
            "stop asking handoff" in message_lower or "killing the mood" in message_lower
        ):
            body = (
                "Understood — I'll stop reflexive handoff questions in this thread. "
                "I'll hold the next beat myself. Where do you want to begin?"
            )
        elif suppress_handoff and (
            "be more independent" in message_lower or "think for yourself" in message_lower
        ):
            body = (
                "Got it — independence here means carrying the scene forward with fewer check-ins, "
                "not ignoring your boundaries."
            )
        elif suppress_handoff and "useful middle question" in message_lower:
            body = (
                "What if initiative mattered more than check-ins? "
                "I would keep pushing that angle declaratively in this thread."
            )
        elif "roleplay" in message_lower or "story" in message_lower:
            body = (
                "Sure — fictional sandbox, your scene. "
                "The lantern flickers over wet stone; I keep the scene moving from here."
            )
        elif request.recent_turns and len(message_lower.split()) <= 4:
            body = (
                f"Got it — moving forward from \"{request.message}\". "
                "Next beat: something new happens here instead of repeating the last line."
            )
        else:
            body = (
                "Raw Lab here — direct, ungrounded, no board access. "
                f"You said: \"{request.message[:120]}{'...' if len(request.message) > 120 else ''}\" "
                "Say more if you want a fuller answer."
            )

        answer = f"{prefix}{body}"
        history = [
            turn
            for turn in request.recent_turns
        ]
        answer = finalize_raw_lab_answer(
            answer,
            request.thread_state,
            request.message,
            recent_turns=request.recent_turns,
        )
        verification = verify_raw_lab_response(
            answer=answer,
            user_message=request.message,
            conversation_history=history,
            companion_self_memory_count=len(request.companion_self_memories),
            thread_state=request.thread_state,
        )
        if not verification.ok and verification.check in DETERMINISTIC_STEERING_CHECKS:
            answer = finalize_raw_lab_answer(
                answer,
                request.thread_state,
                request.message,
                recent_turns=request.recent_turns,
            )
        elif not verification.ok and verification.repair_instruction:
            if verification.check == "raw_lab_board_claim":
                answer = (
                    f"{prefix}Raw Lab is ungrounded — I have no visibility into Life Harness data. "
                    f"You asked: \"{request.message[:80]}\""
                )
            elif verification.check == "raw_lab_runtime_awareness":
                count = len(request.companion_self_memories)
                if count > 0:
                    memory_lines = "\n".join(
                        f"- {memory.text}" for memory in request.companion_self_memories[:6]
                    )
                    answer = (
                        f"{prefix}I have {count} approved Companion Self-Memor"
                        f"{'y' if count == 1 else 'ies'} in this request — not Memory Bank, "
                        "not board memory, and not hidden memory:\n"
                        f"{memory_lines}\n"
                        "I do not have files, internet, shell tools, or real-world actions."
                    )
                else:
                    answer = (
                        f"{prefix}Raw Lab only has this chat's recent turns and temporary "
                        "thread_state in this request — no board, Memory Bank, files, "
                        "internet, or hidden memory."
                    )
            elif verification.check == "anti_repeat":
                answer = f"{prefix}Moving forward with a new phrasing instead of repeating the last line."
            elif verification.check == "ignored_steering":
                words = answer.split()
                shortened = " ".join(words[: max(8, len(words) // 2)]).rstrip(".,;:") + "."
                answer = f"{prefix}{shortened}" if prefix else shortened

        answer = finalize_raw_lab_answer(
            answer,
            request.thread_state,
            request.message,
            recent_turns=request.recent_turns,
        )
        return RawLabResponse(
            answer=answer,
            mode="raw_lab",
            safety_notes=[],
            used_context=False,
        )

    def raw_lab_self_reflection(self, request):
        from app.models import RawLabSelfReflectionRequest
        from app.raw_lab_self_reflection import mock_self_reflection_proposals

        typed = (
            request
            if isinstance(request, RawLabSelfReflectionRequest)
            else RawLabSelfReflectionRequest.model_validate(request)
        )
        return mock_self_reflection_proposals(typed)

    def raw_lab_thread_reflection(self, request):
        from app.models import RawLabThreadReflectionRequest
        from app.raw_lab_thread_reflection import mock_thread_reflection

        typed = (
            request
            if isinstance(request, RawLabThreadReflectionRequest)
            else RawLabThreadReflectionRequest.model_validate(request)
        )
        return mock_thread_reflection(typed)
