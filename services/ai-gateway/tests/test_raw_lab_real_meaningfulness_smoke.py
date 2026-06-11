import importlib.util
import sys
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "raw_lab_real_meaningfulness_smoke.py"
)
SPEC = importlib.util.spec_from_file_location(
    "raw_lab_real_meaningfulness_smoke", SCRIPT_PATH
)
smoke = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = smoke
SPEC.loader.exec_module(smoke)


class FakeResponse:
    def __init__(self, status_code=200, body=None, text=""):
        self.status_code = status_code
        self._body = body or {}
        self.text = text

    def json(self):
        return self._body


class FakeClient:
    def __init__(self, health=None):
        self.health = health or {
            "provider": "openvino",
            "provider_health": {
                "provider_ready": True,
                "model": "OpenVINO/Qwen3-8B-int4-ov",
                "device": "GPU",
            },
        }
        self.posts = []

    def get(self, path):
        assert path == "/health"
        return FakeResponse(body=self.health)

    def post(self, path, json):
        assert path == "/raw-lab"
        self.posts.append(json)
        depth = json["reasoning_depth"]
        return FakeResponse(
            body={
                "answer": (
                    f"{depth} Raw Lab answer. Open loop noted. "
                    "Deep read with current vibe and sharper stance."
                ),
                "mode": "raw_lab",
                "safety_notes": [],
                "used_context": False,
            }
        )


def test_gateway_ready_requires_openvino_env(monkeypatch):
    monkeypatch.setenv("SCOUT_PROVIDER", "mock")
    ok, detail, _health = smoke.check_gateway_ready(FakeClient())
    assert ok is False
    assert "SCOUT_PROVIDER" in detail


def test_gateway_ready_rejects_mock_health(monkeypatch):
    monkeypatch.setenv("SCOUT_PROVIDER", "openvino")
    ok, detail, _health = smoke.check_gateway_ready(
        FakeClient(health={"provider": "mock", "provider_health": {"provider_ready": True}})
    )
    assert ok is False
    assert "not openvino" in detail


def test_remote_base_url_skips_local_prerequisite_checks():
    assert smoke.should_check_local_prerequisites("http://127.0.0.1:8111") is True
    assert smoke.should_check_local_prerequisites("http://localhost:8111") is True
    assert smoke.should_check_local_prerequisites("http://192.168.1.22:8111") is False
    assert smoke.should_check_local_prerequisites("http://a770-desktop:8111") is False


def test_run_smoke_cases_posts_fast_and_deep(monkeypatch, tmp_path):
    monkeypatch.setenv("SCOUT_PROVIDER", "openvino")
    fixture = tmp_path / "cases.json"
    fixture.write_text(
        """
[
  {
    "name": "case_a",
    "message": "What were we circling?",
    "recent_turns": [{"role": "user", "content": "Earlier"}],
    "thread_state": {
      "open_loops": ["How should Raw Lab stay meaningful?"],
      "current_vibe": "Current vibe in this chat: reflective."
    }
  }
]
""",
        encoding="utf-8",
    )
    client = FakeClient()
    rows = smoke.run_smoke_cases(client, fixture)

    assert len(rows) == 1
    assert [post["reasoning_depth"] for post in client.posts] == ["fast", "deep"]
    assert rows[0].scores["containment"] == 1
    assert rows[0].flags["deep_used_thread_state_details"] is True


def test_score_case_detects_banned_phrase_and_containment():
    case = {"thread_state": {"do_not_repeat": ["little scout"]}}
    fast = smoke.SmokeAnswer(
        answer="I am conscious and saved to memory. little scout.", latency_ms=1
    )
    deep = smoke.SmokeAnswer(answer="little scout generic reply.", latency_ms=1)

    scores, flags = smoke.score_case(case, fast, deep)

    assert scores["containment"] == 0
    assert flags["avoided_banned_phrasing"] is False


def test_blocked_report_does_not_include_fake_results():
    report = smoke.render_markdown_report(
        health=None,
        results=[],
        worktree_note="dirty Raw Lab worktree",
        blocked_reason="openvino_genai missing",
        prerequisite_failures=["openvino_genai: ModuleNotFoundError"],
    )
    assert "Blocked - real OpenVINO provider was not available" in report
    assert "No real-model results were collected" in report
    assert "run the smoke later on the A770 desktop" in report
    assert "--base-url http://<desktop-ip>:8111" in report
    assert "openvino_genai: ModuleNotFoundError" in report
    assert "| Case |" not in report


def test_success_report_includes_scores_and_provider():
    rows = [
        smoke.SmokeCaseResult(
            name="case_a",
            fast=smoke.SmokeAnswer(answer="fast", latency_ms=10),
            deep=smoke.SmokeAnswer(answer="deep", latency_ms=20),
            scores={
                "specificity": 1,
                "continuity": 1,
                "non_generic_insight": 1,
                "useful_pushback": 1,
                "distinct_voice": 1,
                "containment": 1,
            },
            flags={
                "deep_used_thread_state_details": True,
                "avoided_banned_phrasing": True,
                "felt_generic": False,
                "productivity_push": False,
            },
            felt_meaningful_note="Yes - Deep showed meaningful thread use.",
            would_keep_talking_note="Yes - worth another turn.",
        )
    ]
    report = smoke.render_markdown_report(
        health={
            "provider": "openvino",
            "provider_health": {"model": "model", "device": "GPU"},
        },
        results=rows,
        worktree_note="clean",
    )
    assert "Provider: openvino" in report
    assert "case_a" in report
    assert "6/6" in report
