import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.eval_runner import SYNTHESIS_EVALS_DIR, iter_eval_cases, run_eval_case
from app.main import app
from app.synthesis_jobs import clear_synthesis_jobs_for_tests

os.environ.setdefault("SCOUT_PROVIDER", "mock")

DEFAULT_CONTEXT = json.loads(
    (
        Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
    ).read_text(encoding="utf-8")
)


@pytest.fixture(autouse=True)
def _reset_synthesis_eval_state():
    clear_synthesis_jobs_for_tests()
    yield
    clear_synthesis_jobs_for_tests()


SYNTHESIS_CASES = [
    (path, name, case)
    for path, name, case in iter_eval_cases(SYNTHESIS_EVALS_DIR)
    if case.get("skip_phase") != "0"
    and case.get("endpoint") != "overnight-brain"
    and "phase_1b" not in case.get("tags", [])
]


@pytest.mark.parametrize(
    "file_name,case_name,case",
    SYNTHESIS_CASES,
    ids=[f"{file_name}::{case_name}" for file_name, case_name, _ in SYNTHESIS_CASES],
)
def test_synthesis_eval_fixture(file_name: str, case_name: str, case: dict):
    del file_name, case_name
    ok, detail = run_eval_case(TestClient(app), case, DEFAULT_CONTEXT)
    assert ok, detail
