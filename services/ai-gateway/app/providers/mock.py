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
from app.thread_verifier import VerificationResult, verify_chat_harness_response, verify_raw_lab_response

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

        settings = get_settings()
        prompt = build_chat_harness_prompt(request=request)
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
            return stored_draft.model_dump_json()

        critic = _CapturingCritic(
            get_critic_backend(settings, lambda _prompt: "{}")
        )
        raw, revised = run_chat_harness_deep(
            request=request,
            prompt=prompt,
            draft_generate=draft_generate,
            critic=critic,
            max_extra_passes=settings.deep_max_extra_passes,
        )
        response = append_deep_critic_note(
            ChatHarnessResponse.model_validate_json(raw),
            revised=revised,
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

        budget = prepare_raw_lab_request(request, get_settings())
        request = budget.request

        message_lower = request.message.lower()
        prefix = ""
        if request.recent_turns:
            prefix = "Continuing our thread — "
            last_assistant = next(
                (
                    turn.content
                    for turn in reversed(request.recent_turns)
                    if turn.role.value == "assistant"
                ),
                None,
            )
            if last_assistant:
                snippet = last_assistant[:80].rstrip()
                if len(last_assistant) > 80:
                    snippet += "..."
                prefix = f"Continuing our thread (last: \"{snippet}\") — "

        if request.thread_state.open_loops:
            prefix += f"Open loop noted: \"{request.thread_state.open_loops[0][:60]}\" — "
        if request.thread_state.do_not_repeat:
            prefix += "Avoiding prior phrasing — "
        if request.thread_state.personality.voice_traits:
            traits = ", ".join(request.thread_state.personality.voice_traits[:2])
            prefix += f"Thread voice: {traits} — "

        if (
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
        elif "roleplay" in message_lower or "story" in message_lower:
            body = (
                "Sure — fictional sandbox, your scene. "
                "What characters, tone, and opening beat do you want?"
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
        verification = verify_raw_lab_response(
            answer=answer,
            user_message=request.message,
            conversation_history=history,
        )
        if not verification.ok and verification.repair_instruction:
            if verification.check == "raw_lab_board_claim":
                answer = (
                    f"{prefix}Raw Lab is ungrounded — I have no visibility into Life Harness data. "
                    f"You asked: \"{request.message[:80]}\""
                )
            elif verification.check == "anti_repeat":
                answer = f"{prefix}Moving forward with a new phrasing instead of repeating the last line."
            elif verification.check == "ignored_steering":
                words = answer.split()
                shortened = " ".join(words[: max(8, len(words) // 2)]).rstrip(".,;:") + "."
                answer = f"{prefix}{shortened}" if prefix else shortened

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
