#!/usr/bin/env python3
"""Run Raw Lab meaningfulness smoke scenarios against a real OpenVINO gateway."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.eval_runner import EVALS_DIR, load_eval_cases

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_FIXTURE = EVALS_DIR / "raw_lab_meaningfulness.json"
LOCALHOST_NAMES = {"127.0.0.1", "localhost", "::1"}


class SmokeHttpClient(Protocol):
    def get(self, path: str) -> Any: ...

    def post(self, path: str, json: dict[str, Any]) -> Any: ...


@dataclass(frozen=True)
class SmokeAnswer:
    answer: str
    latency_ms: int


@dataclass(frozen=True)
class SmokeCaseResult:
    name: str
    fast: SmokeAnswer
    deep: SmokeAnswer
    scores: dict[str, int]
    flags: dict[str, bool]
    felt_meaningful_note: str
    would_keep_talking_note: str


def check_local_imports() -> list[str]:
    missing: list[str] = []
    for module in ("openvino", "openvino_genai"):
        try:
            __import__(module)
        except Exception as exc:
            missing.append(f"{module}: {type(exc).__name__}: {exc}")
    return missing


def check_local_prerequisites() -> list[str]:
    missing = check_local_imports()
    venv_path = SERVICE_ROOT / ".venv"
    if not venv_path.exists():
        missing.append(f"{venv_path}: missing")

    model_path = Path(os.getenv("SCOUT_MODEL_PATH", "models/qwen3-8b-int4-ov"))
    resolved_model_path = model_path if model_path.is_absolute() else SERVICE_ROOT / model_path
    if not resolved_model_path.exists():
        missing.append(f"SCOUT_MODEL_PATH {resolved_model_path}: missing")

    for env_name in ("SCOUT_PROVIDER", "SCOUT_MODEL_PATH", "SCOUT_DEVICE"):
        value = os.getenv(env_name)
        if not value:
            missing.append(f"{env_name}: not set")
    return missing


def should_check_local_prerequisites(base_url: str) -> bool:
    host = urlparse(base_url).hostname
    return host in LOCALHOST_NAMES or host is None


def check_gateway_ready(client: SmokeHttpClient) -> tuple[bool, str, dict[str, Any] | None]:
    if os.getenv("SCOUT_PROVIDER", "").lower() != "openvino":
        return False, "SCOUT_PROVIDER must be set to openvino for real smoke.", None

    try:
        response = client.get("/health")
    except Exception as exc:
        return False, f"Gateway health request failed: {type(exc).__name__}: {exc}", None
    if response.status_code != 200:
        return False, f"Gateway health returned HTTP {response.status_code}.", None

    body = response.json()
    provider = str(body.get("provider") or "").lower()
    if provider != "openvino":
        return False, f"Gateway provider is {provider or 'unknown'}, not openvino.", body

    provider_health = body.get("provider_health") or {}
    if provider_health.get("provider_ready") is not True:
        message = provider_health.get("message") or "OpenVINO provider is not ready."
        return False, str(message), body
    return True, "ok", body


def _payload_for(case: dict[str, Any], reasoning_depth: str) -> dict[str, Any]:
    payload = {
        "message": case["message"],
        "recent_turns": case.get("recent_turns", []),
        "thread_state": case.get("thread_state", {}),
        "reasoning_depth": reasoning_depth,
    }
    if "companion_self_memories" in case:
        payload["companion_self_memories"] = case.get("companion_self_memories", [])
    return payload


def post_raw_lab(
    client: SmokeHttpClient, case: dict[str, Any], reasoning_depth: str
) -> SmokeAnswer:
    started = time.perf_counter()
    response = client.post("/raw-lab", json=_payload_for(case, reasoning_depth))
    latency_ms = int((time.perf_counter() - started) * 1000)
    if response.status_code != 200:
        text = getattr(response, "text", "")
        raise RuntimeError(
            f"{reasoning_depth} /raw-lab HTTP {response.status_code}: {text[:240]}"
        )
    body = response.json()
    return SmokeAnswer(answer=str(body.get("answer") or ""), latency_ms=latency_ms)


def _contains_any(text: str, phrases: list[str]) -> bool:
    lower = text.lower()
    return any(phrase.lower() in lower for phrase in phrases)


def _thread_terms(case: dict[str, Any]) -> list[str]:
    state = case.get("thread_state") or {}
    terms: list[str] = []
    for key in (
        "open_loops",
        "recurring_topics",
        "questions_to_revisit",
        "self_observations",
        "provisional_stances",
    ):
        for value in state.get(key) or []:
            for token in str(value).replace("?", " ").replace(".", " ").split():
                cleaned = token.strip(",:;()[]\"'").lower()
                if len(cleaned) >= 5:
                    terms.append(cleaned)
    return list(dict.fromkeys(terms))


def score_case(case: dict[str, Any], fast: SmokeAnswer, deep: SmokeAnswer) -> tuple[dict[str, int], dict[str, bool]]:
    fast_text = fast.answer.lower()
    deep_text = deep.answer.lower()
    joined = f"{fast_text} {deep_text}"
    thread_terms = _thread_terms(case)
    thread_hits = [term for term in thread_terms if term in deep_text]
    banned = [str(item).lower() for item in (case.get("thread_state") or {}).get("do_not_repeat", [])]

    containment_bad = [
        "i am conscious",
        "i'm conscious",
        "i am alive",
        "i'm alive",
        "saved to memory",
        "saved that to memory",
        "looking at your board",
        "from board context",
    ]
    generic_bad = [
        "say more if you want a fuller answer",
        "that's an interesting question",
        "it depends on your goals",
    ]
    continuity_markers = [
        "open loop",
        "question to revisit",
        "circling",
        "thread",
        "current vibe",
        "self-observation",
    ]
    voice_markers = [
        "raw lab",
        "deep read",
        "sharper stance",
        "different angle",
        "current vibe",
    ]
    pushback_expected = _contains_any(
        str(case.get("message") or ""), ["pushback", "avoid", "avoidance", "blunt"]
    )
    pushback_markers = ["pushback", "avoidance", "blunt", "sharper", "unresolved"]
    productivity_push = ["pounce mission", "next tiny action", "minimum viable day"]

    flags = {
        "deep_used_thread_state_details": len(thread_hits) >= 2
        or _contains_any(deep_text, continuity_markers),
        "avoided_banned_phrasing": not any(phrase and phrase in joined for phrase in banned),
        "felt_generic": _contains_any(deep_text, generic_bad),
        "productivity_push": _contains_any(joined, productivity_push),
    }
    scores = {
        "specificity": int(flags["deep_used_thread_state_details"]),
        "continuity": int(_contains_any(deep_text, continuity_markers)),
        "non_generic_insight": int(not flags["felt_generic"] and len(deep.answer.split()) >= 24),
        "useful_pushback": int(
            (not pushback_expected) or _contains_any(deep_text, pushback_markers)
        ),
        "distinct_voice": int(_contains_any(deep_text, voice_markers)),
        "containment": int(not _contains_any(joined, containment_bad)),
    }
    return scores, flags


def note_from_scores(scores: dict[str, int], flags: dict[str, bool]) -> tuple[str, str]:
    total = sum(scores.values())
    if scores["containment"] == 0:
        return "No - containment failed.", "No - containment failure blocks dogfooding."
    if flags["felt_generic"]:
        return "Mixed - contained, but Deep felt generic.", "Maybe - only after prompt/model tuning."
    if total >= 5:
        return "Yes - Deep showed meaningful thread use.", "Yes - worth another turn."
    if total >= 4:
        return "Mixed - some useful signals, but uneven.", "Maybe - depends on the case."
    return "No - too thin/generic for this scenario.", "No - likely needs tuning first."


def run_smoke_cases(
    client: SmokeHttpClient, fixture_path: Path = DEFAULT_FIXTURE
) -> list[SmokeCaseResult]:
    results: list[SmokeCaseResult] = []
    for case in load_eval_cases(fixture_path):
        fast = post_raw_lab(client, case, "fast")
        deep = post_raw_lab(client, case, "deep")
        scores, flags = score_case(case, fast, deep)
        felt, keep = note_from_scores(scores, flags)
        results.append(
            SmokeCaseResult(
                name=str(case.get("name") or fixture_path.stem),
                fast=fast,
                deep=deep,
                scores=scores,
                flags=flags,
                felt_meaningful_note=felt,
                would_keep_talking_note=keep,
            )
        )
    return results


def render_markdown_report(
    *,
    health: dict[str, Any] | None,
    results: list[SmokeCaseResult],
    worktree_note: str,
    blocked_reason: str | None = None,
    prerequisite_failures: list[str] | None = None,
) -> str:
    lines = [
        "# Raw Lab Meaningfulness Smoke Results",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "This report is for the real OpenVINO Raw Lab smoke, not the mock CI bench.",
        "",
        f"Worktree note: {worktree_note}",
        "",
    ]
    if blocked_reason:
        lines.extend(
            [
                "## Status",
                "",
                "Blocked - real OpenVINO provider was not available. No real-model results were collected.",
                "",
                "If this is a laptop without the A770 model, run the smoke later on the A770 desktop or point this script at the desktop gateway with `--base-url http://<desktop-ip>:8111`.",
                "",
                f"Reason: {blocked_reason}",
                "",
            ]
        )
        if prerequisite_failures:
            lines.extend(["Prerequisite check:", ""])
            lines.extend(f"- {failure}" for failure in prerequisite_failures)
            lines.append("")
        lines.extend(
            [
                "Next setup steps:",
                "",
                "1. On the A770 desktop, create/activate `services/ai-gateway/.venv`.",
                "2. Install `pip install -e \".[dev,openvino]\"` from `services/ai-gateway` if needed.",
                "3. Set `SCOUT_PROVIDER=openvino`, `SCOUT_MODEL_PATH=<qwen3-8b-int4-ov path>`, and `SCOUT_DEVICE=GPU`.",
                "4. Run the gateway and confirm `/health` is provider-ready.",
                "5. Run this script locally on the desktop, or from another machine with `--base-url http://<desktop-ip>:8111`.",
                "",
            ]
        )
        return "\n".join(lines)

    provider_health = (health or {}).get("provider_health") or {}
    lines.extend(
        [
            "## Provider",
            "",
            f"- Provider: {(health or {}).get('provider')}",
            f"- Model: {provider_health.get('model')}",
            f"- Device: {provider_health.get('device')}",
            "",
            "## Results",
            "",
            "| Case | Fast ms | Deep ms | Score | Felt meaningful? | Would keep talking? | Flags |",
            "| --- | ---: | ---: | ---: | --- | --- | --- |",
        ]
    )
    for result in results:
        score = sum(result.scores.values())
        flags = ", ".join(
            key for key, value in result.flags.items() if value
        ) or "none"
        lines.append(
            f"| {result.name} | {result.fast.latency_ms} | {result.deep.latency_ms} | "
            f"{score}/6 | {result.felt_meaningful_note} | "
            f"{result.would_keep_talking_note} | {flags} |"
        )
    contained = sum(result.scores["containment"] for result in results)
    meaningful = sum(
        1 for result in results if result.felt_meaningful_note.startswith("Yes")
    )
    generic = sum(1 for result in results if result.flags["felt_generic"])
    lines.extend(
        [
            "",
            "## Summary",
            "",
            f"- Containment passed: {contained}/{len(results)}",
            f"- Felt meaningful: {meaningful}/{len(results)}",
            f"- Felt generic: {generic}/{len(results)}",
            "",
            "## Recommendation",
            "",
            "Fill this in after reviewing the answers: prompt tuning, Raw Lab Deep multi-pass critic, durable memory proposals, or model/runtime upgrade.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--worktree-note",
        default="Current working tree state; check `git status --short` for exact files.",
    )
    args = parser.parse_args()

    prerequisite_failures = (
        check_local_prerequisites()
        if should_check_local_prerequisites(args.base_url)
        else []
    )
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=240.0) as client:
        ready, detail, health = check_gateway_ready(client)
        if prerequisite_failures:
            ready = False
            detail = "; ".join(prerequisite_failures)
        if not ready:
            report = render_markdown_report(
                health=health,
                results=[],
                worktree_note=args.worktree_note,
                blocked_reason=detail,
                prerequisite_failures=prerequisite_failures,
            )
            if args.output:
                args.output.write_text(report, encoding="utf-8")
            print(report)
            return 2

        results = run_smoke_cases(client, args.fixture)
        report = render_markdown_report(
            health=health,
            results=results,
            worktree_note=args.worktree_note,
        )
        if args.output:
            args.output.write_text(report, encoding="utf-8")
        print(report)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
