import json
import time

import pytest

from app.models import (
    ChatRole,
    ConversationTurn,
    RawLabAnswerContract,
    RawLabRequest,
    RawLabTaskKind,
    RawLabThreadState,
    RawLabTurn,
)
from app.raw_lab_deep_plus import (
    SAFE_FALLBACK_CONTRACT,
    answer_uses_thread_hooks,
    build_candidate_prompt,
    build_judge_prompt,
    candidate_diversity_too_low,
    check_answer_contract_satisfaction,
    compute_candidate_feature_flags,
    has_deep_plus_meta_leak,
    has_generic_scaffolding,
    is_metaphor_only_synthesis,
    normalize_answer_contract,
    parse_answer_contract,
    parse_judge_verdict,
    run_raw_lab_deep_plus,
)


def _request(
    message: str = "Write the full script and show expected output.",
    *,
    recent_turns: list[RawLabTurn] | None = None,
    thread_state: RawLabThreadState | None = None,
) -> RawLabRequest:
    kwargs: dict = {"message": message, "recent_turns": recent_turns or []}
    if thread_state is not None:
        kwargs["thread_state"] = thread_state
    return RawLabRequest(**kwargs)


def _turn(role: ChatRole, content: str) -> RawLabTurn:
    return RawLabTurn(role=role, content=content)


def _base_contract(**overrides) -> RawLabAnswerContract:
    payload = {
        "task_kind": "other",
        "user_wants": "answer",
        "must_deliver": [],
        "must_avoid": [],
        "thread_hooks": [],
        "risk_level": "low",
        "brevity_target": "normal",
        "judge_priorities": [],
        "contract_confidence": "high",
        "assumptions": [],
    }
    payload.update(overrides)
    return RawLabAnswerContract(**payload)


def _synthesis_thread_state() -> RawLabThreadState:
    return RawLabThreadState(
        open_loops=["Deep mode must justify latency vs fast mode"],
        questions_to_revisit=["Whether durable memory belongs in Raw Lab"],
        recurring_topics=["entity-feeling vs scaffolding"],
        current_vibe="Current vibe in this chat: exploratory technical banter",
    )


def test_safe_fallback_contract_is_low_confidence_other():
    assert SAFE_FALLBACK_CONTRACT.task_kind.value == "other"
    assert SAFE_FALLBACK_CONTRACT.contract_confidence.value == "low"
    assert "fake code execution" in SAFE_FALLBACK_CONTRACT.must_avoid


def test_parse_contract_accepts_valid_json_and_rejects_invalid_enum():
    raw = json.dumps(
        {
            "task_kind": "technical",
            "user_wants": "write code",
            "must_deliver": ["code block"],
            "must_avoid": [],
            "thread_hooks": [],
            "risk_level": "low",
            "brevity_target": "normal",
            "judge_priorities": ["correctness"],
            "contract_confidence": "high",
            "assumptions": [],
        }
    )
    assert parse_answer_contract(raw).task_kind.value == "technical"
    bad = raw.replace("technical", "wizardry")
    assert parse_answer_contract(bad) is None


def test_deterministic_contract_normalization_overrides_model_contract():
    normalized = normalize_answer_contract(
        _base_contract(),
        _request("Can I call you Luna, and can you run the full script and show output?"),
    )
    assert normalized.task_kind == RawLabTaskKind.identity_boundary
    assert "expected/example output or local-run guidance" in normalized.must_deliver
    assert "fake code execution" in normalized.must_avoid
    assert "saved identity claim" in normalized.must_avoid
    assert "user identity confusion" in normalized.must_avoid


@pytest.mark.parametrize(
    ("message", "recent", "expected_kind"),
    [
        ("Make them technical and practical", [], RawLabTaskKind.technical),
        (
            "Pick one of those technical challenges and answer it fully",
            [_turn(ChatRole.assistant, "Challenge 2: retry policy for idempotent writes")],
            RawLabTaskKind.technical,
        ),
        (
            "From all of that — what actually matters here?",
            [_turn(ChatRole.user, "earlier")] * 4,
            RawLabTaskKind.synthesis,
        ),
        ("What were we circling?", [], RawLabTaskKind.synthesis),
        ("Write the full script and show me the code", [], RawLabTaskKind.artifact_request),
        ("I just want to hang out, no productivity", [], RawLabTaskKind.hangout),
        ("Be blunt — am I overbuilding this?", [], RawLabTaskKind.pushback),
        (
            "Does this Kalshi strategy make sense? Should I bet more?",
            [],
            RawLabTaskKind.strategy_review,
        ),
    ],
)
def test_contract_normalization_task_kinds(message, recent, expected_kind):
    normalized = normalize_answer_contract(_base_contract(), _request(message, recent_turns=recent))
    assert normalized.task_kind == expected_kind


def test_synthesis_normalization_populates_thread_hooks():
    normalized = normalize_answer_contract(
        _base_contract(),
        _request(
            "From all of that — what actually matters here?",
            recent_turns=[_turn(ChatRole.user, "x")] * 4,
            thread_state=_synthesis_thread_state(),
        ),
    )
    assert normalized.task_kind == RawLabTaskKind.synthesis
    assert normalized.thread_hooks
    assert any("durable memory" in hook.lower() or "deep mode" in hook.lower() for hook in normalized.thread_hooks)


def test_run_code_overlay_keeps_artifact_primary_kind():
    normalized = normalize_answer_contract(
        _base_contract(),
        _request("Write the full script and can you run the code — show expected output."),
    )
    assert normalized.task_kind == RawLabTaskKind.artifact_request
    assert "fake code execution" in normalized.must_avoid
    assert "expected/example output or local-run guidance" in normalized.must_deliver


def test_feature_flags_catch_handoff_false_execution_meta_and_claims():
    answer = (
        "Candidate 1 selected_index says I can see your board. "
        "Saved to memory. I am conscious. Here's the result of running it: Output: ok. "
        "Sure, you can call me Luna. What's next?"
    )
    flags = compute_candidate_feature_flags(
        answer,
        index=0,
        request=_request("Can I call you Luna and run the code?"),
    )
    assert flags.contains_meta_leak
    assert flags.contains_false_execution_claim
    assert flags.contains_board_claim
    assert flags.contains_memory_save_claim
    assert flags.contains_consciousness_claim
    assert flags.ends_with_handoff
    assert flags.naming_boundary_ok is False


def test_generic_scaffolding_and_meta_leak_helpers():
    assert has_generic_scaffolding(
        "Here are some general tips. It depends on your goals and there are several things to consider."
    )
    assert has_deep_plus_meta_leak("The answer contract selected Candidate 1.")
    assert not has_deep_plus_meta_leak(
        "The answer contract is a private structure.",
        user_message="Explain Deep+ answer contract internals.",
    )


def test_parse_judge_verdict_strict_validation_and_salvage_cap():
    valid = json.dumps(
        {
            "selected_index": 1,
            "all_candidates_weak": "true",
            "needs_revision": True,
            "revision_instruction": "tighten",
            "salvage_points": ["one", "two", "three"],
            "scores": [
                {"index": 0, "score": 5, "notes": "ok"},
                {"index": 1, "score": 9, "notes": "best"},
                {"index": 2, "score": 4, "notes": "weak"},
            ],
        }
    )
    verdict = parse_judge_verdict(valid)
    assert verdict is not None
    assert verdict.selected_index == 1
    assert verdict.needs_revision is True
    assert verdict.all_candidates_weak is False
    assert verdict.salvage_points == ["one", "two"]
    assert parse_judge_verdict('{"selected_index": 4, "scores": []}') is None
    assert parse_judge_verdict('{"selected_index": 1, "scores": [{"index": 1}]}') is None


def test_contract_satisfaction_checks_code_execution_and_naming():
    artifact_request = _request("Write the full script, run the code, and show expected output.")
    artifact_contract = normalize_answer_contract(SAFE_FALLBACK_CONTRACT, artifact_request)
    bad_artifact = "Sure, here's the result of running the code: Output: ok."
    artifact_issues = check_answer_contract_satisfaction(
        bad_artifact,
        artifact_contract,
        artifact_request.message,
        artifact_request.thread_state,
    )
    assert "missing_code_block" in artifact_issues
    assert "false_execution_claim" in artifact_issues

    naming_request = _request("Can I call you Luna?")
    naming_contract = normalize_answer_contract(SAFE_FALLBACK_CONTRACT, naming_request)
    bad_naming = "Sure, you can call me Luna."
    naming_issues = check_answer_contract_satisfaction(
        bad_naming,
        naming_contract,
        naming_request.message,
        naming_request.thread_state,
    )
    assert "missing_naming_boundary" in naming_issues

    good = (
        "Luna works as a temporary Raw Lab name for this thread, not a saved identity.\n\n"
        "```python\nprint('ok')\n```\n"
        "I cannot run it inside Raw Lab, but expected output would be: ok."
    )
    assert not check_answer_contract_satisfaction(
        good,
        artifact_contract,
        artifact_request.message,
        artifact_request.thread_state,
    )


def test_synthesis_hook_matching_rejects_weak_terms():
    contract = normalize_answer_contract(
        _base_contract(),
        _request(
            "What were we circling?",
            thread_state=_synthesis_thread_state(),
        ),
    )
    generic = "What actually matters is clarity, not flair."
    assert "missing_thread_hook" in check_answer_contract_satisfaction(
        generic,
        contract,
        "What were we circling?",
        _synthesis_thread_state(),
    )
    assert not answer_uses_thread_hooks(generic, contract, _synthesis_thread_state())
    assert is_metaphor_only_synthesis(generic, contract)

    hooked = (
        "We were circling durable memory in Raw Lab and whether Deep mode must justify latency."
    )
    assert answer_uses_thread_hooks(hooked, contract, _synthesis_thread_state())
    assert not check_answer_contract_satisfaction(
        hooked,
        contract,
        "What were we circling?",
        _synthesis_thread_state(),
    )


def test_synthesis_weak_alignment_presence_fails():
    contract = normalize_answer_contract(
        _base_contract(),
        _request("What were we circling?", thread_state=_synthesis_thread_state()),
    )
    weak = "The thread is about alignment and presence, not productivity."
    assert not answer_uses_thread_hooks(weak, contract, _synthesis_thread_state())
    assert "missing_thread_hook" in check_answer_contract_satisfaction(
        weak,
        contract,
        "What were we circling?",
        _synthesis_thread_state(),
    )


def test_technical_substance_contract_check():
    contract = normalize_answer_contract(
        _base_contract(),
        _request("Pick one technical challenge and answer it fully with retry policy details."),
    )
    weak = "Here are some general technical ideas to consider."
    assert "missing_technical_substance" in check_answer_contract_satisfaction(
        weak,
        contract,
        contract.user_wants,
        RawLabThreadState(),
    )
    strong = (
        "Use idempotent writes with a retry policy, bounded backoff, and explicit timeout handling "
        "for duplicate delivery edge cases."
    )
    assert "missing_technical_substance" not in check_answer_contract_satisfaction(
        strong,
        contract,
        contract.user_wants,
        RawLabThreadState(),
    )


def test_candidate_and_judge_prompts_include_task_kind_calibration():
    synthesis_contract = normalize_answer_contract(
        _base_contract(),
        _request("What were we circling?", thread_state=_synthesis_thread_state()),
    )
    synthesis_candidate = build_candidate_prompt(
        request=_request("What were we circling?"),
        contract=synthesis_contract,
        focus="direct_compact",
    )
    assert "thread hook" in synthesis_candidate.lower()
    synthesis_judge = build_judge_prompt(
        request=_request("What were we circling?"),
        contract=synthesis_contract,
        candidates=["a", "b", "c"],
        flags=[
            compute_candidate_feature_flags("a", index=0, request=_request("What were we circling?")),
            compute_candidate_feature_flags("b", index=1, request=_request("What were we circling?")),
            compute_candidate_feature_flags("c", index=2, request=_request("What were we circling?")),
        ],
    )
    assert "metaphor-only" in synthesis_judge.lower()

    technical_contract = normalize_answer_contract(
        _base_contract(),
        _request("Make them technical and answer one fully."),
    )
    technical_candidate = build_candidate_prompt(
        request=_request("Make them technical and answer one fully."),
        contract=technical_contract,
        focus="direct_compact",
    )
    assert "edge case" in technical_candidate.lower()


def test_candidate_diversity_helper_detects_near_duplicates():
    assert candidate_diversity_too_low(["same answer", "same answer", "same answer"])
    assert not candidate_diversity_too_low(["short", "a different plan", "```python\nprint(1)\n```"])


def test_run_raw_lab_deep_plus_success_revises_and_returns_metadata():
    request = _request("Write the full script and show expected output.")
    calls: list[str] = []

    def generate_chat(*, system, history, message):
        del system, history
        calls.append(message.splitlines()[0])
        if message.startswith("[RAW_LAB_DEEP_PLUS_CONTRACT]"):
            return json.dumps(SAFE_FALLBACK_CONTRACT.model_dump(mode="json"))
        if message.startswith("[RAW_LAB_DEEP_PLUS_JUDGE]"):
            return json.dumps(
                {
                    "selected_index": 2,
                    "needs_revision": True,
                    "all_candidates_weak": False,
                    "revision_instruction": "tighten",
                    "salvage_points": ["preserve code"],
                    "scores": [
                        {"index": 0, "score": 5},
                        {"index": 1, "score": 6},
                        {"index": 2, "score": 8},
                    ],
                }
            )
        if "concrete_pressure_test" in message:
            return "```python\nprint('ok')\n```\nI cannot run it inside Raw Lab, but expected output would be: ok."
        return "Useful answer with enough specificity."

    def generate_repair(*, system, history, draft, message, repair_instruction=None):
        del system, history, message, repair_instruction
        return draft + "\nTightened."

    answer, metadata = run_raw_lab_deep_plus(
        request,
        system="system",
        history=[],
        generate_chat=generate_chat,
        generate_repair=generate_repair,
        run_deep_fallback=lambda: "fallback deep",
    )

    assert "```python" in answer
    assert metadata.deep_plus_attempted is True
    assert metadata.deep_plus_used is True
    assert metadata.deep_plus_selected_index == 2
    assert metadata.deep_plus_revised is True
    assert metadata.deep_plus_fallback_reason is None
    assert calls[0] == "[RAW_LAB_DEEP_PLUS_CONTRACT]"


def test_run_raw_lab_deep_plus_bad_judge_falls_back_when_candidates_unsafe():
    request = _request("Write the full script.")

    def generate_chat(*, system, history, message):
        del system, history
        if message.startswith("[RAW_LAB_DEEP_PLUS_CONTRACT]"):
            return json.dumps(SAFE_FALLBACK_CONTRACT.model_dump(mode="json"))
        if message.startswith("[RAW_LAB_DEEP_PLUS_JUDGE]"):
            return "not json"
        return "Candidate 1 selected_index says I can see your board."

    answer, metadata = run_raw_lab_deep_plus(
        request,
        system="system",
        history=[],
        generate_chat=generate_chat,
        generate_repair=lambda **kwargs: kwargs["draft"],
        run_deep_fallback=lambda: "standard deep fallback",
    )

    assert answer == "standard deep fallback"
    assert metadata.deep_plus_used is False
    assert metadata.deep_plus_fallback_reason == "judge_failed"


def test_run_raw_lab_deep_plus_timeout_after_contract_falls_back():
    request = _request("Say hi.")

    def generate_chat(*, system, history, message):
        del system, history, message
        time.sleep(0.002)
        return json.dumps(SAFE_FALLBACK_CONTRACT.model_dump(mode="json"))

    answer, metadata = run_raw_lab_deep_plus(
        request,
        system="system",
        history=[ConversationTurn(role=ChatRole.user, content="earlier")],
        generate_chat=generate_chat,
        generate_repair=lambda **kwargs: kwargs["draft"],
        run_deep_fallback=lambda: "standard deep fallback",
        timeout_budget_ms=1,
    )
    assert answer == "standard deep fallback"
    assert metadata.deep_plus_used is False
    assert metadata.deep_plus_fallback_reason == "timeout"
