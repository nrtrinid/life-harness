from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, Iterator

from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth import require_auth
from app.config import Settings, get_settings
from app.input_budget import input_char_count
from app.logging_util import Timer, log_request_meta, new_request_id
from app.models import MessagesRequest, anthropic_error
from app.providers.base import (
    MalformedToolOutputError,
    MidStreamProviderError,
    PreStreamProviderError,
)
from app.providers.factory import ProviderConfigError, create_provider
from app.providers.mock import resolve_scenario
from app.translate.events import error_event, format_sse

logger = logging.getLogger("acgw")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

_AUTH_REQUIRED_MSG = (
    "ACGW_AUTH_TOKEN is required (or set ACGW_ALLOW_NO_AUTH=1 for local tests only)"
)


def _http_anthropic_error(status_code: int, *, type_: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=anthropic_error(type_=type_, message=message),
    )


def _validate_auth_settings(resolved: Settings) -> None:
    if resolved.allow_no_auth and not resolved.auth_token.strip():
        logger.warning("ACGW_ALLOW_NO_AUTH=1: authentication DISABLED")
        return
    if not resolved.allow_no_auth and not resolved.auth_token.strip():
        logger.error("acgw_startup_failed: %s", _AUTH_REQUIRED_MSG)
        raise RuntimeError(
            f"anthropic-compat-gateway startup failed: {_AUTH_REQUIRED_MSG}"
        )


def build_app(settings: Settings | None = None) -> FastAPI:
    """Create FastAPI app; validates provider config during lifespan startup."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        resolved = settings or get_settings()
        _validate_auth_settings(resolved)
        try:
            provider = create_provider(resolved)
        except ProviderConfigError as exc:
            logger.error("acgw_startup_failed: %s", exc.message)
            raise RuntimeError(
                f"anthropic-compat-gateway startup failed: {exc.message}"
            ) from exc
        app.state.settings = resolved
        app.state.provider = provider
        app.state.request_count = 0
        logger.info(
            "acgw_started provider=%s host=%s port=%s max_input_chars=%s",
            resolved.provider,
            resolved.host,
            resolved.port,
            resolved.max_input_chars,
        )
        try:
            yield
        finally:
            close = getattr(provider, "close", None)
            if callable(close):
                close()

    application = FastAPI(
        title="Anthropic Compat Gateway",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        _ = request
        errors = exc.errors()
        if errors:
            first = errors[0]
            loc = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
            msg = first.get("msg", "Invalid request")
            message = f"{loc}: {msg}" if loc else str(msg)
        else:
            message = "Invalid request"
        return _http_anthropic_error(
            400, type_="invalid_request_error", message=message
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        _ = request
        # FastAPI registers HTTPException handlers first via MRO; this is a
        # defensive fallback if one ever reaches the catch-all.
        if isinstance(exc, (HTTPException, StarletteHTTPException)):
            detail = exc.detail
            if isinstance(detail, dict):
                return JSONResponse(status_code=exc.status_code, content=detail)
            return JSONResponse(
                status_code=exc.status_code,
                content=anthropic_error(
                    type_="api_error",
                    message=str(detail),
                ),
            )
        logger.exception("acgw_unhandled_error: %s", type(exc).__name__)
        return _http_anthropic_error(
            500,
            type_="api_error",
            message="Internal server error",
        )

    @application.get("/health")
    def health() -> dict[str, Any]:
        """Unauthenticated liveness/readiness probe."""
        cfg: Settings = application.state.settings
        return {
            "ok": True,
            "provider": cfg.provider,
            "ready": True,
            "port": cfg.port,
        }

    @application.post("/v1/messages")
    def messages(
        body: MessagesRequest,
        raw_request: Request,
        beta: str | None = Query(default=None),
        authorization: str | None = Header(default=None),
        x_api_key: str | None = Header(default=None, alias="x-api-key"),
        x_acgw_scenario: str | None = Header(default=None, alias="x-acgw-scenario"),
    ) -> Response:
        # beta query accepted and ignored (Slice 1 tolerance, not pass-through).
        _ = beta
        _ = raw_request

        cfg: Settings = application.state.settings
        provider = application.state.provider
        request_id = new_request_id()
        timer = Timer()
        application.state.request_count = int(
            getattr(application.state, "request_count", 0)
        ) + 1

        try:
            require_auth(cfg, authorization=authorization, x_api_key=x_api_key)
        except HTTPException as exc:
            detail = (
                exc.detail
                if isinstance(exc.detail, dict)
                else anthropic_error(
                    type_="authentication_error",
                    message=str(exc.detail),
                )
            )
            log_request_meta(
                cfg,
                request_id=request_id,
                model=body.model,
                scenario="auth",
                stream=body.stream,
                input_chars=0,
                message_count=len(body.messages),
                tool_count=len(body.tools or []),
                status=401,
                extra={"elapsed_ms": timer.ms()},
            )
            return JSONResponse(status_code=401, content=detail)

        input_chars = input_char_count(body)
        # Local provider ignores mock scenario headers; fixed scenario label only.
        if getattr(provider, "name", None) == "local_ai_gateway":
            scenario = "local"
        else:
            scenario = resolve_scenario(body.model, x_acgw_scenario)

        if input_chars > cfg.max_input_chars:
            log_request_meta(
                cfg,
                request_id=request_id,
                model=body.model,
                scenario=scenario,
                stream=body.stream,
                input_chars=input_chars,
                message_count=len(body.messages),
                tool_count=len(body.tools or []),
                status=400,
                extra={"elapsed_ms": timer.ms(), "reason": "max_input_chars"},
            )
            return _http_anthropic_error(
                400,
                type_="invalid_request_error",
                message=(
                    f"Input length {input_chars} exceeds ACGW_MAX_INPUT_CHARS="
                    f"{cfg.max_input_chars}"
                ),
            )

        # Pre-stream planning so config/provider failures stay HTTP errors.
        try:
            provider.plan(body, scenario=scenario)
        except MalformedToolOutputError as exc:
            log_request_meta(
                cfg,
                request_id=request_id,
                model=body.model,
                scenario=scenario,
                stream=body.stream,
                input_chars=input_chars,
                message_count=len(body.messages),
                tool_count=len(body.tools or []),
                status=500,
                extra={"elapsed_ms": timer.ms()},
            )
            return _http_anthropic_error(500, type_=exc.error_type, message=exc.message)
        except PreStreamProviderError as exc:
            log_request_meta(
                cfg,
                request_id=request_id,
                model=body.model,
                scenario=scenario,
                stream=body.stream,
                input_chars=input_chars,
                message_count=len(body.messages),
                tool_count=len(body.tools or []),
                status=exc.status_code,
                extra={"elapsed_ms": timer.ms()},
            )
            return _http_anthropic_error(
                exc.status_code, type_=exc.error_type, message=exc.message
            )

        if not body.stream:
            try:
                response = provider.complete(body, scenario=scenario)
            except PreStreamProviderError as exc:
                log_request_meta(
                    cfg,
                    request_id=request_id,
                    model=body.model,
                    scenario=scenario,
                    stream=False,
                    input_chars=input_chars,
                    message_count=len(body.messages),
                    tool_count=len(body.tools or []),
                    status=exc.status_code,
                    extra={"elapsed_ms": timer.ms()},
                )
                return _http_anthropic_error(
                    exc.status_code, type_=exc.error_type, message=exc.message
                )
            log_request_meta(
                cfg,
                request_id=request_id,
                model=body.model,
                scenario=scenario,
                stream=False,
                input_chars=input_chars,
                message_count=len(body.messages),
                tool_count=len(body.tools or []),
                status=200,
                extra={
                    "elapsed_ms": timer.ms(),
                    "stop_reason": response.stop_reason,
                    "request_count": application.state.request_count,
                },
            )
            return JSONResponse(content=response.model_dump(mode="json"))

        def event_stream() -> Iterator[bytes]:
            event_types: list[str] = []
            try:
                for event_name, payload in provider.stream_events(
                    body, scenario=scenario
                ):
                    event_types.append(event_name)
                    yield format_sse(event_name, payload).encode("utf-8")
                log_request_meta(
                    cfg,
                    request_id=request_id,
                    model=body.model,
                    scenario=scenario,
                    stream=True,
                    input_chars=input_chars,
                    message_count=len(body.messages),
                    tool_count=len(body.tools or []),
                    status=200,
                    event_types=event_types,
                    extra={
                        "elapsed_ms": timer.ms(),
                        "request_count": application.state.request_count,
                    },
                )
            except MidStreamProviderError as exc:
                event_types.append("error")
                yield format_sse(
                    *error_event(error_type=exc.error_type, message=exc.message)
                ).encode("utf-8")
                log_request_meta(
                    cfg,
                    request_id=request_id,
                    model=body.model,
                    scenario=scenario,
                    stream=True,
                    input_chars=input_chars,
                    message_count=len(body.messages),
                    tool_count=len(body.tools or []),
                    status="sse_error",
                    event_types=event_types,
                    extra={"elapsed_ms": timer.ms()},
                )

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    return application


app = build_app()
