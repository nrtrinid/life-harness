from __future__ import annotations

import os
import urllib.error
import urllib.request
from contextlib import contextmanager
from typing import Iterator

from app.backends.llamacpp_backend import build_llamacpp_backend_for_critic
from app.bench_models import BenchTarget
from app.config import Settings


def probe_critic_server(settings: Settings, *, timeout: float = 3.0) -> bool:
    root = build_llamacpp_backend_for_critic(settings).base_url
    for path in ("/health", "/v1/models"):
        url = f"{root}{path}"
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                if 200 <= response.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            continue
    return False


def check_real_phi4_critic_available(
    settings: Settings,
    *,
    probe_timeout: float = 3.0,
) -> tuple[bool, str | None]:
    if not settings.real_model_bench_enabled:
        return False, "SCOUT_REAL_MODEL_BENCH not enabled"

    if settings.critic_runtime != "llamacpp":
        return False, "SCOUT_CRITIC_RUNTIME must be llamacpp"

    if not settings.critic_model.strip():
        return False, "SCOUT_CRITIC_MODEL must be set"

    root = build_llamacpp_backend_for_critic(settings).base_url
    if not probe_critic_server(settings, timeout=probe_timeout):
        return False, f"critic server unreachable at {root}"

    return True, None


@contextmanager
def bench_target_runtime(target: BenchTarget) -> Iterator[None]:
    if target.target_id == "real_phi4_with_critic":
        overrides = {
            "SCOUT_CRITIC_RUNTIME": "llamacpp",
            "SCOUT_REAL_MODEL_BENCH": "1",
        }
        with _patch_environ(overrides):
            yield
        return

    if target.target_id == "mock_with_critic":
        overrides = {"SCOUT_CRITIC_RUNTIME": "mock"}
        with _patch_environ(overrides):
            yield
        return

    yield


@contextmanager
def _patch_environ(overrides: dict[str, str]) -> Iterator[None]:
    previous = {key: os.environ.get(key) for key in overrides}
    try:
        os.environ.update(overrides)
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
