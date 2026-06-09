import re

from app.models import (
    AnalysisMode,
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    CardState,
    HealthStatus,
    LifeArea,
    PossibleCard,
    ProviderHealth,
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
