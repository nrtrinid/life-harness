import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SMOKE_PATH = ROOT / "scripts" / "smoke_openvino.py"


def _load_smoke_module():
    spec = importlib.util.spec_from_file_location("smoke_openvino", SMOKE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def smoke():
    return _load_smoke_module()


def test_parse_args_defaults(smoke):
    args = smoke.parse_args([])
    assert args.base_url == smoke.DEFAULT_BASE_URL
    assert args.fixture == smoke.DEFAULT_FIXTURE
    assert args.timeout == smoke.DEFAULT_TIMEOUT
    assert args.mode == "operator"
    assert args.sensitivity == "S1"
    assert args.write_output is None


def test_parse_args_write_output_default_path(smoke):
    args = smoke.parse_args(["--write-output"])
    assert args.write_output == smoke.DEFAULT_OUTPUT_PATH


def test_parse_args_write_output_custom_path(smoke):
    args = smoke.parse_args(["--write-output", "custom.json"])
    assert args.write_output == "custom.json"


def test_default_fixture_exists(smoke):
    fixture = smoke.resolve_fixture(smoke.DEFAULT_FIXTURE)
    assert fixture.is_file()
