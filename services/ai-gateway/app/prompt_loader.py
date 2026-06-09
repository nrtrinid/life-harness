from pathlib import Path

from app.models import AnalysisMode, SensitivityLevel

_PROMPT_PATH = Path(__file__).parent / "prompts" / "transcript_analysis.md"


def load_prompt_template() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def build_analysis_prompt(
    *,
    mode: AnalysisMode,
    sensitivity: SensitivityLevel,
    transcript: str,
) -> str:
    template = load_prompt_template()
    return (
        template.replace("{mode}", mode.value)
        .replace("{sensitivity}", sensitivity.value)
        .replace("{transcript}", transcript)
    )
