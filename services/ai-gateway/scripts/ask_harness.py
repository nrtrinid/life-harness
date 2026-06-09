#!/usr/bin/env python3
"""
Ask Harness CLI — read-only scout chat over a caller-provided context bundle.

Do not commit real personal context files. Use tests/fixtures/synthetic_harness_context.json
for smoke runs. Sends data only to localhost by default.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_CONTEXT = Path("tests/fixtures/synthetic_harness_context.json")
DEFAULT_QUESTION = "What am I avoiding right now?"
DEFAULT_TIMEOUT = 30.0

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ask the Life Harness scout over a local context bundle.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Gateway base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--context",
        type=Path,
        default=DEFAULT_CONTEXT,
        help=f"Context JSON path (default: {DEFAULT_CONTEXT})",
    )
    parser.add_argument(
        "--question",
        default=DEFAULT_QUESTION,
        help=f"Question to ask (default: {DEFAULT_QUESTION!r})",
    )
    parser.add_argument(
        "--mode",
        choices=["operator", "reflection", "builder", "general"],
        default="operator",
        help="Ask Harness mode (default: operator)",
    )
    parser.add_argument(
        "--sensitivity",
        choices=["S0", "S1", "S2", "S3"],
        default="S1",
        help="Sensitivity level (default: S1)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    return parser.parse_args(argv)


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def resolve_path(path: Path) -> Path:
    if path.is_file():
        return path
    from_root = SERVICE_ROOT / path
    if from_root.is_file():
        return from_root
    return path


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    context_path = resolve_path(args.context)

    if not args.question.strip():
        eprint("error: question must not be empty")
        return 1

    if not context_path.is_file():
        eprint(f"error: context file not found: {context_path}")
        return 1

    try:
        context = json.loads(context_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        eprint(f"error: invalid context JSON: {exc}")
        return 1

    eprint(f"context: {context_path}")
    eprint(f"question: {args.question}")
    eprint(f"mode: {args.mode}")

    url = f"{args.base_url.rstrip('/')}/ask-harness"
    payload = {
        "question": args.question,
        "mode": args.mode,
        "sensitivity": args.sensitivity,
        "context": context,
        "conversation_history": [],
    }

    try:
        response = httpx.post(url, json=payload, timeout=args.timeout)
    except httpx.TimeoutException:
        eprint(f"error: request timed out after {args.timeout}s")
        eprint(f"url: {url}")
        return 2
    except httpx.RequestError as exc:
        eprint(f"error: connection failed: {exc}")
        eprint(f"url: {url}")
        eprint("hint: start the gateway with uvicorn app.main:app --host 127.0.0.1 --port 8111")
        return 2

    eprint(f"status: {response.status_code}")

    if response.status_code != 200:
        eprint(f"api error: {response.text}")
        return 3

    try:
        data = response.json()
    except json.JSONDecodeError:
        eprint("error: response was not valid JSON")
        return 3

    print(json.dumps(data, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
