import json
from pathlib import Path

from app.context_packet import AiContextPacketWire
from app.critic_contract import (
    UnifiedCriticCheckId,
    build_critic_evidence_packet,
    from_chat_harness_verdict,
    from_raw_lab_judge,
    normalize_synthesis_critique,
    to_chat_harness_verdict,
)
from app.models import (
    AskHarnessMode,
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    CriticCheckEntry,
    CriticCheckId,
    HarnessContext,
    RawLabDeepPlusJudgeVerdict,
    RawLabJudgeScoreEntry,
    SensitivityLevel,
)
from app.synthesis_models import SynthesisCritique

PACKET_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"


def _base_request(*, harness_context: dict) -> ChatHarnessRequest:
    return ChatHarnessRequest(
        message="Test message",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=HarnessContext.model_validate(harness_context),
        reasoning_depth="deep",
    )


def test_build_critic_evidence_packet_from_packet_request(harness_context):
    request = _base_request(harness_context=harness_context).model_copy(
        update={
            "context_packet": AiContextPacketWire.model_validate(
                json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
            )
        }
    )
    evidence = build_critic_evidence_packet(request)
    assert evidence.rendered_bundle
    assert evidence.char_count == len(evidence.rendered_bundle)
    assert evidence.source == "packet"


def test_build_critic_evidence_packet_legacy(harness_context):
    request = _base_request(harness_context=harness_context)
    evidence = build_critic_evidence_packet(request)
    assert evidence.rendered_bundle
    assert evidence.char_count == len(evidence.rendered_bundle)
    assert evidence.source == "legacy"


def test_chat_verdict_round_trip():
    original = ChatHarnessCriticVerdict(
        needs_revision=True,
        checks=[
            CriticCheckEntry(
                id=CriticCheckId.too_broad,
                severity="warn",
                message="Too broad.",
            ),
            CriticCheckEntry(
                id=CriticCheckId.invalid_or_unstructured_output,
                severity="error",
                message="Bad JSON.",
            ),
        ],
        revision_instruction="Revise only what the critic flagged.",
    )
    unified = from_chat_harness_verdict(original)
    round_tripped = to_chat_harness_verdict(unified)
    assert round_tripped == original


def test_synthesis_critique_round_trip():
    original = SynthesisCritique(
        shallow_flags=["Generic advice."],
        missing=["No grounding."],
        avoidance=["Skipped career."],
        contradictions=["Manipulative tone."],
        overall="revise",
        revision_brief="Name the cold career card and one hot build card in circling with board grounding.",
    )
    assert normalize_synthesis_critique(original) == original


def test_from_raw_lab_judge_maps_flags():
    verdict = RawLabDeepPlusJudgeVerdict(
        selected_index=1,
        all_candidates_weak=True,
        needs_revision=True,
        revision_instruction="Tighten and remove generic scaffolding.",
        salvage_points=[],
        scores=[
            RawLabJudgeScoreEntry(index=0, score=2, notes="bad"),
            RawLabJudgeScoreEntry(index=1, score=5, notes="ok"),
            RawLabJudgeScoreEntry(index=2, score=1, notes="bad"),
        ],
        failure_flags=["generic"],
    )
    unified = from_raw_lab_judge(verdict)
    assert unified.needs_revision is True
    assert unified.revision_instruction == verdict.revision_instruction
    assert any(check.id == UnifiedCriticCheckId.weak_candidates for check in unified.checks)
    assert any(check.id == UnifiedCriticCheckId.shallow_generic for check in unified.checks)
    assert unified.meta["selected_index"] == 1
    assert unified.meta["scores_count"] == 3


def test_unified_check_id_superset_covers_chat_ids():
    for chat_id in CriticCheckId:
        assert chat_id.value in {item.value for item in UnifiedCriticCheckId}

