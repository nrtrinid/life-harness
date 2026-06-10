import pytest
from fastapi.testclient import TestClient

from app.eval_runner import DEFAULT_CONTEXT_FIXTURE, iter_eval_cases, run_eval_case
from app.main import app

client = TestClient(app)
DEFAULT_CONTEXT = __import__("json").loads(
    DEFAULT_CONTEXT_FIXTURE.read_text(encoding="utf-8")
)


@pytest.mark.parametrize(
    "file_name,case_name,case",
    iter_eval_cases(),
    ids=[f"{file_name}::{case_name}" for file_name, case_name, _ in iter_eval_cases()],
)
def test_thread_eval_fixture(file_name: str, case_name: str, case: dict):
    del file_name, case_name
    ok, detail = run_eval_case(client, case, DEFAULT_CONTEXT)
    assert ok, detail
