"""Canonical Memory Bank record adapter for the mock retrieval spine.

The eligibility policy mirrors `getMemoryRetrievalEligibility()` in
`src/core/harnessMemoryBank.ts`. Diagnostics contain identifiers and reason
codes only; memory titles, summaries, evidence, and tags are never logged or
copied into exclusions.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from enum import Enum
from typing import Literal

from app.models import SensitivityLevel, StrictModel
from app.retrieval.memory_types import MemoryDocument, MemoryDocumentSource

_MEMORY_KINDS = frozenset(
    (
        "pattern",
        "preference",
        "trap",
        "identity",
        "project_fact",
        "decision",
        "rule",
    )
)
_CLASSIFIED_SENSITIVITIES = frozenset(("S0", "S1", "S2", "S3"))
_UNCLASSIFIED = "unclassified"


class MemoryBankEligibilityReason(str, Enum):
    eligible = "eligible"
    inactive = "inactive"
    sensitivity_s3 = "sensitivity_s3"
    sensitivity_unclassified = "sensitivity_unclassified"
    sensitivity_invalid = "sensitivity_invalid"
    malformed = "malformed"


class MemoryBankEligibility(StrictModel):
    eligible: bool
    reason: MemoryBankEligibilityReason
    sensitivity: SensitivityLevel | Literal["unclassified"] | None = None


class MemoryBankDiagnosticCode(str, Enum):
    missing_id = "missing_id"
    duplicate_id = "duplicate_id"
    missing_title = "missing_title"
    invalid_title = "invalid_title"
    empty_summary = "empty_summary"
    invalid_tags = "invalid_tags"
    inactive = "inactive"
    sensitivity_s3 = "sensitivity_s3"
    sensitivity_unclassified = "sensitivity_unclassified"
    sensitivity_invalid = "sensitivity_invalid"
    malformed_record = "malformed_record"


class MemoryBankExclusionDiagnostic(StrictModel):
    code: MemoryBankDiagnosticCode
    source_record_id: str | None = None
    eligibility_reason: MemoryBankEligibilityReason | None = None


class MemoryBankAdaptationResult(StrictModel):
    documents: list[MemoryDocument] = []
    diagnostics: list[MemoryBankExclusionDiagnostic] = []
    input_count: int
    document_count: int
    excluded_count: int


def _record_mapping(value: object) -> Mapping[str, object] | None:
    return value if isinstance(value, Mapping) else None


def _has_canonical_shape(record: Mapping[str, object]) -> bool:
    record_id = record.get("id")
    kind = record.get("kind")
    title = record.get("title")
    summary = record.get("summary")
    tags = record.get("tags")
    return (
        isinstance(record_id, str)
        and bool(record_id.strip())
        and isinstance(kind, str)
        and kind in _MEMORY_KINDS
        and isinstance(title, str)
        and isinstance(summary, str)
        and isinstance(tags, list)
        and all(isinstance(tag, str) for tag in tags)
        and (
            "evidence" not in record
            or isinstance(record["evidence"], str)
        )
        and (
            "sourceChatSummaryId" not in record
            or isinstance(record["sourceChatSummaryId"], str)
        )
        and isinstance(record.get("isActive"), bool)
        and isinstance(record.get("createdAt"), str)
        and isinstance(record.get("updatedAt"), str)
    )


def evaluate_memory_bank_retrieval_eligibility(
    value: object,
) -> MemoryBankEligibility:
    record = _record_mapping(value)
    if record is None or not _has_canonical_shape(record):
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.malformed,
            sensitivity=None,
        )

    if "sensitivity" not in record:
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.sensitivity_unclassified,
            sensitivity=_UNCLASSIFIED,
        )
    sensitivity = record["sensitivity"]
    if sensitivity == _UNCLASSIFIED:
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.sensitivity_unclassified,
            sensitivity=_UNCLASSIFIED,
        )
    if (
        not isinstance(sensitivity, str)
        or sensitivity not in _CLASSIFIED_SENSITIVITIES
    ):
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.sensitivity_invalid,
            sensitivity=None,
        )
    if sensitivity == "S3":
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.sensitivity_s3,
            sensitivity=SensitivityLevel.S3,
        )
    if record.get("isActive") is not True:
        return MemoryBankEligibility(
            eligible=False,
            reason=MemoryBankEligibilityReason.inactive,
            sensitivity=SensitivityLevel(sensitivity),
        )
    return MemoryBankEligibility(
        eligible=True,
        reason=MemoryBankEligibilityReason.eligible,
        sensitivity=SensitivityLevel(sensitivity),
    )


def _malformed_diagnostic_code(
    record: Mapping[str, object] | None,
) -> MemoryBankDiagnosticCode:
    if record is None:
        return MemoryBankDiagnosticCode.malformed_record
    record_id = record.get("id")
    if not isinstance(record_id, str) or not record_id.strip():
        return MemoryBankDiagnosticCode.missing_id
    if "title" not in record:
        return MemoryBankDiagnosticCode.missing_title
    if not isinstance(record.get("title"), str):
        return MemoryBankDiagnosticCode.invalid_title
    tags = record.get("tags")
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        return MemoryBankDiagnosticCode.invalid_tags
    return MemoryBankDiagnosticCode.malformed_record


def _diagnostic_for_ineligible(
    record: Mapping[str, object] | None,
    eligibility: MemoryBankEligibility,
) -> MemoryBankExclusionDiagnostic:
    record_id = record.get("id") if record is not None else None
    source_record_id = record_id if isinstance(record_id, str) and record_id else None
    code_by_reason = {
        MemoryBankEligibilityReason.inactive: MemoryBankDiagnosticCode.inactive,
        MemoryBankEligibilityReason.sensitivity_s3: (
            MemoryBankDiagnosticCode.sensitivity_s3
        ),
        MemoryBankEligibilityReason.sensitivity_unclassified: (
            MemoryBankDiagnosticCode.sensitivity_unclassified
        ),
        MemoryBankEligibilityReason.sensitivity_invalid: (
            MemoryBankDiagnosticCode.sensitivity_invalid
        ),
    }
    code = code_by_reason.get(
        eligibility.reason,
        _malformed_diagnostic_code(record),
    )
    return MemoryBankExclusionDiagnostic(
        code=code,
        source_record_id=source_record_id,
        eligibility_reason=eligibility.reason,
    )


def _diagnostic_sort_key(
    diagnostic: MemoryBankExclusionDiagnostic,
) -> tuple[str, str, str]:
    return (
        diagnostic.source_record_id or "",
        diagnostic.code.value,
        diagnostic.eligibility_reason.value
        if diagnostic.eligibility_reason is not None
        else "",
    )


def adapt_memory_bank_records(
    records: Sequence[object],
) -> MemoryBankAdaptationResult:
    mappings = [_record_mapping(record) for record in records]
    source_ids = [
        record_id
        for record in mappings
        if record is not None
        for record_id in (record.get("id"),)
        if isinstance(record_id, str) and bool(record_id.strip())
    ]
    duplicate_ids = {
        record_id
        for record_id, count in Counter(source_ids).items()
        if count > 1
    }

    documents: list[MemoryDocument] = []
    diagnostics: list[MemoryBankExclusionDiagnostic] = []
    for value, record in zip(records, mappings, strict=True):
        record_id = record.get("id") if record is not None else None
        if isinstance(record_id, str) and record_id in duplicate_ids:
            diagnostics.append(
                MemoryBankExclusionDiagnostic(
                    code=MemoryBankDiagnosticCode.duplicate_id,
                    source_record_id=record_id,
                    eligibility_reason=None,
                )
            )
            continue

        eligibility = evaluate_memory_bank_retrieval_eligibility(value)
        if not eligibility.eligible:
            diagnostics.append(_diagnostic_for_ineligible(record, eligibility))
            continue

        assert record is not None
        summary = record["summary"]
        assert isinstance(summary, str)
        if not summary.strip():
            diagnostics.append(
                MemoryBankExclusionDiagnostic(
                    code=MemoryBankDiagnosticCode.empty_summary,
                    source_record_id=record_id if isinstance(record_id, str) else None,
                    eligibility_reason=MemoryBankEligibilityReason.eligible,
                )
            )
            continue

        assert isinstance(record_id, str)
        title = record["title"]
        tags = record["tags"]
        kind = record["kind"]
        created_at = record["createdAt"]
        updated_at = record["updatedAt"]
        assert isinstance(title, str)
        assert isinstance(tags, list)
        assert isinstance(kind, str)
        assert isinstance(created_at, str)
        assert isinstance(updated_at, str)
        sensitivity = eligibility.sensitivity
        assert isinstance(sensitivity, SensitivityLevel)
        source_chat_summary_id = record.get("sourceChatSummaryId")

        documents.append(
            MemoryDocument(
                doc_id=f"memory_bank:{record_id}",
                source=MemoryDocumentSource.memory_bank,
                source_record_id=record_id,
                source_kind=kind,
                title=title,
                body=summary,
                created_at=created_at,
                updated_at=updated_at,
                source_chat_summary_id=(
                    source_chat_summary_id
                    if isinstance(source_chat_summary_id, str)
                    else None
                ),
                sensitivity=sensitivity,
                tags=list(tags),
            )
        )

    documents.sort(key=lambda document: document.doc_id)
    diagnostics.sort(key=_diagnostic_sort_key)
    return MemoryBankAdaptationResult(
        documents=documents,
        diagnostics=diagnostics,
        input_count=len(records),
        document_count=len(documents),
        excluded_count=len(diagnostics),
    )
