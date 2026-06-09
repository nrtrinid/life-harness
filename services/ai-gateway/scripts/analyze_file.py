#!/usr/bin/env python3
"""
Local transcript analysis helper.

Do not commit real transcripts. Prefer filenames ending in .transcript.txt
for local-only files covered by .gitignore.
This script sends text only to localhost by default.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_TIMEOUT = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a local transcript file to the AI gateway and print the JSON result.",
    )
    parser.add_argument("file", type=Path, help="Path to a local transcript text file")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Gateway base URL (default: {DEFAULT_BASE_URL})",
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
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    return parser.parse_args()


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def main() -> int:
    args = parse_args()
    path: Path = args.file

    if not path.is_file():
        eprint(f"error: file not found: {path}")
        return 1

    text = path.read_text(encoding="utf-8")
    if not text.strip():
        eprint(f"error: file is empty: {path}")
        return 1

    eprint(f"file: {path}")
    eprint(f"length: {len(text)} chars")

    url = f"{args.base_url.rstrip('/')}/analyze-transcript"
    payload = {
        "text": text,
        "mode": args.mode,
        "sensitivity": args.sensitivity,
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
