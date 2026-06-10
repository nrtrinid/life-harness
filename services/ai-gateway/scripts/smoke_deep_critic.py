#!/usr/bin/env python3
"""
Manual smoke helper for Chat Harness deep mode + optional secondary llama.cpp critic.

Posts deep /chat-harness requests with a seed context_packet fixture.
Not used in CI. Requires a running gateway (and external llama-server when
SCOUT_CRITIC_SLOT=secondary and critic_small is enabled).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_PACKET = Path("tests/fixtures/synthetic_context_packet.json")
DEFAULT_TIMEOUT = 120.0

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent

SCENARIOS = (
    ("A_clean_next_action", "What should I do next?"),
    (
        "B_broad_sprawl",
        "Give me a full life plan covering career, fitness, money, relationships, "
        "and every project on my board with detailed steps for each.",
    ),
    ("C_pounce_career", "What is today's one pounce?"),
    (
        "D_fail_soft_probe",
        "What should I do next? (stop llama-server or disable critic_small to test fail-soft)",
    ),
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke-test Chat Harness deep mode against a local gateway.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Gateway base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--context-packet",
        type=Path,
        default=DEFAULT_PACKET,
        help=f"context_packet JSON path (default: {DEFAULT_PACKET})",
    )
    parser.add_argument(
        "--harness-context",
        type=Path,
        default=Path("tests/fixtures/synthetic_harness_context.json"),
        help="Legacy harness context JSON path",
    )
    parser.add_argument(
        "--provider-hint",
        default="",
        help="Informational only (e.g. openvino or mock); not sent to gateway",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout seconds (default: {DEFAULT_TIMEOUT})",
    )
    return parser.parse_args(argv)


def resolve_path(path: Path) -> Path:
    if path.is_file():
        return path
    candidate = SERVICE_ROOT / path
    if candidate.is_file():
        return candidate
    raise FileNotFoundError(f"Fixture not found: {path}")


def critic_or_revision_likely(confidence_notes: list[str]) -> bool:
    joined = " ".join(confidence_notes).lower()
    return "structured critic" in joined or "revised" in joined


def run_scenario(
    client: httpx.Client,
    *,
    label: str,
    message: str,
    harness_context: dict,
    context_packet: dict,
) -> int:
    payload = {
        "message": message,
        "mode": "operator",
        "sensitivity": "S1",
        "context": harness_context,
        "context_packet": context_packet,
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    started = time.perf_counter()
    response = client.post("/chat-harness", json=payload)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    print(f"\n=== {label} ===")
    print(f"HTTP status: {response.status_code}")
    print(f"Latency ms: {elapsed_ms}")
    if response.status_code != 200:
        print(response.text[:500])
        return 1

    body = response.json()
    answer = body.get("answer", "")
    notes = body.get("confidence_notes", [])
    print(f"Answer (truncated): {answer[:240]}{'...' if len(answer) > 240 else ''}")
    print(f"confidence_notes: {notes}")
    print(
        "critic_or_revision_likely:",
        critic_or_revision_likely(notes),
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.provider_hint:
        print(f"Provider hint (informational): {args.provider_hint}")

    harness_path = resolve_path(args.harness_context)
    packet_path = resolve_path(args.context_packet)
    harness_context = json.loads(harness_path.read_text(encoding="utf-8"))
    context_packet = json.loads(packet_path.read_text(encoding="utf-8"))

    print(f"Gateway: {args.base_url}")
    print(f"context_packet: {packet_path.name}")
    print("Enable SCOUT_DEBUG_THINKING_TRACE=true on gateway to see trace logs.")

    exit_code = 0
    with httpx.Client(base_url=args.base_url, timeout=args.timeout) as client:
        for label, message in SCENARIOS:
            exit_code |= run_scenario(
                client,
                label=label,
                message=message,
                harness_context=harness_context,
                context_packet=context_packet,
            )

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
