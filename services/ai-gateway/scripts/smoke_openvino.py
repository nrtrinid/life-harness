#!/usr/bin/env python3
"""
OpenVINO smoke test for the local AI gateway.

Do not commit real transcripts or real analyze outputs.
Prefer tests/fixtures/synthetic_transcript.txt for smoke runs.
This script sends text only to localhost by default.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

from app.models import AnalyzeTranscriptResponse

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_FIXTURE = Path("tests/fixtures/synthetic_transcript.txt")
DEFAULT_OUTPUT_PATH = "docs/sample-outputs/openvino_synthetic_analysis.example.json"
DEFAULT_TIMEOUT = 180.0

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test OpenVINO provider via localhost gateway.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Gateway base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE,
        help=f"Transcript fixture path (default: {DEFAULT_FIXTURE})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--mode",
        choices=["operator", "reflection", "coach"],
        default="operator",
        help="Analysis mode (default: operator)",
    )
    parser.add_argument(
        "--sensitivity",
        choices=["S0", "S1", "S2", "S3"],
        default="S1",
        help="Sensitivity level (default: S1)",
    )
    parser.add_argument(
        "--write-output",
        nargs="?",
        const=DEFAULT_OUTPUT_PATH,
        default=None,
        help=(
            "Write validated JSON to file "
            f"(default path: {DEFAULT_OUTPUT_PATH})"
        ),
    )
    return parser.parse_args(argv)


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def fail(message: str, exit_code: int) -> int:
    eprint(f"error: {message}")
    print("smoke: fail")
    return exit_code


def resolve_fixture(path: Path) -> Path:
    if path.is_file():
        return path
    from_root = SERVICE_ROOT / path
    if from_root.is_file():
        return from_root
    return path


def print_smoke_metrics(
    *,
    health_status: str,
    provider: str,
    model: str | None,
    device: str | None,
    load_result: str,
    request_duration_seconds: float | None,
    schema_valid: bool,
) -> None:
    duration = (
        f"{request_duration_seconds:.3f}"
        if request_duration_seconds is not None
        else "n/a"
    )
    eprint("Smoke metrics:")
    eprint(f"- health_status: {health_status}")
    eprint(f"- provider: {provider}")
    eprint(f"- model: {model or 'n/a'}")
    eprint(f"- device: {device or 'n/a'}")
    eprint(f"- load_result: {load_result}")
    eprint(f"- request_duration_seconds: {duration}")
    eprint(f"- schema_valid: {'true' if schema_valid else 'false'}")
    eprint("- first_try_json_success: n/a")
    eprint("- repair_used: n/a")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    fixture_path = resolve_fixture(args.fixture)

    if not fixture_path.is_file():
        return fail(f"fixture not found: {fixture_path}", 1)

    text = fixture_path.read_text(encoding="utf-8")
    if not text.strip():
        return fail(f"fixture is empty: {fixture_path}", 1)

    eprint(f"fixture: {fixture_path}")
    eprint(f"length: {len(text)} chars")

    health_url = f"{args.base_url.rstrip('/')}/health"
    try:
        health_response = httpx.get(health_url, timeout=args.timeout)
    except httpx.TimeoutException:
        eprint(f"error: health request timed out after {args.timeout}s")
        eprint(f"url: {health_url}")
        print("smoke: fail")
        return 2
    except httpx.RequestError as exc:
        eprint(f"error: cannot reach service: {exc}")
        eprint(f"url: {health_url}")
        eprint("hint: start the gateway with uvicorn app.main:app --host 127.0.0.1 --port 8111")
        print("smoke: fail")
        return 2

    if health_response.status_code != 200:
        eprint(f"error: health returned status {health_response.status_code}")
        eprint(f"body: {health_response.text}")
        print("smoke: fail")
        return 3

    try:
        health = health_response.json()
    except json.JSONDecodeError:
        return fail("health response was not valid JSON", 3)

    health_status = health.get("status", "unknown")
    provider = health.get("provider", "unknown")
    model = health.get("model")
    device = health.get("device")
    message = health.get("message") or "ready"
    load_result = message if health_status != "ok" else "ready"

    if health_status != "ok" or provider != "openvino":
        eprint(f"error: service not ready for OpenVINO smoke (status={health_status}, provider={provider})")
        if message:
            eprint(f"message: {message}")
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=None,
            schema_valid=False,
        )
        print("smoke: fail")
        return 3

    analyze_url = f"{args.base_url.rstrip('/')}/analyze-transcript"
    payload = {
        "text": text,
        "mode": args.mode,
        "sensitivity": args.sensitivity,
    }

    started = time.perf_counter()
    try:
        analyze_response = httpx.post(analyze_url, json=payload, timeout=args.timeout)
    except httpx.TimeoutException:
        eprint(f"error: analyze request timed out after {args.timeout}s")
        eprint(f"url: {analyze_url}")
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=time.perf_counter() - started,
            schema_valid=False,
        )
        print("smoke: fail")
        return 4
    except httpx.RequestError as exc:
        eprint(f"error: analyze connection failed: {exc}")
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=time.perf_counter() - started,
            schema_valid=False,
        )
        print("smoke: fail")
        return 4

    duration = time.perf_counter() - started

    if analyze_response.status_code != 200:
        eprint(f"error: analyze returned status {analyze_response.status_code}")
        eprint(f"body: {analyze_response.text}")
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=duration,
            schema_valid=False,
        )
        print("smoke: fail")
        return 4

    try:
        data = analyze_response.json()
    except json.JSONDecodeError:
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=duration,
            schema_valid=False,
        )
        return fail("analyze response was not valid JSON", 4)

    try:
        validated = AnalyzeTranscriptResponse.model_validate(data)
    except Exception as exc:
        eprint(f"error: schema validation failed: {exc}")
        print_smoke_metrics(
            health_status=health_status,
            provider=provider,
            model=model,
            device=device,
            load_result=load_result,
            request_duration_seconds=duration,
            schema_valid=False,
        )
        print("smoke: fail")
        return 4

    print_smoke_metrics(
        health_status=health_status,
        provider=provider,
        model=model,
        device=device,
        load_result=load_result,
        request_duration_seconds=duration,
        schema_valid=True,
    )

    if args.write_output is not None:
        output_path = Path(args.write_output)
        if not output_path.is_absolute():
            output_path = SERVICE_ROOT / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(validated.model_dump(mode="json"), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        eprint(f"wrote: {output_path}")

    print("smoke: pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
