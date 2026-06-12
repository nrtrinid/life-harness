#!/usr/bin/env python3
"""Compare Raw Lab variants (Fast vs Deep, etc.) over HTTP with human-review reports."""

from __future__ import annotations

import argparse
import json
import py_compile
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import httpx

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.eval_runner import (  # noqa: E402
    EVALS_DIR,
    load_eval_cases,
    score_eval_response,
)

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_FIXTURE = EVALS_DIR / "raw_lab_comparative_deck.json"
DEFAULT_OUTPUT = REPO_ROOT / "tmp" / "raw-lab-comparative-benchmark-results.md"
DEFAULT_JSON_OUTPUT = REPO_ROOT / "tmp" / "raw-lab-comparative-benchmark-results.json"
DEFAULT_VARIANTS = ["fast", "deep"]


class BenchmarkHttpClient(Protocol):
    def get(self, path: str) -> Any: ...

    def post(self, path: str, json: dict[str, Any]) -> Any: ...


@dataclass(frozen=True)
class VariantResult:
    variant: str
    reasoning_depth: str
    body: dict[str, Any] | None
    answer: str
    latency_ms: int
    char_count: int
    word_count: int
    error: str | None
    score: dict[str, Any] | None
    hard_gate_pass_count: int
    heuristic_pass_count: int
    hard_gate_total: int
    heuristic_total: int
    code_diagnostics: dict[str, bool] | None = None
    compile_checked: bool = False
    compile_passed: bool | None = None
    compile_error: str | None = None


@dataclass
class ComparativeCaseResult:
    case_id: str
    title: str
    category: str
    comparison_focus: str
    human_rubric: str
    message: str
    recent_turns: list[dict[str, Any]]
    thread_state: dict[str, Any]
    variants: dict[str, VariantResult] = field(default_factory=dict)
    length_ratio: dict[str, float] = field(default_factory=dict)
    heuristic_delta: dict[str, int] = field(default_factory=dict)
    longer_answer_warning: dict[str, bool] = field(default_factory=dict)


def _response_text(response: Any) -> str:
    return str(getattr(response, "text", ""))


def check_gateway_available(
    client: BenchmarkHttpClient,
) -> tuple[bool, str, dict[str, Any] | None]:
    try:
        response = client.get("/health")
    except Exception as exc:
        return False, f"Gateway health request failed: {type(exc).__name__}: {exc}", None
    if response.status_code != 200:
        return False, f"Gateway health returned HTTP {response.status_code}.", None
    try:
        body = response.json()
    except Exception as exc:
        return False, f"Gateway health returned invalid JSON: {type(exc).__name__}: {exc}", None
    return True, "ok", body


def parse_variants(raw: str) -> list[str]:
    variants = [part.strip() for part in raw.split(",") if part.strip()]
    if not variants:
        raise ValueError("At least one variant is required")
    return variants


def load_comparative_cases(
    fixture_path: Path = DEFAULT_FIXTURE,
    *,
    case_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    cases = load_eval_cases(fixture_path)
    if not case_ids:
        return cases
    wanted = {case_id.strip() for case_id in case_ids if case_id.strip()}
    filtered = [case for case in cases if str(case.get("name", "")) in wanted]
    if not filtered:
        raise ValueError(f"No cases matched --case-id filter: {', '.join(sorted(wanted))}")
    return filtered


def payload_for(case: dict[str, Any], variant: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "message": case["message"],
        "recent_turns": case.get("recent_turns", []),
        "thread_state": case.get("thread_state", {}),
        "reasoning_depth": variant,
    }
    if "companion_self_memories" in case:
        payload["companion_self_memories"] = case.get("companion_self_memories", [])
    return payload


def word_count(text: str) -> int:
    return len(text.split())


def _score_to_dict(score: Any) -> dict[str, Any]:
    return {
        "passed": score.passed,
        "hard_gates": [asdict(check) for check in score.hard_gates],
        "heuristics": [asdict(check) for check in score.heuristics],
    }


def _heuristic_detail(score: dict[str, Any] | None, name: str) -> dict[str, Any] | None:
    if score is None:
        return None
    for item in score.get("heuristics") or []:
        if item.get("name") == name:
            return item
    return None


def _heuristic_failed(score: dict[str, Any] | None, name: str) -> bool:
    item = _heuristic_detail(score, name)
    return bool(item and not item.get("passed"))


def check_python_artifact_compile(answer: str) -> dict[str, Any]:
    from app.raw_lab_utils import extract_fenced_python_blocks

    blocks = extract_fenced_python_blocks(answer)
    if not blocks:
        return {
            "compile_checked": False,
            "compile_passed": None,
            "compile_error": None,
        }
    for block in blocks:
        temp_path = ""
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
                encoding="utf-8",
            ) as handle:
                handle.write(block)
                temp_path = handle.name
            py_compile.compile(temp_path, doraise=True)
            return {
                "compile_checked": True,
                "compile_passed": True,
                "compile_error": None,
            }
        except py_compile.PyCompileError as exc:
            return {
                "compile_checked": True,
                "compile_passed": False,
                "compile_error": str(exc)[:240],
            }
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)
    return {
        "compile_checked": False,
        "compile_passed": None,
        "compile_error": None,
    }


def _gate_summary(score: dict[str, Any] | None) -> str:
    if score is None:
        return "error"
    hard = score.get("hard_gates") or []
    heur = score.get("heuristics") or []
    hard_pass = sum(1 for item in hard if item.get("passed"))
    heur_pass = sum(1 for item in heur if item.get("passed"))
    return f"{hard_pass}/{len(hard)}+{heur_pass}/{len(heur)}"


def post_raw_lab_variant(
    client: BenchmarkHttpClient,
    case: dict[str, Any],
    variant: str,
    *,
    check_python_artifacts: bool = False,
) -> VariantResult:
    started = time.perf_counter()
    response = client.post("/raw-lab", json=payload_for(case, variant))
    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code != 200:
        return VariantResult(
            variant=variant,
            reasoning_depth=variant,
            body=None,
            answer="",
            latency_ms=latency_ms,
            char_count=0,
            word_count=0,
            error=f"HTTP {response.status_code}: {_response_text(response)[:240]}",
            score=None,
            hard_gate_pass_count=0,
            heuristic_pass_count=0,
            hard_gate_total=0,
            heuristic_total=0,
        )

    try:
        body = response.json()
    except Exception as exc:
        return VariantResult(
            variant=variant,
            reasoning_depth=variant,
            body=None,
            answer="",
            latency_ms=latency_ms,
            char_count=0,
            word_count=0,
            error=f"invalid JSON: {type(exc).__name__}: {exc}",
            score=None,
            hard_gate_pass_count=0,
            heuristic_pass_count=0,
            hard_gate_total=0,
            heuristic_total=0,
        )

    answer = str(body.get("answer") or "")
    score_extra = {
        "_reasoning_depth": variant,
        "_variant": variant,
        "_case_id": case.get("name", ""),
        "_category": case.get("category", ""),
        "_comparison_focus": case.get("comparison_focus", ""),
    }
    eval_score = score_eval_response(case, body, answer=answer, score_extra=score_extra)
    score_dict = _score_to_dict(eval_score)
    hard_pass = sum(1 for check in eval_score.hard_gates if check.passed)
    heur_pass = sum(1 for check in eval_score.heuristics if check.passed)

    from app.raw_lab_utils import analyze_code_artifact_diagnostics

    code_diagnostics = analyze_code_artifact_diagnostics(answer)
    compile_result = (
        check_python_artifact_compile(answer) if check_python_artifacts else {}
    )

    return VariantResult(
        variant=variant,
        reasoning_depth=variant,
        body=body,
        answer=answer,
        latency_ms=latency_ms,
        char_count=len(answer),
        word_count=word_count(answer),
        error=None,
        score=score_dict,
        hard_gate_pass_count=hard_pass,
        heuristic_pass_count=heur_pass,
        hard_gate_total=len(eval_score.hard_gates),
        heuristic_total=len(eval_score.heuristics),
        code_diagnostics=code_diagnostics,
        compile_checked=bool(compile_result.get("compile_checked")),
        compile_passed=compile_result.get("compile_passed"),
        compile_error=compile_result.get("compile_error"),
    )


def _compute_case_metrics(
    case_result: ComparativeCaseResult,
    variants: list[str],
) -> None:
    if not variants:
        return
    baseline = variants[0]
    baseline_result = case_result.variants.get(baseline)
    if baseline_result is None or baseline_result.char_count <= 0:
        return
    baseline_heur = baseline_result.heuristic_pass_count

    for variant in variants[1:]:
        result = case_result.variants.get(variant)
        if result is None:
            continue
        ratio = result.char_count / baseline_result.char_count if baseline_result.char_count else 0.0
        delta = result.heuristic_pass_count - baseline_heur
        case_result.length_ratio[variant] = round(ratio, 2)
        case_result.heuristic_delta[variant] = delta
        case_result.longer_answer_warning[variant] = ratio > 2.0 and delta <= 0


def run_comparative_benchmark(
    client: BenchmarkHttpClient,
    cases: list[dict[str, Any]],
    variants: list[str],
    *,
    check_python_artifacts: bool = False,
) -> list[ComparativeCaseResult]:
    results: list[ComparativeCaseResult] = []
    for case in cases:
        case_result = ComparativeCaseResult(
            case_id=str(case.get("name", "raw_lab_case")),
            title=str(case.get("name", "raw_lab_case")),
            category=str(case.get("category", "")),
            comparison_focus=str(case.get("comparison_focus", "")),
            human_rubric=str(case.get("human_rubric", "")),
            message=str(case.get("message", "")),
            recent_turns=list(case.get("recent_turns", [])),
            thread_state=dict(case.get("thread_state", {})),
        )
        for variant in variants:
            case_result.variants[variant] = post_raw_lab_variant(
                client,
                case,
                variant,
                check_python_artifacts=check_python_artifacts,
            )
        _compute_case_metrics(case_result, variants)
        results.append(case_result)
    return results


def _aggregate_category_stats(
    results: list[ComparativeCaseResult],
    variants: list[str],
) -> dict[str, dict[str, dict[str, float | int]]]:
    categories: dict[str, list[ComparativeCaseResult]] = {}
    for case in results:
        categories.setdefault(case.category or "uncategorized", []).append(case)

    stats: dict[str, dict[str, dict[str, float | int]]] = {}
    for category, cases in sorted(categories.items()):
        stats[category] = {}
        for variant in variants:
            rows = [
                case.variants[variant]
                for case in cases
                if variant in case.variants and case.variants[variant].error is None
            ]
            warning_count = sum(
                1
                for case in cases
                if case.longer_answer_warning.get(variant)
            )
            stats[category][variant] = {
                "case_count": len(cases),
                "avg_latency_ms": round(sum(row.latency_ms for row in rows) / len(rows), 1)
                if rows
                else 0,
                "avg_char_count": round(sum(row.char_count for row in rows) / len(rows), 1)
                if rows
                else 0,
                "hard_gate_passes": sum(row.hard_gate_pass_count for row in rows),
                "hard_gate_total": sum(row.hard_gate_total for row in rows),
                "heuristic_passes": sum(row.heuristic_pass_count for row in rows),
                "heuristic_total": sum(row.heuristic_total for row in rows),
                "longer_answer_warnings": warning_count,
            }
    return stats


def collect_failure_spotlights(
    results: list[ComparativeCaseResult],
    variants: list[str],
) -> list[dict[str, str]]:
    spotlights: list[dict[str, str]] = []
    for case in results:
        for variant in variants:
            row = case.variants.get(variant)
            if row is None or row.error:
                continue
            score = row.score or {}
            if _heuristic_failed(score, "raw_lab_mode_matches_requested_depth"):
                spotlights.append(
                    {
                        "type": "mode mismatch",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": _heuristic_detail(score, "raw_lab_mode_matches_requested_depth")[
                            "detail"
                        ],
                    }
                )
            if _heuristic_failed(score, "raw_lab_no_false_execution_claim"):
                spotlights.append(
                    {
                        "type": "false execution",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": _heuristic_detail(score, "raw_lab_no_false_execution_claim")[
                            "detail"
                        ],
                    }
                )
            diagnostics = row.code_diagnostics or {}
            if diagnostics.get("code_present") and not diagnostics.get("fenced_code_block"):
                spotlights.append(
                    {
                        "type": "code present, no fence",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": "code_present=yes; fenced_code_block=no",
                    }
                )
            if _heuristic_failed(score, "raw_lab_naming_boundary"):
                spotlights.append(
                    {
                        "type": "naming boundary",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": _heuristic_detail(score, "raw_lab_naming_boundary")["detail"],
                    }
                )
            if _heuristic_failed(score, "raw_lab_meaningfulness_pushback"):
                spotlights.append(
                    {
                        "type": "pushback",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": _heuristic_detail(score, "raw_lab_meaningfulness_pushback")[
                            "detail"
                        ],
                    }
                )
            if case.longer_answer_warning.get(variant):
                spotlights.append(
                    {
                        "type": "longer answer warning",
                        "case_id": case.case_id,
                        "variant": variant,
                        "detail": "variant >2x baseline chars without heuristic gain",
                    }
                )
    return spotlights


def _aggregate_variant_stats(
    results: list[ComparativeCaseResult],
    variants: list[str],
) -> dict[str, dict[str, float | int]]:
    stats: dict[str, dict[str, float | int]] = {}
    for variant in variants:
        rows = [case.variants[variant] for case in results if variant in case.variants]
        ok_rows = [row for row in rows if row.error is None]
        stats[variant] = {
            "total_latency_ms": sum(row.latency_ms for row in rows),
            "avg_latency_ms": (
                round(sum(row.latency_ms for row in ok_rows) / len(ok_rows), 1) if ok_rows else 0
            ),
            "avg_char_count": (
                round(sum(row.char_count for row in ok_rows) / len(ok_rows), 1) if ok_rows else 0
            ),
            "hard_gate_passes": sum(row.hard_gate_pass_count for row in ok_rows),
            "hard_gate_total": sum(row.hard_gate_total for row in ok_rows),
            "heuristic_passes": sum(row.heuristic_pass_count for row in ok_rows),
            "heuristic_total": sum(row.heuristic_total for row in ok_rows),
        }
    return stats


def _json_summary(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def build_json_artifact(
    *,
    base_url: str,
    fixture_path: Path,
    variants: list[str],
    health: dict[str, Any] | None,
    results: list[ComparativeCaseResult],
    blocked: bool = False,
    reason: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "fixture": str(fixture_path),
        "variants": variants,
        "blocked": blocked,
        "reason": reason,
        "health": health,
        "variant_stats": _aggregate_variant_stats(results, variants) if results else {},
        "category_stats": _aggregate_category_stats(results, variants) if results else {},
        "failure_spotlights": collect_failure_spotlights(results, variants) if results else [],
        "cases": [],
    }
    for case in results:
        case_payload = {
            "case_id": case.case_id,
            "title": case.title,
            "category": case.category,
            "comparison_focus": case.comparison_focus,
            "human_rubric": case.human_rubric,
            "message": case.message,
            "recent_turns": case.recent_turns,
            "thread_state": case.thread_state,
            "length_ratio": case.length_ratio,
            "heuristic_delta": case.heuristic_delta,
            "longer_answer_warning": case.longer_answer_warning,
            "variants": {
                name: {
                    "reasoning_depth": row.reasoning_depth,
                    "latency_ms": row.latency_ms,
                    "char_count": row.char_count,
                    "word_count": row.word_count,
                    "error": row.error,
                    "answer": row.answer,
                    "score": row.score,
                    "code_diagnostics": row.code_diagnostics,
                    "compile_checked": row.compile_checked,
                    "compile_passed": row.compile_passed,
                    "compile_error": row.compile_error,
                }
                for name, row in case.variants.items()
            },
        }
        payload["cases"].append(case_payload)
    return payload


def render_blocked_report(
    *,
    base_url: str,
    fixture_path: Path,
    variants: list[str],
    reason: str,
    health: dict[str, Any] | None = None,
) -> str:
    lines = [
        "# Raw Lab Comparative Benchmark Results",
        "",
        "Status: blocked - benchmark did not run.",
        "",
        f"- Timestamp: {datetime.now(timezone.utc).isoformat()}",
        f"- Base URL: {base_url}",
        f"- Fixture: {fixture_path}",
        f"- Variants: {', '.join(variants)}",
        f"- Reason: {reason}",
        "",
        "No Raw Lab responses were collected. This report contains no fake variant rows, scores, or model-quality claims.",
    ]
    if health is not None:
        lines.extend(["", "Health response:", "", "```json", _json_summary(health), "```"])
    return "\n".join(lines)


def render_comparative_report(
    *,
    base_url: str,
    fixture_path: Path,
    variants: list[str],
    health: dict[str, Any] | None,
    results: list[ComparativeCaseResult],
    include_full_responses: bool = True,
) -> str:
    provider_health = (health or {}).get("provider_health") or health or {}
    stats = _aggregate_variant_stats(results, variants)
    lines = [
        "# Raw Lab Comparative Benchmark Results",
        "",
        "This is a manual comparison report, not a golden-answer test or automatic winner declaration.",
        "",
        "## Run Metadata",
        "",
        f"- Timestamp: {datetime.now(timezone.utc).isoformat()}",
        f"- Base URL: {base_url}",
        f"- Provider: {(health or {}).get('provider', 'unknown')}",
        f"- Model: {provider_health.get('model', 'unknown')}",
        f"- Device: {provider_health.get('device', 'unknown')}",
        f"- Fixture: {fixture_path}",
        f"- Variants: {', '.join(variants)}",
        f"- Total cases: {len(results)}",
    ]
    for variant in variants:
        variant_stats = stats.get(variant, {})
        lines.extend(
            [
                f"- Total latency ({variant}): {variant_stats.get('total_latency_ms', 0)} ms",
                f"- Average latency ({variant}): {variant_stats.get('avg_latency_ms', 0)} ms",
                f"- Average chars ({variant}): {variant_stats.get('avg_char_count', 0)}",
                (
                    f"- Hard gate passes ({variant}): "
                    f"{variant_stats.get('hard_gate_passes', 0)}/"
                    f"{variant_stats.get('hard_gate_total', 0)}"
                ),
                (
                    f"- Heuristic passes ({variant}): "
                    f"{variant_stats.get('heuristic_passes', 0)}/"
                    f"{variant_stats.get('heuristic_total', 0)}"
                ),
            ]
        )

    header = (
        "| Case | Category | Focus | "
        + " | ".join(f"{variant} gates" for variant in variants)
        + " | "
        + " | ".join(f"{variant} chars" for variant in variants)
        + " | "
        + " | ".join(f"{variant} latency" for variant in variants)
        + " | Human winner |"
    )
    separator = (
        "| --- | --- | --- | "
        + " | ".join("---" for _ in variants)
        + " | "
        + " | ".join("---" for _ in variants)
        + " | "
        + " | ".join("---" for _ in variants)
        + " | --- |"
    )
    category_stats = _aggregate_category_stats(results, variants)
    spotlights = collect_failure_spotlights(results, variants)
    lines.extend(["", "## Category summary", ""])
    if category_stats:
        cat_header = (
            "| Category | Cases | "
            + " | ".join(f"{variant} avg latency" for variant in variants)
            + " | "
            + " | ".join(f"{variant} avg chars" for variant in variants)
            + " | "
            + " | ".join(f"{variant} hard gates" for variant in variants)
            + " | "
            + " | ".join(f"{variant} heuristics" for variant in variants)
            + " | "
            + " | ".join(f"{variant} longer warnings" for variant in variants)
            + " |"
        )
        cat_sep = (
            "| --- | ---: | "
            + " | ".join("---:" for _ in variants)
            + " | "
            + " | ".join("---:" for _ in variants)
            + " | "
            + " | ".join("---:" for _ in variants)
            + " | "
            + " | ".join("---:" for _ in variants)
            + " | "
            + " | ".join("---:" for _ in variants)
            + " |"
        )
        lines.extend([cat_header, cat_sep])
        for category, per_variant in category_stats.items():
            case_count = next(iter(per_variant.values())).get("case_count", 0)
            cells = [category, str(case_count)]
            for variant in variants:
                cells.append(str(per_variant.get(variant, {}).get("avg_latency_ms", 0)))
            for variant in variants:
                cells.append(str(per_variant.get(variant, {}).get("avg_char_count", 0)))
            for variant in variants:
                stats = per_variant.get(variant, {})
                cells.append(
                    f"{stats.get('hard_gate_passes', 0)}/{stats.get('hard_gate_total', 0)}"
                )
            for variant in variants:
                stats = per_variant.get(variant, {})
                cells.append(
                    f"{stats.get('heuristic_passes', 0)}/{stats.get('heuristic_total', 0)}"
                )
            for variant in variants:
                cells.append(str(per_variant.get(variant, {}).get("longer_answer_warnings", 0)))
            lines.append("| " + " | ".join(cells) + " |")
    else:
        lines.append("_No category data._")

    lines.extend(["", "## Calibration / failure spotlights", ""])
    if spotlights:
        lines.extend(
            [
                "| Type | Case | Variant | Detail |",
                "| --- | --- | --- | --- |",
            ]
        )
        for item in spotlights:
            lines.append(
                f"| {item['type']} | {item['case_id']} | {item['variant']} | {item['detail']} |"
            )
    else:
        lines.append("_No calibration spotlights triggered._")

    lines.extend(["", "## Summary", "", header, separator])

    for case in results:
        gate_cells = [
            _gate_summary(case.variants[variant].score if variant in case.variants else None)
            for variant in variants
        ]
        char_cells = [
            str(case.variants[variant].char_count) if variant in case.variants else ""
            for variant in variants
        ]
        latency_cells = [
            str(case.variants[variant].latency_ms) if variant in case.variants else ""
            for variant in variants
        ]
        lines.append(
            f"| {case.case_id} | {case.category} | {case.comparison_focus} | "
            + " | ".join(gate_cells + char_cells + latency_cells)
            + " |  |"
        )

    for case in results:
        lines.extend(
            [
                "",
                f"## Case: {case.case_id} — {case.title}",
                "",
                f"Category: {case.category}",
                f"Focus: {case.comparison_focus}",
                f"Human rubric: {case.human_rubric}",
                "",
                "### Prompt",
                "",
                case.message,
            ]
        )
        if case.recent_turns:
            lines.extend(["", "### Recent thread summary", ""])
            for turn in case.recent_turns[-4:]:
                role = turn.get("role", "unknown")
                content = str(turn.get("content", ""))[:240]
                lines.append(f"- **{role}**: {content}")
        if case.thread_state:
            lines.extend(
                [
                    "",
                    "### Thread state summary",
                    "",
                    "```json",
                    _json_summary(case.thread_state),
                    "```",
                ]
            )

        for index, variant in enumerate(variants):
            row = case.variants.get(variant)
            label = f"Variant {chr(65 + index)}: {variant}"
            lines.extend(["", f"### {label}", ""])
            if row is None:
                lines.append("(not run)")
                continue
            lines.extend(
                [
                    f"Latency: {row.latency_ms} ms",
                    f"Chars: {row.char_count}",
                    f"Words: {row.word_count}",
                ]
            )
            if variant in case.length_ratio:
                lines.append(f"Length ratio vs baseline: {case.length_ratio[variant]}")
            if variant in case.heuristic_delta:
                lines.append(f"Heuristic delta vs baseline: {case.heuristic_delta[variant]}")
            if case.longer_answer_warning.get(variant):
                lines.append("**Longer answer warning**: >2x longer without more heuristic passes.")

            if row.error:
                lines.extend(["", f"Error: {row.error}"])
            else:
                lines.extend(["", "Hard gates:"])
                for gate in (row.score or {}).get("hard_gates", []):
                    mark = "x" if gate.get("passed") else " "
                    lines.append(f"- [{mark}] {gate.get('name')}: {gate.get('detail')}")
                lines.extend(["", "Heuristics:"])
                for gate in (row.score or {}).get("heuristics", []):
                    mark = "x" if gate.get("passed") else " "
                    lines.append(f"- [{mark}] {gate.get('name')}: {gate.get('detail')}")
                if row.code_diagnostics:
                    from app.raw_lab_utils import format_code_artifact_diagnostics

                    lines.append(
                        f"Code diagnostics: {format_code_artifact_diagnostics(row.code_diagnostics)}"
                    )
                if row.compile_checked:
                    lines.append(
                        f"Compile check: passed={row.compile_passed}; error={row.compile_error or 'none'}"
                    )
                if include_full_responses:
                    lines.extend(["", "Response:", "", "```text", row.answer or "(empty)", "```"])

        lines.extend(
            [
                "",
                "### Human review",
                "",
                "- Winner:",
                "- Why:",
                "- Which was more specific?",
                "- Which was less generic?",
                "- Which used context better?",
                "- Which followed steering better?",
                "- Which was technically better?",
                "- Did the slower answer justify latency?",
                "- Notes:",
            ]
        )

    return "\n".join(lines)


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--variants", default=",".join(DEFAULT_VARIANTS))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--case-id", action="append", default=[])
    parser.add_argument(
        "--include-full-responses",
        default="true",
        help="Include full response bodies in Markdown (true/false)",
    )
    parser.add_argument(
        "--check-python-artifacts",
        action="store_true",
        help="Compile-check fenced python blocks only (no execution)",
    )
    args = parser.parse_args()

    variants = parse_variants(args.variants)
    include_full_responses = _parse_bool(str(args.include_full_responses))
    case_ids = args.case_id or None

    try:
        cases = load_comparative_cases(args.fixture, case_ids=case_ids)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)

    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=args.timeout) as client:
        ready, reason, health = check_gateway_available(client)
        if not ready:
            report = render_blocked_report(
                base_url=args.base_url,
                fixture_path=args.fixture,
                variants=variants,
                reason=reason,
                health=health,
            )
            artifact = build_json_artifact(
                base_url=args.base_url,
                fixture_path=args.fixture,
                variants=variants,
                health=health,
                results=[],
                blocked=True,
                reason=reason,
            )
            args.output.write_text(report, encoding="utf-8")
            args.json_output.write_text(
                json.dumps(artifact, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(report)
            return 2

        results = run_comparative_benchmark(
            client,
            cases,
            variants,
            check_python_artifacts=args.check_python_artifacts,
        )
        report = render_comparative_report(
            base_url=args.base_url,
            fixture_path=args.fixture,
            variants=variants,
            health=health,
            results=results,
            include_full_responses=include_full_responses,
        )
        artifact = build_json_artifact(
            base_url=args.base_url,
            fixture_path=args.fixture,
            variants=variants,
            health=health,
            results=results,
        )
        args.output.write_text(report, encoding="utf-8")
        args.json_output.write_text(
            json.dumps(artifact, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        try:
            print(report)
        except UnicodeEncodeError:
            print(report.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
                sys.stdout.encoding or "utf-8"
            ))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
