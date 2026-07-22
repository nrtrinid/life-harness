"""Pipeline generation ownership for a single OpenVinoBackend instance.

Invariant: only one active ``pipeline.generate`` call per physical backend.
The worker thread owns the lock for its entire lifetime; HTTP timeouts and
client disconnects request cancellation but must not release ownership early.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future
from typing import Callable, TypeVar

from app.providers.base import ProviderNotReadyError

T = TypeVar("T")


class PipelineOwnership:
    """Non-reentrant generation ownership with worker-lifetime hold."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._owner_alive = False
        self._owner_id: int | None = None
        self._guard = threading.Lock()

    @property
    def busy(self) -> bool:
        with self._guard:
            return self._owner_alive

    def run(
        self,
        *,
        worker: Callable[[], T],
        timeout_seconds: float | None,
        cancel_event: threading.Event | None = None,
        busy_message: str = "OpenVINO pipeline is busy with another generation",
    ) -> T:
        """Run ``worker`` under exclusive ownership.

        On timeout: request cancel (if provided) and raise without releasing
        ownership — the worker releases the lock when it exits.
        """
        if not self._lock.acquire(blocking=False):
            raise ProviderNotReadyError(busy_message)

        with self._guard:
            self._owner_alive = True
            self._owner_id = threading.get_ident()

        result: dict[str, T] = {}
        error: dict[str, BaseException] = {}
        finished = threading.Event()

        def _wrapped() -> None:
            try:
                result["value"] = worker()
            except BaseException as exc:  # noqa: BLE001 — propagate to waiter
                error["exc"] = exc
            finally:
                with self._guard:
                    self._owner_alive = False
                    self._owner_id = None
                self._lock.release()
                finished.set()

        thread = threading.Thread(target=_wrapped, name="ov-pipeline-worker", daemon=True)
        thread.start()

        wait_timeout = None if timeout_seconds is None else float(timeout_seconds)
        if not finished.wait(timeout=wait_timeout):
            if cancel_event is not None:
                cancel_event.set()
            # Ownership retained until worker exits.
            raise ProviderNotReadyError(
                f"Inference timed out after {timeout_seconds}s "
                "(pipeline remains busy until the worker exits)"
            )

        if "exc" in error:
            raise error["exc"]
        return result["value"]

    def run_streaming_worker(
        self,
        *,
        worker: Callable[[], None],
        busy_message: str = "OpenVINO pipeline is busy with another generation",
    ) -> Future[None]:
        """Start a streaming worker that holds ownership until it finishes.

        Returns a Future that completes when the worker exits (success or error).
        Callers must not start another generation while ``busy`` is True.
        """
        if not self._lock.acquire(blocking=False):
            raise ProviderNotReadyError(busy_message)

        with self._guard:
            self._owner_alive = True
            self._owner_id = threading.get_ident()

        future: Future[None] = Future()

        def _wrapped() -> None:
            try:
                worker()
            except BaseException as exc:  # noqa: BLE001
                future.set_exception(exc)
            else:
                if not future.done():
                    future.set_result(None)
            finally:
                with self._guard:
                    self._owner_alive = False
                    self._owner_id = None
                self._lock.release()

        thread = threading.Thread(
            target=_wrapped, name="ov-pipeline-stream-worker", daemon=True
        )
        thread.start()
        return future
