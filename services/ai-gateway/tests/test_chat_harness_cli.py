import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHAT_PATH = ROOT / "scripts" / "chat_harness.py"


def _load_chat_module():
    spec = importlib.util.spec_from_file_location("chat_harness", CHAT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def chat_cli():
    return _load_chat_module()


def test_parse_args_defaults(chat_cli):
    args = chat_cli.parse_args([])
    assert args.base_url == chat_cli.DEFAULT_BASE_URL
    assert args.context == chat_cli.DEFAULT_CONTEXT
    assert args.message == chat_cli.DEFAULT_MESSAGE
    assert args.mode == "general"
    assert args.sensitivity == "S1"
    assert args.timeout == chat_cli.DEFAULT_TIMEOUT
    assert args.history is None


def test_parse_args_custom_message(chat_cli):
    args = chat_cli.parse_args(["--message", "What should I build next?"])
    assert args.message == "What should I build next?"


def test_default_context_fixture_exists(chat_cli):
    path = chat_cli.resolve_path(chat_cli.DEFAULT_CONTEXT)
    assert path.is_file()
