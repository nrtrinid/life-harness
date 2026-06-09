import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ASK_PATH = ROOT / "scripts" / "ask_harness.py"


def _load_ask_module():
    spec = importlib.util.spec_from_file_location("ask_harness", ASK_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def ask_cli():
    return _load_ask_module()


def test_parse_args_defaults(ask_cli):
    args = ask_cli.parse_args([])
    assert args.base_url == ask_cli.DEFAULT_BASE_URL
    assert args.context == ask_cli.DEFAULT_CONTEXT
    assert args.question == ask_cli.DEFAULT_QUESTION
    assert args.mode == "operator"
    assert args.sensitivity == "S1"
    assert args.timeout == ask_cli.DEFAULT_TIMEOUT


def test_parse_args_custom_question(ask_cli):
    args = ask_cli.parse_args(["--question", "What should I build next?"])
    assert args.question == "What should I build next?"


def test_default_context_fixture_exists(ask_cli):
    path = ask_cli.resolve_path(ask_cli.DEFAULT_CONTEXT)
    assert path.is_file()
