import os

import pytest
from fastapi.testclient import TestClient

from app.eval_runner import DEFAULT_CONTEXT_FIXTURE, iter_eval_cases, run_eval_case
from app.main import app

os.environ.setdefault("SCOUT_PROVIDER", "mock")

client = TestClient(app)
DEFAULT_CONTEXT = __import__("json").loads(
    DEFAULT_CONTEXT_FIXTURE.read_text(encoding="utf-8")
)

THREAD_EVAL_CASES = [
    (file_name, case_name, case)
    for file_name, case_name, case in iter_eval_cases()
    if "manual_only" not in case.get("tags", [])
]


@pytest.mark.parametrize(
    "file_name,case_name,case",
    THREAD_EVAL_CASES,
    ids=[f"{file_name}::{case_name}" for file_name, case_name, _ in THREAD_EVAL_CASES],
)
def test_thread_eval_fixture(file_name: str, case_name: str, case: dict):
    del file_name, case_name
    ok, detail = run_eval_case(client, case, DEFAULT_CONTEXT)
    assert ok, detail
