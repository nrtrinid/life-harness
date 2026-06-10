#!/usr/bin/env python3
"""Run thread intelligence eval fixtures against the local ai-gateway (mock default)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

from app.eval_runner import (
    DEFAULT_CONTEXT_FIXTURE,
    EVALS_DIR,
    load_default_context,
    load_eval_cases,
    run_eval_case,
)

DEFAULT_BASE = "http://127.0.0.1:8111"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_CONTEXT_FIXTURE)
    parser.add_argument("--file", type=Path, help="Single eval JSON file")
    args = parser.parse_args()

    context = load_default_context(args.fixture)
    files = [args.file] if args.file else sorted(EVALS_DIR.glob("*.json"))
    if not files:
        print("No eval files found.", file=sys.stderr)
        return 1

    passed = 0
    failed = 0

    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=60.0) as client:
        health = client.get("/health")
        if health.status_code != 200:
            print(f"Gateway not healthy at {args.base_url}", file=sys.stderr)
            return 1

        for path in files:
            for case in load_eval_cases(path):
                name = case.get("name", path.stem)
                ok, detail = run_eval_case(client, case, context)
                status = "PASS" if ok else "FAIL"
                print(f"{status} {path.name} :: {name} — {detail}")
                if ok:
                    passed += 1
                else:
                    failed += 1

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
