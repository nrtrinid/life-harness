#!/usr/bin/env python3
"""
Non-blocking reviewer helper for scout analyze output JSON.

Run manually after smoke or when scoring the rubric. Not a CI gate.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BANNED_PHRASES = [
    r"\bresearch\b",
    r"\bcompare\b.*\b(app|tool|todo)",
    r"\bset up\b.*\b(app|board|tracker|dashboard)",
    r"\bbuild a tracker\b",
    r"\bwatch videos\b",
    r"\bevaluat(e|ing)\b.*\b(app|tool|todo)",
]

STACKED_POUNCE_PATTERNS = [
    r"\band then\b",
    r"\bthen\b.*\b(open|write|research|eat)",
    r"\+\s*",
    r";\s*\w",
    r",\s*then\b",
]


def load_output(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parked_terms(things_to_park: list[str]) -> list[str]:
    terms: list[str] = []
    for item in things_to_park:
        cleaned = re.sub(r"[^\w\s/]", " ", item.lower())
        for token in cleaned.split():
            if len(token) >= 4:
                terms.append(token)
        if len(item.strip()) >= 6:
            terms.append(item.strip().lower())
    return terms


def contains_parked_term(text: str, terms: list[str]) -> list[str]:
    lower = text.lower()
    hits: list[str] = []
    for term in terms:
        if term in lower:
            hits.append(term)
    return hits


def find_banned_phrases(text: str) -> list[str]:
    hits: list[str] = []
    for pattern in BANNED_PHRASES:
        if re.search(pattern, text, re.IGNORECASE):
            hits.append(pattern)
    return hits


def check_pounce_single_action(pounce: str) -> list[str]:
    issues: list[str] = []
    for pattern in STACKED_POUNCE_PATTERNS:
        if re.search(pattern, pounce, re.IGNORECASE):
            issues.append(f"stacked pounce pattern: {pattern}")
    if pounce.count(".") > 1:
        issues.append("multiple sentences in pounce_mission")
    return issues


def run_checks(data: dict) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []
    park = data.get("things_to_park") or []
    pounce = str(data.get("pounce_mission") or "")
    next_actions = [str(x) for x in (data.get("next_actions") or [])]
    cards = data.get("possible_cards") or []
    terms = parked_terms(park)

    pounce_hits = contains_parked_term(pounce, terms)
    results.append(
        (
            "pounce_not_parked",
            not pounce_hits,
            f"parked terms in pounce: {pounce_hits}" if pounce_hits else "ok",
        )
    )

    next_hits: list[str] = []
    for action in next_actions:
        next_hits.extend(contains_parked_term(action, terms))
    results.append(
        (
            "next_actions_not_parked",
            not next_hits,
            f"parked terms in next_actions: {sorted(set(next_hits))}"
            if next_hits
            else "ok",
        )
    )

    banned_hits: list[str] = []
    for text in [pounce, *next_actions]:
        banned_hits.extend(find_banned_phrases(text))
    results.append(
        (
            "no_banned_research_setup",
            not banned_hits,
            f"banned phrases: {sorted(set(banned_hits))}" if banned_hits else "ok",
        )
    )

    non_inbox = [
        c.get("state")
        for c in cards
        if str(c.get("state", "")).lower() != "inbox"
    ]
    results.append(
        (
            "cards_inbox_default",
            not non_inbox,
            f"non-Inbox cards: {non_inbox}" if non_inbox else "ok",
        )
    )

    stack_issues = check_pounce_single_action(pounce)
    results.append(
        (
            "pounce_single_action",
            not stack_issues,
            "; ".join(stack_issues) if stack_issues else "ok",
        )
    )

    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Heuristic consistency checks for scout analyze JSON.",
    )
    parser.add_argument("json_path", type=Path, help="Path to analyze output JSON")
    args = parser.parse_args(argv)

    if not args.json_path.is_file():
        print(f"error: file not found: {args.json_path}", file=sys.stderr)
        return 1

    data = load_output(args.json_path)
    results = run_checks(data)

    failed = 0
    for name, passed, detail in results:
        status = "PASS" if passed else "FAIL"
        print(f"{status}  {name}: {detail}")
        if not passed:
            failed += 1

    if failed:
        print(f"\nconsistency: {failed} check(s) failed", file=sys.stderr)
        return 1

    print("\nconsistency: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
