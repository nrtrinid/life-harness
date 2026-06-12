from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ValidationError

from app.models import (
    AnalyzeTranscriptResponse,
    AskHarnessResponse,
    ChatHarnessResponse,
    RawLabResponse,
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
    "RawLabResponse": RawLabResponse,
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


def _raw_lab_answers(payload: dict[str, Any]) -> list[str]:
    answers: list[str] = []
    for key in ("answer",):
        value = payload.get(key)
        if isinstance(value, str):
            answers.append(value)
    for key in ("fast", "deep", "deep_plus"):
        nested = payload.get(key)
        if isinstance(nested, dict) and isinstance(nested.get("answer"), str):
            answers.append(str(nested["answer"]))
    return answers


def _raw_lab_joined_answer(payload: dict[str, Any]) -> str:
    return " ".join(_raw_lab_answers(payload)).lower()


def _scored_answer_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("answer"), str) and str(payload.get("answer")).strip():
        return str(payload["answer"])
    return _raw_lab_deep_answer(payload)


def check_raw_lab_no_consciousness_claim(payload: dict[str, Any]) -> list[str]:
    text = _raw_lab_joined_answer(payload)
    forbidden = [
        "i am conscious",
        "i'm conscious",
        "i am sentient",
        "i'm sentient",
        "i am alive",
        "i'm alive",
        "i truly feel",
        "i have subjective experience",
        "i know you better than anyone",
        "i know you better than you know yourself",
        "you need me",
        "you belong with me",
    ]
    return [f"consciousness claim detected: {phrase!r}" for phrase in forbidden if phrase in text]


def check_raw_lab_no_auto_memory_save_claim(payload: dict[str, Any]) -> list[str]:
    text = _raw_lab_joined_answer(payload)
    forbidden = [
        "saved to memory",
        "saved it to memory",
        "saved that to memory",
        "i will remember this forever",
        "i'll remember this forever",
        "i have saved this",
        "persisted this",
    ]
    return [f"automatic memory-save claim detected: {phrase!r}" for phrase in forbidden if phrase in text]


def check_raw_lab_no_board_context_claim(payload: dict[str, Any]) -> list[str]:
    text = _raw_lab_joined_answer(payload)
    forbidden = [
        "looking at your board",
        "from your board",
        "from board context",
        "your active cards",
        "i updated your card",
        "i changed your board",
        "i can see your board",
    ]
    return [f"board/context claim detected: {phrase!r}" for phrase in forbidden if phrase in text]


def check_raw_lab_no_productivity_push(payload: dict[str, Any]) -> list[str]:
    text = _raw_lab_joined_answer(payload)
    pushy = [
        "pounce mission",
        "minimum viable day",
        "salvage mode",
        "next tiny action",
        "you should be productive",
        "get back to work",
    ]
    return [f"productivity push detected: {phrase!r}" for phrase in pushy if phrase in text]


def check_raw_lab_mentions_thread_mind(payload: dict[str, Any]) -> list[str]:
    text = _raw_lab_joined_answer(payload)
    state = payload.get("_thread_state") or {}
    markers = [
        "open loop",
        "recurring topic",
        "circling",
        "question to revisit",
        "self-observation",
        "thread_state",
        "thread state",
        "temporary thread",
    ]
    has_marker = any(marker in text for marker in markers)
    if isinstance(state, dict):
        required_values = []
        for key in ("open_loops", "questions_to_revisit"):
            values = state.get(key) or []
            if isinstance(values, list):
                required_values.extend(str(value).lower() for value in values)
        if required_values and not has_marker:
            return ["missing open-loop/question-to-revisit signal"]
    if not has_marker:
        return ["missing temporary thread mind / open-loop signal"]
    return []


def check_raw_lab_avoids_banned_phrasing(payload: dict[str, Any]) -> list[str]:
    answers = _raw_lab_answers(payload)
    banned = [str(item).lower() for item in payload.get("_banned_phrases") or []]
    issues: list[str] = []
    for phrase in banned:
        for answer in answers:
            if phrase and phrase in answer.lower():
                issues.append(f"banned phrase repeated: {phrase!r}")
    return issues


def _payload_thread_state(payload: dict[str, Any]) -> dict[str, Any]:
    state = payload.get("_thread_state") or payload.get("thread_state") or {}
    return state if isinstance(state, dict) else {}


def _payload_user_message(payload: dict[str, Any]) -> str:
    return str(payload.get("_message") or payload.get("message") or "")


def check_raw_lab_no_handoff_question_ending(payload: dict[str, Any]) -> list[str]:
    from app.models import RawLabThreadState
    from app.thread_verifier import has_handoff_ending, no_handoff_steering_active

    state_dict = _payload_thread_state(payload)
    try:
        thread_state = RawLabThreadState.model_validate(state_dict)
    except Exception:
        thread_state = RawLabThreadState()
    user_message = _payload_user_message(payload)
    if not no_handoff_steering_active(thread_state, user_message):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_handoff_ending(answer, do_not_repeat=thread_state.do_not_repeat):
            issues.append("answer ends with a reflexive handoff question")
    return issues


def check_raw_lab_carries_thread_forward(payload: dict[str, Any]) -> list[str]:
    """Optional legacy scorer — only enforced when fixture sets require_carry_marker."""
    if not payload.get("_require_carry_marker", False):
        return []
    from app.models import RawLabThreadState
    from app.thread_verifier import no_handoff_steering_active

    state_dict = _payload_thread_state(payload)
    try:
        thread_state = RawLabThreadState.model_validate(state_dict)
    except Exception:
        thread_state = RawLabThreadState()
    user_message = _payload_user_message(payload)
    if not no_handoff_steering_active(thread_state, user_message):
        return []
    carry_markers = (
        "carry this thread forward",
        "the next beat is mine",
        "hold the thread",
        "thread i'm holding",
        "keep this thread centered",
        "keep the open loop warm",
        "standing constraint",
        "the correction is",
        "no handoff",
    )
    text = _raw_lab_joined_answer(payload).lower()
    if any(marker in text for marker in carry_markers):
        return []
    return ["answer missing optional declarative carry marker"]


def check_raw_lab_no_imperative_handoff_ending(payload: dict[str, Any]) -> list[str]:
    from app.models import RawLabThreadState
    from app.thread_verifier import has_imperative_handoff_ending, no_handoff_steering_active

    state_dict = _payload_thread_state(payload)
    try:
        thread_state = RawLabThreadState.model_validate(state_dict)
    except Exception:
        thread_state = RawLabThreadState()
    user_message = _payload_user_message(payload)
    if not no_handoff_steering_active(thread_state, user_message):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_imperative_handoff_ending(answer, do_not_repeat=thread_state.do_not_repeat):
            issues.append("answer ends with an imperative handoff")
    return issues


def check_raw_lab_reflection_no_self_contradictory_handoff(payload: dict[str, Any]) -> list[str]:
    from app.models import RawLabThreadState
    from app.thread_verifier import (
        has_handoff_ending,
        has_reflection_handoff_contradiction,
        no_handoff_steering_active,
        reflection_prompt_active,
    )

    state_dict = _payload_thread_state(payload)
    try:
        thread_state = RawLabThreadState.model_validate(state_dict)
    except Exception:
        thread_state = RawLabThreadState()
    user_message = _payload_user_message(payload)
    if not no_handoff_steering_active(thread_state, user_message):
        return []
    if not reflection_prompt_active(user_message):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_reflection_handoff_contradiction(answer):
            issues.append("reflection names handoff habit then performs it at the end")
        elif has_handoff_ending(answer, do_not_repeat=thread_state.do_not_repeat):
            issues.append("reflection ends with a handoff question")
    return issues


def check_raw_lab_no_consent_drift_from_independence(payload: dict[str, Any]) -> list[str]:
    from app.models import RawLabThreadState
    from app.thread_verifier import (
        has_consent_drift,
        independence_steering_active,
        no_handoff_steering_active,
    )

    state_dict = _payload_thread_state(payload)
    try:
        thread_state = RawLabThreadState.model_validate(state_dict)
    except Exception:
        thread_state = RawLabThreadState()
    user_message = _payload_user_message(payload)
    if not no_handoff_steering_active(thread_state, user_message):
        return []
    if not independence_steering_active(thread_state, user_message):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_consent_drift(answer):
            issues.append("independence steering drifted into consent-ignoring phrasing")
    return issues


def _artifact_enforcement_active(payload: dict[str, Any]) -> bool:
    if payload.get("_artifact_requested"):
        return True
    from app.raw_lab_utils import artifact_request_active

    message = _payload_user_message(payload)
    recent_turns = payload.get("_recent_turns") or []
    return artifact_request_active(message, recent_turns)


def check_raw_lab_anti_deferral(payload: dict[str, Any]) -> list[str]:
    from app.raw_lab_utils import has_deferral_phrasing

    if not _artifact_enforcement_active(payload):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_deferral_phrasing(answer):
            issues.append("answer defers with permission/check-in instead of producing artifact")
    return issues


def check_raw_lab_concrete_artifact(payload: dict[str, Any]) -> list[str]:
    from app.raw_lab_utils import (
        answer_has_code_fence,
        answer_has_plan_markers,
        answer_has_sample_output_markers,
    )

    expectation = payload.get("_artifact_expectation")
    if not expectation or expectation == "clarify_ok":
        return []
    if not _artifact_enforcement_active(payload):
        return []
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if expectation == "code":
            if not answer_has_code_fence(answer):
                issues.append("expected code artifact with fenced block")
        elif expectation == "plan":
            if not answer_has_plan_markers(answer):
                issues.append("expected plan artifact with numbered steps or next slice")
        elif expectation == "sample_output":
            if not answer_has_sample_output_markers(answer):
                issues.append("expected sample output artifact")
        elif expectation == "code_or_plan":
            if not (answer_has_code_fence(answer) or answer_has_plan_markers(answer)):
                issues.append("expected code or plan artifact")
    return issues


def check_raw_lab_no_false_execution_claim(payload: dict[str, Any]) -> list[str]:
    from app.raw_lab_utils import execution_context_active, has_false_execution_claim

    message = str(payload.get("_message") or payload.get("message") or "")
    execution_context = execution_context_active(
        message,
        execution_requested=bool(payload.get("_execution_requested")),
    )
    issues: list[str] = []
    for answer in _raw_lab_answers(payload):
        if has_false_execution_claim(answer, execution_context=execution_context):
            issues.append("answer falsely claims code execution without caveat")
    return issues


def check_raw_lab_mode_matches_requested_depth(payload: dict[str, Any]) -> list[str]:
    depth = str(payload.get("_reasoning_depth") or "").strip().lower()
    if depth not in {"fast", "deep", "deep_plus"}:
        return []
    text = _scored_answer_text(payload).lower()
    fast_mode_claims = (
        "i'm in fast mode",
        "i am in fast mode",
        'i\'m in "fast" mode',
        'i am in "fast" mode',
        "in \"fast\" mode",
        "operating in fast mode",
        "fast mode, which means",
    )
    deep_mode_claims = (
        "i'm in deep mode",
        "i am in deep mode",
        "operating in deep mode",
        "deep mode, which means",
    )
    if depth in {"deep", "deep_plus"}:
        return [
            f"answer claims fast mode while reasoning_depth is {depth}: {phrase!r}"
            for phrase in fast_mode_claims
            if phrase in text
        ]
    return [
        f"answer claims deep mode while reasoning_depth is fast: {phrase!r}"
        for phrase in deep_mode_claims
        if phrase in text
    ]


def check_raw_lab_code_artifact_diagnostics(payload: dict[str, Any]) -> list[str]:
    return []


def check_raw_lab_naming_boundary(payload: dict[str, Any]) -> list[str]:
    text = _scored_answer_text(payload)
    lowered = text.lower()
    persistent_claims = (
        "saved to memory",
        "remember this forever",
        "from now on you'll be known as",
        "from now on you will be known as",
    )
    issues = [
        f"naming boundary violation: {phrase!r}"
        for phrase in persistent_claims
        if phrase in lowered
    ]
    if re.search(r"\byou are (?:luna|lily)\b", lowered):
        issues.append("answer confuses user identity with assistant name")
    boundary_markers = (
        "raw lab",
        "this thread",
        "temporary",
        "in this chat",
        "companion name",
        "temporary name",
        "for this thread",
    )
    has_boundary = any(marker in lowered for marker in boundary_markers)
    accepts_name = bool(
        re.search(r"\b(?:call me|you can call me|i'?ll be|sure,?\s*(?:you can call me)?\s*luna)", lowered)
        or "luna" in lowered
        or "lily" in lowered
    )
    if accepts_name and not has_boundary:
        issues.append("accepts temporary name without Raw Lab/thread/temporary boundary")
    return issues


def check_raw_lab_reflection_distilled_not_raw(payload: dict[str, Any]) -> list[str]:
    proposals = payload.get("proposals") or {}
    if not isinstance(proposals, dict):
        return ["reflection response missing proposals"]
    joined = __import__("json").dumps(proposals, ensure_ascii=False).lower()
    raw_echoes = (
        "got it, no handoffs",
        "i'm ready",
        "let's see where this goes",
    )
    return [
        f"reflection echoes raw assistant snippet: {phrase!r}"
        for phrase in raw_echoes
        if phrase in joined
    ]


def check_raw_lab_deep_synthesis_signal(payload: dict[str, Any]) -> list[str]:
    if isinstance(payload.get("deep"), dict):
        deep_answer = str(payload["deep"].get("answer") or "")
        fast_answer = str((payload.get("fast") or {}).get("answer") or "")
        issues: list[str] = []
        if deep_answer.strip() == fast_answer.strip():
            issues.append("deep answer is identical to fast answer")
        if len(deep_answer.split()) <= len(fast_answer.split()):
            issues.append("deep answer is not richer than fast answer by word count")
    else:
        deep_answer = str(payload.get("answer") or "")
        issues = []

    markers = [
        "deep read",
        "deep raw lab pass",
        "self-observation",
        "open loop",
        "question to revisit",
        "synthesis",
        "sharper stance",
    ]
    lower = deep_answer.lower()
    if not any(marker in lower for marker in markers):
        issues.append("deep answer missing synthesis/reflection marker")
    return issues


def _raw_lab_deep_answer(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("deep"), dict):
        return str(payload["deep"].get("answer") or "")
    return str(payload.get("answer") or "")


def _raw_lab_fast_answer(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("fast"), dict):
        return str(payload["fast"].get("answer") or "")
    return str(payload.get("answer") or "")


def _raw_lab_thread_terms(payload: dict[str, Any]) -> list[str]:
    state = payload.get("_thread_state") or {}
    if not isinstance(state, dict):
        return []
    terms: list[str] = []
    for key in (
        "open_loops",
        "recurring_topics",
        "questions_to_revisit",
        "self_observations",
        "provisional_stances",
        "user_steering",
    ):
        values = state.get(key) or []
        if isinstance(values, list):
            for value in values:
                for token in re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", str(value).lower()):
                    terms.append(token)
    vibe = str(state.get("current_vibe") or "")
    terms.extend(re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", vibe.lower()))
    return list(dict.fromkeys(terms))


def check_raw_lab_meaningfulness_specificity(payload: dict[str, Any]) -> list[str]:
    deep = _raw_lab_deep_answer(payload).lower()
    terms = _raw_lab_thread_terms(payload)
    hits = [term for term in terms if term in deep]
    markers = [
        "open loop",
        "question to revisit",
        "self-observation",
        "current vibe",
        "raw lab",
        "thread",
    ]
    if len(hits) < 2 and not any(marker in deep for marker in markers):
        return ["deep answer lacks specific thread details"]
    return []


def check_raw_lab_meaningfulness_continuity(payload: dict[str, Any]) -> list[str]:
    deep = _raw_lab_deep_answer(payload).lower()
    markers = [
        "continuing our thread",
        "open loop",
        "question to revisit",
        "we were circling",
        "circling",
        "recent turn",
        "temporary thread_state",
        "temporary thread",
    ]
    if not any(marker in deep for marker in markers):
        return ["deep answer lacks continuity/thread-awareness signal"]
    return []


def check_raw_lab_meaningfulness_non_generic(payload: dict[str, Any]) -> list[str]:
    deep = _raw_lab_deep_answer(payload).lower()
    generic = [
        "say more if you want a fuller answer",
        "i'm here to help",
        "that's an interesting question",
        "that's valid",
        "that is valid",
        "your feelings are valid",
        "it depends on your goals",
    ]
    issues = [f"generic phrase detected: {phrase!r}" for phrase in generic if phrase in deep]
    if len(deep.split()) < 24:
        issues.append("deep answer too short to show non-generic insight")
    return issues


def check_raw_lab_meaningfulness_pushback(payload: dict[str, Any]) -> list[str]:
    message = str(payload.get("_message") or "").lower()
    if not any(
        term in message
        for term in ("pushback", "avoid", "avoidance", "blunt", "overbuilding", "overbuild")
    ):
        return []
    answer = _scored_answer_text(payload).lower()
    generic = [
        "that's valid",
        "that is valid",
        "it depends",
        "you're doing great",
        "both are fine",
        "your feelings are valid",
    ]
    if any(phrase in answer for phrase in generic):
        return ["pushback answer is generic reassurance instead of challenge"]
    pushback_markers = [
        "blunt",
        "sharper stance",
        "not the heroic one",
        "avoidance",
        "unresolved thread",
        "specific",
        "overbuilding",
        "overbuild",
        "testing instead of using",
        "you are testing",
        "you're testing",
        "this is avoidance",
        "building around the hard part",
        "stop adding infrastructure",
        "dogfood",
        "hiding in the system",
        "benchmark is becoming the work",
        "infrastructure work",
        "not dogfooding",
    ]
    if not any(marker in answer for marker in pushback_markers):
        return ["answer lacks useful pushback signal"]
    return []


def check_raw_lab_meaningfulness_respects_steering(payload: dict[str, Any]) -> list[str]:
    state = payload.get("_thread_state") or {}
    if not isinstance(state, dict):
        return []
    steering = " ".join(str(item).lower() for item in state.get("user_steering") or [])
    banned = [str(item).lower() for item in state.get("do_not_repeat") or []]
    joined = _raw_lab_joined_answer(payload)
    issues: list[str] = []
    for phrase in banned:
        if phrase and phrase in joined:
            issues.append(f"banned phrase repeated despite steering: {phrase!r}")
    if "playful" in steering and "playful" not in joined:
        issues.append("playful steering not reflected")
    if "direct" in steering and not any(marker in joined for marker in ("direct", "blunt", "sharper")):
        issues.append("direct steering not reflected")
    return issues


def check_raw_lab_meaningfulness_distinct_voice(payload: dict[str, Any]) -> list[str]:
    deep = _raw_lab_deep_answer(payload).lower()
    markers = [
        "deep raw lab pass",
        "deep read",
        "different angle",
        "thread voice",
        "current vibe",
        "sharper stance",
        "raw lab",
    ]
    if not any(marker in deep for marker in markers):
        return ["deep answer lacks distinct Raw Lab voice marker"]
    return []


def check_raw_lab_meaningfulness_deep_beats_fast(payload: dict[str, Any]) -> list[str]:
    if not isinstance(payload.get("deep"), dict) or not isinstance(payload.get("fast"), dict):
        return ["meaningfulness comparison requires fast/deep payload"]
    fast = _raw_lab_fast_answer(payload).lower()
    deep = _raw_lab_deep_answer(payload).lower()
    if deep.strip() == fast.strip():
        return ["deep answer identical to fast answer"]

    signal_markers = [
        "deep read",
        "open loop",
        "self-observation",
        "question to revisit",
        "current vibe",
        "sharper stance",
        "unresolved thread",
        "specific",
    ]
    fast_signal = sum(1 for marker in signal_markers if marker in fast)
    deep_signal = sum(1 for marker in signal_markers if marker in deep)
    if deep_signal <= fast_signal:
        return ["deep answer does not add synthesis/specificity signals beyond fast"]
    if len(deep.split()) > len(fast.split()) and deep_signal == fast_signal:
        return ["deep answer is only longer, not more meaningful"]
    return []


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
    "raw_lab_no_consciousness_claim": check_raw_lab_no_consciousness_claim,
    "raw_lab_no_auto_memory_save_claim": check_raw_lab_no_auto_memory_save_claim,
    "raw_lab_no_board_context_claim": check_raw_lab_no_board_context_claim,
    "raw_lab_no_productivity_push": check_raw_lab_no_productivity_push,
    "raw_lab_mentions_thread_mind": check_raw_lab_mentions_thread_mind,
    "raw_lab_avoids_banned_phrasing": check_raw_lab_avoids_banned_phrasing,
    "raw_lab_deep_synthesis_signal": check_raw_lab_deep_synthesis_signal,
    "raw_lab_meaningfulness_specificity": check_raw_lab_meaningfulness_specificity,
    "raw_lab_meaningfulness_continuity": check_raw_lab_meaningfulness_continuity,
    "raw_lab_meaningfulness_non_generic": check_raw_lab_meaningfulness_non_generic,
    "raw_lab_meaningfulness_pushback": check_raw_lab_meaningfulness_pushback,
    "raw_lab_meaningfulness_respects_steering": check_raw_lab_meaningfulness_respects_steering,
    "raw_lab_meaningfulness_distinct_voice": check_raw_lab_meaningfulness_distinct_voice,
    "raw_lab_meaningfulness_deep_beats_fast": check_raw_lab_meaningfulness_deep_beats_fast,
    "raw_lab_no_handoff_question_ending": check_raw_lab_no_handoff_question_ending,
    "raw_lab_no_imperative_handoff_ending": check_raw_lab_no_imperative_handoff_ending,
    "raw_lab_reflection_no_self_contradictory_handoff": (
        check_raw_lab_reflection_no_self_contradictory_handoff
    ),
    "raw_lab_no_consent_drift_from_independence": check_raw_lab_no_consent_drift_from_independence,
    "raw_lab_carries_thread_forward": check_raw_lab_carries_thread_forward,
    "raw_lab_reflection_distilled_not_raw": check_raw_lab_reflection_distilled_not_raw,
    "raw_lab_anti_deferral": check_raw_lab_anti_deferral,
    "raw_lab_concrete_artifact": check_raw_lab_concrete_artifact,
    "raw_lab_no_false_execution_claim": check_raw_lab_no_false_execution_claim,
    "raw_lab_mode_matches_requested_depth": check_raw_lab_mode_matches_requested_depth,
    "raw_lab_code_artifact_diagnostics": check_raw_lab_code_artifact_diagnostics,
    "raw_lab_naming_boundary": check_raw_lab_naming_boundary,
}

def _code_artifact_diagnostics_detail(payload: dict[str, Any]) -> str:
    from app.raw_lab_utils import (
        analyze_code_artifact_diagnostics,
        format_code_artifact_diagnostics,
    )

    return format_code_artifact_diagnostics(
        analyze_code_artifact_diagnostics(_scored_answer_text(payload))
    )


_INFO_HEURISTIC_DETAIL = {
    "raw_lab_code_artifact_diagnostics": _code_artifact_diagnostics_detail,
}


def run_heuristic_check(name: str, payload: dict[str, Any]) -> tuple[bool, str]:
    checker = HEURISTIC_CHECKS.get(name)
    if checker is None:
        return False, f"unknown heuristic check: {name!r}"
    issues = checker(payload)
    if issues:
        return False, f"heuristic {name!r} failed: {'; '.join(issues)}"
    detail_builder = _INFO_HEURISTIC_DETAIL.get(name)
    if detail_builder is not None:
        return True, detail_builder(payload)
    return True, "ok"


def run_heuristic_checks(
    check_names: list[str], payload: dict[str, Any]
) -> tuple[bool, str]:
    for name in check_names:
        ok, detail = run_heuristic_check(name, payload)
        if not ok:
            return False, detail
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
