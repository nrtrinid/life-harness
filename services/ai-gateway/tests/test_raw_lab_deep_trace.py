import json
import logging
from dataclasses import replace

from app.config import get_settings
from app.models import RawLabCompanionSelfMemory, RawLabRequest, RawLabThreadState
from app.raw_lab_trace import (
    RawLabDeepTrace,
    emit_raw_lab_deep_trace,
    new_raw_lab_deep_trace,
    record_raw_lab_pass_latency,
)


def test_raw_lab_deep_trace_records_metadata_only(caplog):
    request = RawLabRequest(
        message="Think harder about this private thread.",
        reasoning_depth="deep",
        thread_state=RawLabThreadState(
            open_loops=["How should Deep stay contained?"],
            self_observations=["I'm noticing I synthesize open loops."],
        ),
        companion_self_memories=[
            RawLabCompanionSelfMemory(
                id="memory-1",
                kind="self_observation",
                subject="companion_self",
                text="I tend to be direct.",
            )
        ],
    )
    trace = new_raw_lab_deep_trace(request)
    trace.passes.append("draft")
    trace.passes.append("deep_review")
    trace.review_applied = True
    record_raw_lab_pass_latency(trace, "draft", 0.0)

    with caplog.at_level(logging.INFO):
        emit_raw_lab_deep_trace(
            replace(get_settings(), debug_thinking_trace=True),
            trace,
        )

    records = [
        record.message
        for record in caplog.records
        if "raw_lab_deep_trace" in record.message
    ]
    assert len(records) == 1
    payload = json.loads(records[0].split(" ", 1)[1])
    assert payload["reasoning_depth"] == "deep"
    assert payload["used_thread_mind"] is True
    assert payload["used_companion_self_memories"] is True
    assert payload["review_applied"] is True
    assert payload["passes"] == ["draft", "deep_review"]
    serialized = json.dumps(payload).lower()
    assert "think harder" not in serialized
    assert "private thread" not in serialized
    assert "i tend to be direct" not in serialized
    assert "answer" not in payload
    assert "draft_text" not in payload
    assert "chain_of_thought" not in payload


def test_raw_lab_deep_trace_respects_debug_flag(caplog):
    trace = RawLabDeepTrace(passes=["draft"])
    with caplog.at_level(logging.INFO):
        emit_raw_lab_deep_trace(
            replace(get_settings(), debug_thinking_trace=False),
            trace,
        )
    assert not any("raw_lab_deep_trace" in record.message for record in caplog.records)
