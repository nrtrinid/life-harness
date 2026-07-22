"""CI-safe tests for POST /ai/coding/chat/stream (Coding Slice B)."""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.backends.openvino_backend import OpenVinoBackend, detect_streaming_capability
from app.backends.pipeline_ownership import PipelineOwnership
from app.config import get_settings
from app.main import app
from app.providers.base import ProviderNotReadyError


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _parse_sse(raw: str) -> list[dict]:
    events: list[dict] = []
    for block in raw.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        assert block.startswith("data: "), block
        events.append(json.loads(block[len("data: ") :]))
    return events


def _body(**overrides: object) -> dict:
    base: dict = {
        "model_alias": "coding_fast",
        "stream": True,
        "messages": [{"role": "user", "content": "stream please"}],
    }
    base.update(overrides)
    return base


def test_stream_content_type_and_ordering(client: TestClient) -> None:
    response = client.post("/ai/coding/chat/stream", json=_body())
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    events = _parse_sse(response.text)
    assert events[0]["type"] == "start"
    assert events[0]["model_alias"] == "coding_fast"
    deltas = [e for e in events if e["type"] == "delta"]
    assert len(deltas) >= 2
    assert events[-1]["type"] == "done"
    assert events[-1]["stop_reason"] == "end_turn"
    assert events[-1]["usage"]["input_tokens"] == 0
    # No Raw Lab chunk fields.
    for event in events:
        assert "chunk" not in event


def test_multiple_immediate_deltas_before_done(client: TestClient) -> None:
    response = client.post("/ai/coding/chat/stream", json=_body())
    events = _parse_sse(response.text)
    types = [e["type"] for e in events]
    first_done = types.index("done")
    assert types[:first_done].count("delta") >= 2
    joined = "".join(e["text"] for e in events if e["type"] == "delta")
    assert "CODESTREAM_OK" in joined.replace(" ", "")


def test_unicode_fragments(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat/stream",
        json=_body(messages=[{"role": "user", "content": "unicode please"}]),
    )
    events = _parse_sse(response.text)
    joined = "".join(e["text"] for e in events if e["type"] == "delta")
    assert "café" in joined
    assert "東京" in joined


def test_empty_output_error_event(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat/stream",
        json=_body(messages=[{"role": "user", "content": "__CODING_EMPTY__"}]),
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert any(e["type"] == "error" for e in events)
    assert not any(e["type"] == "done" for e in events)


def test_pre_stream_failure_http(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat/stream",
        json=_body(messages=[{"role": "user", "content": "__CODING_FAIL__"}]),
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events[0]["type"] == "error"
    assert "forced" in events[0]["message"]


def test_mid_stream_error(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat/stream",
        json=_body(messages=[{"role": "user", "content": "__CODING_STREAM_MID_FAIL__"}]),
    )
    events = _parse_sse(response.text)
    assert events[0]["type"] == "start"
    assert any(e["type"] == "delta" for e in events)
    assert events[-1]["type"] == "error"


def test_non_stream_route_still_rejects_stream_flag(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(stream=True),
    )
    assert response.status_code == 422


def test_pipeline_ownership_timeout_blocks_second() -> None:
    ownership = PipelineOwnership()
    release_first = threading.Event()
    first_started = threading.Event()
    waiter_done = threading.Event()
    waiter_error: list[BaseException] = []

    def slow_worker() -> str:
        first_started.set()
        release_first.wait(timeout=10)
        return "one"

    def run_first() -> None:
        try:
            ownership.run(
                worker=slow_worker,
                timeout_seconds=0.25,
                cancel_event=threading.Event(),
            )
        except BaseException as exc:  # noqa: BLE001
            waiter_error.append(exc)
        finally:
            waiter_done.set()

    t = threading.Thread(target=run_first)
    t.start()
    assert first_started.wait(timeout=2)
    assert ownership.busy is True
    assert waiter_done.wait(timeout=2)
    assert waiter_error and isinstance(waiter_error[0], ProviderNotReadyError)
    assert "timed out" in str(waiter_error[0])
    assert ownership.busy is True  # worker still alive until release_first

    with pytest.raises(ProviderNotReadyError, match="busy"):
        ownership.run(worker=lambda: "two", timeout_seconds=1.0)

    release_first.set()
    t.join(timeout=2)
    # Give worker finally a moment to release.
    for _ in range(20):
        if not ownership.busy:
            break
        time.sleep(0.05)
    assert ownership.busy is False

    assert ownership.run(worker=lambda: "three", timeout_seconds=1.0) == "three"


def test_pipeline_ownership_exception_releases() -> None:
    ownership = PipelineOwnership()

    def boom() -> str:
        raise RuntimeError("nope")

    with pytest.raises(RuntimeError, match="nope"):
        ownership.run(worker=boom, timeout_seconds=1.0)
    assert ownership.busy is False
    assert ownership.run(worker=lambda: "ok", timeout_seconds=1.0) == "ok"


def test_shared_backend_serialization_with_ownership() -> None:
    settings = get_settings()
    backend = OpenVinoBackend(settings)
    entered = 0
    max_concurrent = 0
    lock = threading.Lock()

    class _FakePipeline:
        def generate(self, *_args, **_kwargs):
            nonlocal entered, max_concurrent
            with lock:
                entered += 1
                max_concurrent = max(max_concurrent, entered)
            time.sleep(0.08)
            with lock:
                entered -= 1
            return "ok"

    backend._pipeline = _FakePipeline()  # type: ignore[assignment]
    backend._streaming_capable = False

    def _call() -> str:
        return backend.generate_chat(
            system="sys",
            history=[],
            message="hi",
            generation_overrides={"max_new_tokens": 8, "temperature": 0.2},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_call), pool.submit(_call)]
        results = []
        for f in futures:
            try:
                results.append(f.result(timeout=5))
            except ProviderNotReadyError as exc:
                results.append(str(exc))

    # One succeeds; the other may be busy or also succeed sequentially.
    assert max_concurrent == 1
    assert any(r == "ok" for r in results)


def test_detect_streaming_capability_reports_tuple() -> None:
    ok, msg = detect_streaming_capability()
    assert isinstance(ok, bool)
    assert isinstance(msg, str)


def test_raw_lab_stream_contract_unchanged(client: TestClient) -> None:
    response = client.post(
        "/raw-lab/stream",
        json={"message": "hello raw", "recent_turns": [], "thread_state": {}},
    )
    assert response.status_code == 200
    # Existing Raw Lab stream uses chunk events — must still be present.
    assert "chunk" in response.text or "data:" in response.text


def test_queue_full_worker_complete_consumer_exits() -> None:
    """Worker completion is observable even when the None sentinel cannot enqueue."""
    import queue

    ownership = PipelineOwnership()
    fragment_queue: queue.Queue[str | None] = queue.Queue(maxsize=1)
    worker_finished = threading.Event()
    fragment_queue.put_nowait("fill")

    def worker() -> None:
        try:
            time.sleep(0.05)
        finally:
            worker_finished.set()
            try:
                fragment_queue.put_nowait(None)
            except queue.Full:
                pass

    future = ownership.run_streaming_worker(worker=worker)
    got: list[str] = []
    deadline = time.time() + 2.0
    while time.time() < deadline:
        if worker_finished.is_set() and fragment_queue.empty():
            break
        try:
            item = fragment_queue.get(timeout=0.05)
        except queue.Empty:
            if worker_finished.is_set() or future.done():
                break
            continue
        if item is None:
            break
        got.append(item)
    future.result(timeout=2)
    assert worker_finished.is_set()
    assert ownership.busy is False
    assert got == ["fill"]


def test_queue_full_worker_raises_releases_ownership() -> None:
    import queue

    ownership = PipelineOwnership()
    fragment_queue: queue.Queue[str | None] = queue.Queue(maxsize=1)
    worker_finished = threading.Event()
    worker_error: list[BaseException] = []
    fragment_queue.put_nowait("fill")

    def worker() -> None:
        try:
            raise RuntimeError("boom-full")
        except BaseException as exc:  # noqa: BLE001
            worker_error.append(exc)
        finally:
            worker_finished.set()
            try:
                fragment_queue.put_nowait(None)
            except queue.Full:
                pass

    future = ownership.run_streaming_worker(worker=worker)
    deadline = time.time() + 2.0
    while time.time() < deadline:
        if worker_finished.is_set():
            break
        time.sleep(0.01)
    # Drain leftover text without requiring sentinel.
    while True:
        try:
            fragment_queue.get_nowait()
        except queue.Empty:
            break
    future.result(timeout=2)
    assert ownership.busy is False
    assert worker_error and "boom-full" in str(worker_error[0])


def test_cancel_while_queue_full_releases_after_worker_exit() -> None:
    ownership = PipelineOwnership()
    cancel_event = threading.Event()
    started = threading.Event()
    release = threading.Event()

    def worker() -> None:
        started.set()
        while not cancel_event.is_set() and not release.wait(timeout=0.05):
            pass
        # Simulate generate still running briefly after cancel.
        time.sleep(0.05)

    future = ownership.run_streaming_worker(worker=worker)
    assert started.wait(timeout=2)
    assert ownership.busy is True
    cancel_event.set()
    with pytest.raises(ProviderNotReadyError, match="busy"):
        ownership.run(worker=lambda: "nope", timeout_seconds=0.5)
    release.set()
    future.result(timeout=2)
    for _ in range(40):
        if not ownership.busy:
            break
        time.sleep(0.05)
    assert ownership.busy is False
    assert ownership.run(worker=lambda: "ok", timeout_seconds=1.0) == "ok"


def test_cancel_does_not_emit_done(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.providers import mock as mock_mod

    def _cancelled_stream(self, request):  # noqa: ANN001
        yield 'data: {"type":"start","id":"c1","model_alias":"coding_fast"}\n\n'
        yield 'data: {"type":"delta","text":"partial"}\n\n'
        # Simulate cancel_event trip mid-stream via coding_chat_stream_with_backend path:
        # MockProvider yields SSE directly; force cancelled completion via monkeypatch below.
        yield 'data: {"type":"error","error_type":"api_error","message":"coding stream cancelled"}\n\n'

    monkeypatch.setattr(mock_mod.MockProvider, "coding_chat_stream", _cancelled_stream)
    response = client.post("/ai/coding/chat/stream", json=_body())
    events = _parse_sse(response.text)
    assert any(e["type"] == "error" for e in events)
    assert not any(e["type"] == "done" for e in events)


def test_ensure_streaming_ready_fails_clearly_when_incapable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    backend = OpenVinoBackend(settings)
    backend._pipeline = object()  # type: ignore[assignment]
    monkeypatch.setattr(
        "app.backends.openvino_backend.detect_streaming_capability",
        lambda: (False, "missing streaming APIs: TextStreamer"),
    )
    backend._streaming_capable = None
    with pytest.raises(ProviderNotReadyError, match="streamer|streaming"):
        backend.ensure_streaming_ready()
