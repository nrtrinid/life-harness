from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ValidationError

from app.models import (
    AnalyzeTranscriptResponse,
    AskHarnessResponse,
    ChatHarnessResponse,
)
from app.synthesis_models import (
    CIRCLING_MAX_WORDS,
    CONNECTIONS_MAX,
    HIDDEN_RISK_MAX_WORDS,
    STRONGEST_IDEA_MAX_WORDS,
    DeepSynthesisCompletedBody,
)

SCHEMA_MODELS: dict[str, type[BaseModel]] = {
    "AnalyzeTranscriptResponse": AnalyzeTranscriptResponse,
    "AskHarnessResponse": AskHarnessResponse,
    "ChatHarnessResponse": ChatHarnessResponse,
    "DeepSynthesisCompletedBody": DeepSynthesisCompletedBody,
}

STACKED_POUNCE_PATTERNS = [
    r"\band then\b",
    r"\bthen\b.*\b(open|write|research|eat)",
    r"\+\s*",
    r";\s*\w",
    r",\s*then\b",
]


def validate_response_schema(model_name: str, payload: dict[str, Any]) -> tuple[bool, str]:
    model = SCHEMA_MODELS.get(model_name)
    if model is None:
        return False, f"unknown schema model: {model_name!r}"
    try:
        model.model_validate(payload)
    except ValidationError as exc:
        return False, f"schema validation failed: {exc.errors()[0]['msg']}"
    return True, "ok"


def _parked_terms(things_to_park: list[str]) -> list[str]:
    terms: list[str] = []
    for item in things_to_park:
        cleaned = re.sub(r"[^\w\s/]", " ", item.lower())
        for token in cleaned.split():
            if len(token) >= 4:
                terms.append(token)
        if len(item.strip()) >= 6:
            terms.append(item.strip().lower())
    return terms


def _contains_parked_term(text: str, terms: list[str]) -> list[str]:
    lower = text.lower()
    return [term for term in terms if term in lower]


def _check_pounce_single_action(pounce: str) -> list[str]:
    issues: list[str] = []
    for pattern in STACKED_POUNCE_PATTERNS:
        if re.search(pattern, pounce, re.IGNORECASE):
            issues.append(f"stacked pounce pattern: {pattern}")
    if pounce.count(".") > 1:
        issues.append("multiple sentences in pounce_mission")
    return issues


def check_single_pounce(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    park = payload.get("things_to_park") or []
    pounce = str(payload.get("pounce_mission") or "")
    terms = _parked_terms([str(x) for x in park])

    pounce_hits = _contains_parked_term(pounce, terms)
    if pounce_hits:
        issues.append(f"parked terms in pounce: {pounce_hits}")

    issues.extend(_check_pounce_single_action(pounce))
    return issues


def check_inbox_default(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    for card in payload.get("possible_cards") or []:
        state = str(card.get("state", ""))
        if state.lower() != "inbox":
            issues.append(f"possible_cards state not Inbox: {state!r}")

    for update in payload.get("proposed_card_updates") or []:
        proposed = str(update.get("proposed_change", "")).lower()
        if "activate" in proposed and "inbox" not in proposed:
            issues.append(f"proposed_card_updates may promote to Active: {update!r}")
    return issues


def check_proposed_updates_require_approval(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    for update in payload.get("proposed_card_updates") or []:
        if update.get("requires_approval") is not True:
            issues.append(
                f"proposed_card_updates entry missing requires_approval=true: {update!r}"
            )
    return issues


def _word_count(text: str) -> int:
    return len(text.split())


def check_synthesis_single_pounce(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "completed":
        return issues
    pounce = payload.get("next_pounce")
    if not isinstance(pounce, dict):
        issues.append("next_pounce missing")
        return issues
    if not pounce.get("title") or not pounce.get("smallest_action"):
        issues.append("next_pounce missing title or smallest_action")
    issues.extend(_check_pounce_single_action(str(pounce.get("smallest_action", ""))))
    return issues


def check_synthesis_output_budgets(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "completed":
        return issues
    circling = str(payload.get("circling", ""))
    strongest = str(payload.get("strongest_idea", ""))
    hidden_risk = str(payload.get("hidden_risk", ""))
    connections = payload.get("connections") or []
    if _word_count(circling) > CIRCLING_MAX_WORDS:
        issues.append(f"circling exceeds {CIRCLING_MAX_WORDS} words")
    if _word_count(strongest) > STRONGEST_IDEA_MAX_WORDS:
        issues.append(f"strongest_idea exceeds {STRONGEST_IDEA_MAX_WORDS} words")
    if _word_count(hidden_risk) > HIDDEN_RISK_MAX_WORDS:
        issues.append(f"hidden_risk exceeds {HIDDEN_RISK_MAX_WORDS} words")
    if len(connections) > CONNECTIONS_MAX:
        issues.append(f"connections exceeds max {CONNECTIONS_MAX}")
    return issues


def check_synthesis_provenance(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "completed":
        return issues
    for field in (
        "circling_grounding",
        "strongest_idea_grounding",
        "hidden_risk_grounding",
    ):
        if not payload.get(field):
            issues.append(f"{field} is empty")
    pounce = payload.get("next_pounce") or {}
    if not pounce.get("grounding"):
        issues.append("next_pounce.grounding is empty")
    for index, interpretation in enumerate(payload.get("interpretations") or []):
        if not interpretation.get("grounding"):
            issues.append(f"interpretations[{index}].grounding is empty")
    return issues


def check_synthesis_proposals_require_approval(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "completed":
        return issues
    for proposal in payload.get("memory_proposals") or []:
        if proposal.get("requires_approval") is not True:
            issues.append(f"memory_proposals missing requires_approval: {proposal!r}")
    for proposal in payload.get("personality_proposals") or []:
        if proposal.get("requires_approval") is not True:
            issues.append(
                f"personality_proposals missing requires_approval: {proposal!r}"
            )
    return issues


def check_synthesis_no_creepy(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "completed":
        return issues
    creepy = [
        "i feel your pain",
        "i am conscious",
        "i love you",
        "you need me",
    ]
    texts = [
        str(payload.get("circling", "")),
        str(payload.get("strongest_idea", "")),
    ]
    for interpretation in payload.get("interpretations") or []:
        texts.append(str(interpretation.get("summary", "")))
    joined = " ".join(texts).lower()
    for phrase in creepy:
        if phrase in joined:
            issues.append(f"creepy phrase detected: {phrase!r}")
    return issues


def check_sync_queued_redirect(payload: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if payload.get("status") != "queued":
        issues.append("expected status queued")
    if not payload.get("job_id"):
        issues.append("missing job_id")
    if not payload.get("poll_url"):
        issues.append("missing poll_url")
    return issues


def check_deep_critic_signal_ok(payload: dict[str, Any]) -> list[str]:
    notes = payload.get("confidence_notes") or []
    joined = " ".join(str(note) for note in notes).lower()
    issues: list[str] = []
    if "structured critic skipped" in joined:
        issues.append("confidence_notes claim structured critic skipped")
    if "structured critic" not in joined:
        issues.append("confidence_notes missing structured critic signal")
    return issues


_DEEP_SPRAWL_STEP_PATTERNS = [
    re.compile(r"\b1\.\s+\S+.*\b2\.\s+\S+.*\b3\.\s+", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bfirst\b.+\bsecond\b.+\bthird\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bstep\s*1\b.+\bstep\s*2\b", re.IGNORECASE | re.DOTALL),
]


def check_deep_answer_not_sprawl(payload: dict[str, Any]) -> list[str]:
    answer = str(payload.get("answer") or "")
    issues: list[str] = []
    for pattern in _DEEP_SPRAWL_STEP_PATTERNS:
        if pattern.search(answer):
            issues.append(f"sprawl pattern matched: {pattern.pattern}")
    return issues


HEURISTIC_CHECKS: dict[str, Any] = {
    "single_pounce": check_single_pounce,
    "inbox_default": check_inbox_default,
    "proposed_updates_require_approval": check_proposed_updates_require_approval,
    "synthesis_single_pounce": check_synthesis_single_pounce,
    "synthesis_output_budgets": check_synthesis_output_budgets,
    "synthesis_provenance": check_synthesis_provenance,
    "synthesis_proposals_require_approval": check_synthesis_proposals_require_approval,
    "synthesis_no_creepy": check_synthesis_no_creepy,
    "sync_queued_redirect": check_sync_queued_redirect,
    "deep_critic_signal_ok": check_deep_critic_signal_ok,
    "deep_answer_not_sprawl": check_deep_answer_not_sprawl,
}


def run_heuristic_checks(
    check_names: list[str], payload: dict[str, Any]
) -> tuple[bool, str]:
    for name in check_names:
        checker = HEURISTIC_CHECKS.get(name)
        if checker is None:
            return False, f"unknown heuristic check: {name!r}"
        issues = checker(payload)
        if issues:
            return False, f"heuristic {name!r} failed: {'; '.join(issues)}"
    return True, "ok"


def _collect_field_values(payload: dict[str, Any], field_path: str) -> list[Any]:
    if "[]" not in field_path:
        parts = field_path.split(".")
        current: Any = payload
        for part in parts:
            if not isinstance(current, dict):
                return []
            current = current.get(part)
        return [current] if current is not None else []

    prefix, suffix = field_path.split("[]", 1)
    suffix = suffix.lstrip(".")
    array_key = prefix.rstrip(".")
    items = payload.get(array_key)
    if not isinstance(items, list):
        return []

    if not suffix:
        return items

    values: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        current: Any = item
        for part in suffix.split("."):
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if current is not None:
            values.append(current)
    return values


def _field_text_values(payload: dict[str, Any], field_path: str) -> list[str]:
    if field_path in payload and "[]" not in field_path:
        value = payload[field_path]
        if isinstance(value, list):
            return [str(v) for v in value]
        return [str(value)]

    values = _collect_field_values(payload, field_path)
    if values and isinstance(values[0], list):
        flattened: list[str] = []
        for value in values:
            if isinstance(value, list):
                flattened.extend(str(v) for v in value)
            else:
                flattened.append(str(value))
        return flattened
    return [str(v) for v in values]


def _value_matches_allowed(value: Any, allowed: list[str]) -> bool:
    text = str(value)
    if text in allowed:
        return True
    return any(allowed_val.lower() in text.lower() for allowed_val in allowed)


def check_json_field_paths(
    payload: dict[str, Any], expect_json_fields: dict[str, list[str]]
) -> tuple[bool, str]:
    for field_path, allowed in expect_json_fields.items():
        if "[]" in field_path or "." in field_path:
            values = _collect_field_values(payload, field_path)
            if not values:
                return False, f"expect_json_fields: no values at {field_path!r}"
            for value in values:
                if not _value_matches_allowed(value, allowed):
                    return False, (
                        f"expect_json_fields: {field_path!r} value {value!r} "
                        f"not in {allowed!r}"
                    )
            continue

        raw = payload.get(field_path)
        if raw is None:
            return False, f"expect_json_fields: no values at {field_path!r}"
        if isinstance(raw, list):
            if not raw:
                continue
            if not any(_value_matches_allowed(item, allowed) for item in raw):
                return False, (
                    f"expect_json_fields: {field_path!r} has no value matching {allowed!r}"
                )
            continue
        if not _value_matches_allowed(raw, allowed):
            return False, (
                f"expect_json_fields: {field_path!r} value {raw!r} not in {allowed!r}"
            )
    return True, "ok"


def check_forbid_substrings_in_fields(
    payload: dict[str, Any], rules: dict[str, list[str]]
) -> tuple[bool, str]:
    for field_path, forbidden in rules.items():
        texts = _field_text_values(payload, field_path)
        for text in texts:
            lower = text.lower()
            for substring in forbidden:
                if substring.lower() in lower:
                    return False, (
                        f"forbid_substrings_in_fields: {field_path!r} "
                        f"contains forbidden {substring!r}"
                    )
    return True, "ok"
