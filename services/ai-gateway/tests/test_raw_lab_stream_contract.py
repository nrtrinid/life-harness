import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _raw_lab_payload(**overrides):
    payload = {
        "message": "Say hello in one short sentence.",
        "recent_turns": [],
        "thread_state": {},
    }
    payload.update(overrides)
    return payload


def test_raw_lab_stream_returns_sse_chunks():
    response = client.post("/raw-lab/stream", json=_raw_lab_payload())
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")

    events = []
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        events.append(json.loads(line[5:].strip()))

    assert any("chunk" in event for event in events)
    done = next(event for event in events if event.get("done") is True)
    assert isinstance(done.get("answer"), str)
    assert done.get("mode") == "raw_lab"
    assert done.get("used_context") is False
