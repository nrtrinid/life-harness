from __future__ import annotations

import logging
from collections.abc import Callable

from app.deep_synthesis import _synthesis_id, build_degraded_fallback_body
from app.prompt_loader import build_deep_synthesis_fast_only_prompt
from app.providers.base import ProviderNotReadyError, ProviderParseError, parse_strict_json
from app.synthesis_finalize import finalize_synthesis_draft
from app.synthesis_models import (
    DeepSynthesisCompletedBody,
    DeepSynthesisModelDraft,
    DeepSynthesisRequest,
    SynthesisPipelineProfile,
)
from app.synthesis_verifier import verify_synthesis_completed

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], str]

_DEEP_SYNTHESIS_REPAIR_PROMPT = """\
The previous answer was not valid JSON for the Deep Synthesis schema.
Return ONLY a corrected JSON object. No markdown fences, no commentary, no thinking tags.

Required top-level fields (all must be present):
- circling, strongest_idea, hidden_risk, connections (max 5 strings)
- circling_grounding, strongest_idea_grounding, hidden_risk_grounding (each array with ≥1 ref)
- next_pounce (object with title, smallest_action, grounding)
- interpretations (array — one per requested lens, each with grounding)
- memory_proposals, personality_proposals (each item requires_approval: true)
- confidence_notes, safety_notes (arrays of strings — NOT single strings)

Grounding kind must be one of: active_card, proof_log, memory, thread_excerpt, project_doc, inferred_from_prompt

Broken output:
{broken}
"""


def _parse_draft(raw: str) -> DeepSynthesisModelDraft:
    return parse_strict_json(raw, DeepSynthesisModelDraft)


def _parse_with_repair(
    raw: str,
    *,
    generate: GenerateFn,
) -> DeepSynthesisModelDraft | None:
    try:
        return _parse_draft(raw)
    except ProviderParseError:
        logger.warning("deep_synthesis parse failed; attempting one JSON repair pass")
        repaired = generate(_DEEP_SYNTHESIS_REPAIR_PROMPT.format(broken=raw[:4000]))
        try:
            return _parse_draft(repaired)
        except ProviderParseError:
            logger.warning("deep_synthesis parse failed after repair")
            return None


def run_openvino_fast_only(
    request: DeepSynthesisRequest,
    *,
    generate: GenerateFn,
    max_input_chars: int,
) -> DeepSynthesisCompletedBody:
    synthesis_id = _synthesis_id(request)
    prompt, formatter_notes = build_deep_synthesis_fast_only_prompt(request=request)

    if len(prompt) > max_input_chars:
        logger.warning(
            "deep_synthesis prompt length %d exceeds max %d; using fallback",
            len(prompt),
            max_input_chars,
        )
        return build_degraded_fallback_body(
            request,
            reason="Input packet too large for fast synthesis.",
        )

    try:
        raw = generate(prompt)
    except ProviderNotReadyError as exc:
        logger.warning("deep_synthesis generation not ready: %s", exc.message)
        return build_degraded_fallback_body(
            request,
            reason=f"Inference unavailable: {exc.message}",
        )
    except Exception as exc:
        logger.warning("deep_synthesis generation failed: %s", exc)
        return build_degraded_fallback_body(
            request,
            reason="Model generation failed unexpectedly.",
        )

    draft = _parse_with_repair(raw, generate=generate)
    if draft is None:
        return build_degraded_fallback_body(
            request,
            reason="Model output could not be parsed as valid synthesis JSON after repair.",
        )

    completed = finalize_synthesis_draft(
        draft,
        synthesis_id=synthesis_id,
        pipeline_profile_used=SynthesisPipelineProfile.fast_only,
        sensitivity=request.sensitivity,
        extra_confidence_notes=formatter_notes or None,
    )

    issues = verify_synthesis_completed(completed)
    if issues:
        logger.warning("deep_synthesis verifier failed: %s", "; ".join(issues))
        return build_degraded_fallback_body(
            request,
            reason=f"Verifier rejected model output: {'; '.join(issues[:3])}",
        )

    return completed
