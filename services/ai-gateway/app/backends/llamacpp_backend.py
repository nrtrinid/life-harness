from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import Settings
from app.slots.types import SlotConfig

DEFAULT_LLAMA_BASE_URL = "http://127.0.0.1:8120"
PLACEHOLDER_CHAT_MODEL = "gpt-3.5-turbo"


class LlamaCppError(Exception):
    """Base error for llama.cpp HTTP client failures."""


class LlamaCppConnectionError(LlamaCppError):
    pass


class LlamaCppHttpError(LlamaCppError):
    def __init__(self, status: int, detail: str = "") -> None:
        self.status = status
        super().__init__(f"llama.cpp HTTP {status}" + (f": {detail}" if detail else ""))


class LlamaCppMalformedResponseError(LlamaCppError):
    pass


class LlamaCppEmptyContentError(LlamaCppError):
    pass


def _normalize_base_url(base_url: str) -> str:
    return base_url.strip().rstrip("/")


def resolve_llamacpp_base_url(slot: SlotConfig, settings: Settings) -> str:
    if settings.llama_base_url_explicit:
        return _normalize_base_url(settings.llama_base_url)

    host = slot.llamacpp.get("host")
    port = slot.llamacpp.get("port")
    if isinstance(host, str) and host.strip() and port is not None:
        return _normalize_base_url(f"http://{host.strip()}:{int(port)}")

    return _normalize_base_url(settings.llama_base_url)


def _normalize_critic_base_url(base_url: str) -> str:
    normalized = _normalize_base_url(base_url)
    if normalized.endswith("/v1"):
        return normalized[: -len("/v1")]
    return normalized


@dataclass
class LlamaCppBackend:
    base_url: str
    timeout_seconds: float
    api_key: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    model: str | None = None

    def generate(self, prompt: str) -> str:
        url = f"{self.base_url}/v1/chat/completions"
        body: dict[str, Any] = {
            "model": self.model or PLACEHOLDER_CHAT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
        }
        if self.max_tokens is not None:
            body["max_tokens"] = self.max_tokens
        if self.temperature is not None:
            body["temperature"] = self.temperature

        payload = json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
                status = getattr(response, "status", 200)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise LlamaCppHttpError(exc.code, detail) from exc
        except urllib.error.URLError as exc:
            raise LlamaCppConnectionError(str(exc.reason)) from exc

        if status < 200 or status >= 300:
            raise LlamaCppHttpError(status, raw[:500])

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LlamaCppMalformedResponseError("response is not valid JSON") from exc

        if not isinstance(parsed, dict):
            raise LlamaCppMalformedResponseError("response root must be an object")

        choices = parsed.get("choices")
        if not isinstance(choices, list) or not choices:
            raise LlamaCppMalformedResponseError("missing choices array")

        first = choices[0]
        if not isinstance(first, dict):
            raise LlamaCppMalformedResponseError("choices[0] must be an object")

        message = first.get("message")
        if not isinstance(message, dict):
            raise LlamaCppMalformedResponseError("choices[0].message must be an object")

        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise LlamaCppEmptyContentError("choices[0].message.content is empty")

        return content.strip()


def build_llamacpp_backend_for_slot(slot: SlotConfig, settings: Settings) -> LlamaCppBackend:
    return LlamaCppBackend(
        base_url=resolve_llamacpp_base_url(slot, settings),
        timeout_seconds=settings.llama_timeout_seconds,
        api_key=settings.llama_api_key,
        max_tokens=slot.max_new_tokens,
        temperature=slot.temperature,
    )


def build_llamacpp_backend_for_critic(settings: Settings) -> LlamaCppBackend:
    return LlamaCppBackend(
        base_url=_normalize_critic_base_url(settings.critic_base_url),
        timeout_seconds=settings.critic_timeout_seconds,
        api_key=settings.llama_api_key,
        max_tokens=512,
        temperature=0.1,
        model=settings.critic_model,
    )
