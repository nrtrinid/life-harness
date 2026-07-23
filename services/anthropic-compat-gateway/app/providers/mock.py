from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any, Iterator

from app.models import MessagesRequest, MessagesResponse, Usage
from app.providers.base import (
    MalformedToolOutputError,
    MidStreamProviderError,
    MockPlan,
    PreStreamProviderError,
)
from app.translate import events as ev
from app.translate.tools import (
    NoSafeToolError,
    message_has_tool_result,
    select_safe_tool,
    tool_input_json_chunks,
)

ALLOWED_SCENARIOS = frozenset(
    {
        "auto",
        "text",
        "stream_text",
        "tool_use",
        "tool_continue",
        "malformed_tool",
        "backend_error_pre",
        "backend_error_mid",
        "forced_limit",
        "coding",
        "empty_provider",
    }
)

MODEL_ALIASES = {
    "acgw-mock-text": "text",
    "acgw-mock-stream": "stream_text",
    "acgw-mock-tool": "tool_use",
    "acgw-mock-tool-continue": "tool_continue",
    "acgw-mock-bad-tool": "malformed_tool",
    "acgw-mock-error": "backend_error_pre",
    "acgw-mock-error-mid": "backend_error_mid",
    "acgw-mock-limit": "forced_limit",
    "acgw-mock-coding": "coding",
    "acgw-mock-empty": "empty_provider",
}

PLAIN_TEXT = (
    "Mock assistant reply from anthropic-compat-gateway. "
    "nonce=ACGW_MOCK_NONCE_7f3a91c2"
)
FINAL_AFTER_TOOL = (
    "Mock coding loop complete. The package name is life-harness. No edits were made."
)


def resolve_scenario(model: str, scenario_header: str | None) -> str:
    if scenario_header and scenario_header.strip():
        return scenario_header.strip()
    return MODEL_ALIASES.get(model, "auto")


def _new_message_id() -> str:
    return f"msg_{uuid.uuid4().hex[:20]}"


def _new_tool_id() -> str:
    return f"toolu_{uuid.uuid4().hex[:20]}"


def _estimate_output_tokens(text: str) -> int:
    return max(1, len(text.split()))


class MockProvider:
    name = "mock"

    def __init__(
        self,
        message_id_factory: Callable[[], str] | None = None,
        tool_id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._message_id_factory = message_id_factory or _new_message_id
        self._tool_id_factory = tool_id_factory or _new_tool_id

    def plan(self, request: MessagesRequest, *, scenario: str) -> MockPlan:
        resolved = scenario
        if resolved == "auto":
            if message_has_tool_result(request.messages):
                resolved = "tool_continue"
            elif request.tools:
                resolved = "tool_use"
            else:
                resolved = "text"

        if resolved not in ALLOWED_SCENARIOS:
            raise PreStreamProviderError(
                f"Unknown mock scenario: {resolved!r}",
                error_type="invalid_request_error",
                status_code=400,
            )

        if resolved in ("text", "stream_text"):
            chunks = ev.chunk_text(PLAIN_TEXT)
            return MockPlan(
                kind="text",
                text=PLAIN_TEXT,
                stop_reason="end_turn",
                text_chunks=chunks,
            )

        if resolved == "tool_continue":
            chunks = ev.chunk_text(FINAL_AFTER_TOOL)
            return MockPlan(
                kind="text",
                text=FINAL_AFTER_TOOL,
                stop_reason="end_turn",
                text_chunks=chunks,
            )

        if resolved == "forced_limit":
            raise PreStreamProviderError(
                "Forced limit scenario (acgw-mock-limit)",
                error_type="invalid_request_error",
                status_code=400,
            )

        if resolved == "backend_error_pre":
            raise PreStreamProviderError(
                "Deterministic mock backend failure (pre-stream)",
                error_type="api_error",
                status_code=500,
            )

        if resolved == "empty_provider":
            raise PreStreamProviderError(
                "Mock provider returned empty/malformed result (empty_provider fail-safe)",
                error_type="api_error",
                status_code=500,
            )

        if resolved == "backend_error_mid":
            return MockPlan(
                kind="error_mid",
                error_message="Deterministic mock backend failure (mid-stream)",
                error_type="api_error",
            )

        if resolved == "malformed_tool":
            raise MalformedToolOutputError(
                "Mock provider failed to produce valid tool output"
            )

        if resolved in ("tool_use", "coding"):
            if message_has_tool_result(request.messages):
                chunks = ev.chunk_text(FINAL_AFTER_TOOL)
                return MockPlan(
                    kind="text",
                    text=FINAL_AFTER_TOOL,
                    stop_reason="end_turn",
                    text_chunks=chunks,
                )
            try:
                tool, tool_input = select_safe_tool(request.tools)
            except NoSafeToolError as exc:
                raise PreStreamProviderError(
                    exc.message,
                    error_type="invalid_request_error",
                    status_code=400,
                ) from exc
            tool_id = self._tool_id_factory()
            return MockPlan(
                kind="tool_use",
                stop_reason="tool_use",
                tool_name=tool.name,
                tool_id=tool_id,
                tool_input=tool_input,
                json_chunks=tool_input_json_chunks(tool_input),
            )

        raise PreStreamProviderError(
            f"Unknown mock scenario: {resolved!r}",
            error_type="invalid_request_error",
            status_code=400,
        )

    def complete(self, request: MessagesRequest, *, scenario: str) -> MessagesResponse:
        plan = self.plan(request, scenario=scenario)
        message_id = self._message_id_factory()
        if plan.kind == "error_mid":
            # Non-stream path surfaces mid-stream failures as HTTP errors.
            raise PreStreamProviderError(
                plan.error_message or "mid-stream failure",
                error_type=plan.error_type,
                status_code=500,
            )
        if plan.kind == "text":
            text = plan.text or ""
            return MessagesResponse(
                id=message_id,
                content=[{"type": "text", "text": text}],
                model=request.model,
                stop_reason=plan.stop_reason,
                usage=Usage(
                    input_tokens=max(1, len(request.messages)),
                    output_tokens=_estimate_output_tokens(text),
                ),
            )
        if plan.kind == "tool_use":
            return MessagesResponse(
                id=message_id,
                content=[
                    {
                        "type": "tool_use",
                        "id": plan.tool_id,
                        "name": plan.tool_name,
                        "input": plan.tool_input or {},
                    }
                ],
                model=request.model,
                stop_reason="tool_use",
                usage=Usage(
                    input_tokens=max(1, len(request.messages)),
                    output_tokens=8,
                ),
            )
        raise PreStreamProviderError(
            f"Unsupported plan kind for complete(): {plan.kind}",
            status_code=500,
        )

    def stream_events(
        self, request: MessagesRequest, *, scenario: str
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        message_id = self._message_id_factory()
        input_tokens = max(1, len(request.messages))

        # Emit message_start first for mid-stream error scenarios after planning.
        plan = self.plan(request, scenario=scenario)

        yield ev.message_start_event(
            message_id=message_id,
            model=request.model,
            input_tokens=input_tokens,
        )

        if plan.kind == "error_mid":
            raise MidStreamProviderError(
                plan.error_message or "mid-stream failure",
                error_type=plan.error_type,
            )

        if plan.kind == "text":
            yield ev.content_block_start_text(index=0)
            for chunk in plan.text_chunks:
                yield ev.content_block_delta_text(index=0, text=chunk)
            yield ev.content_block_stop(index=0)
            output_tokens = _estimate_output_tokens(plan.text or "")
            yield ev.message_delta(stop_reason=plan.stop_reason, output_tokens=output_tokens)
            yield ev.message_stop()
            return

        if plan.kind == "tool_use":
            yield ev.content_block_start_tool_use(
                index=0,
                tool_id=plan.tool_id or self._tool_id_factory(),
                name=plan.tool_name or "Read",
            )
            for partial in plan.json_chunks:
                yield ev.content_block_delta_input_json(index=0, partial_json=partial)
            yield ev.content_block_stop(index=0)
            yield ev.message_delta(stop_reason="tool_use", output_tokens=8)
            yield ev.message_stop()
            return

        raise MidStreamProviderError(f"Unsupported plan kind for stream: {plan.kind}")
