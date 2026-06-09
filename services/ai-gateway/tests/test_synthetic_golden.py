import json
from pathlib import Path

from app.models import AnalysisMode, AnalyzeTranscriptRequest, SensitivityLevel
from app.providers.mock import MockProvider

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "synthetic_transcript.txt"
GOLDEN = ROOT / "docs" / "sample-outputs" / "mock_synthetic_analysis.json"


def _serialize(data: dict) -> str:
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def test_synthetic_fixture_matches_golden_mock_output():
    text = FIXTURE.read_text(encoding="utf-8")
    result = MockProvider().analyze(
        AnalyzeTranscriptRequest(
            text=text,
            mode=AnalysisMode.operator,
            sensitivity=SensitivityLevel.S1,
        )
    )
    actual = _serialize(result.model_dump(mode="json"))
    expected = GOLDEN.read_text(encoding="utf-8")
    assert actual == expected
