"""Tool-definition and tool-input schema validation (Coding Slice C1)."""

from __future__ import annotations

import json
from typing import Any

from app.coding_tools_limits import (
    MAX_SCHEMA_NESTING_DEPTH,
    MAX_SCHEMA_SERIALIZED_BYTES,
    MAX_TOOL_CALL_INPUT_BYTES,
    MAX_TOOL_DESCRIPTION_LENGTH,
    MAX_TOOL_NAME_LENGTH,
    MAX_TOOLS_PER_REQUEST,
    TOOL_NAME_PATTERN,
)
from app.providers.base import ProviderInputError

# JSON Schema draft-7 subset keywords supported for C1/C2 tool inputs.
_SUPPORTED_SCHEMA_TYPES = frozenset(
    {"string", "number", "integer", "boolean", "object", "array", "null"}
)


def _schema_depth(value: Any, *, depth: int = 0) -> int:
    if depth > MAX_SCHEMA_NESTING_DEPTH + 1:
        return depth
    if isinstance(value, dict):
        if not value:
            return depth + 1
        return max(_schema_depth(v, depth=depth + 1) for v in value.values())
    if isinstance(value, list):
        if not value:
            return depth + 1
        return max(_schema_depth(v, depth=depth + 1) for v in value)
    return depth


def validate_tool_definitions(tools: list[Any]) -> list[dict[str, Any]]:
    """Validate tool definitions; return normalized dicts."""
    if not tools:
        raise ProviderInputError("tools must be non-empty when tool support is requested")
    if len(tools) > MAX_TOOLS_PER_REQUEST:
        raise ProviderInputError(
            f"tools exceeds maximum of {MAX_TOOLS_PER_REQUEST} definitions"
        )

    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for raw in tools:
        if not isinstance(raw, dict):
            raise ProviderInputError("each tool definition must be an object")
        name = raw.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ProviderInputError("tool name must be a non-empty string")
        if len(name) > MAX_TOOL_NAME_LENGTH:
            raise ProviderInputError(
                f"tool name exceeds maximum length {MAX_TOOL_NAME_LENGTH}"
            )
        if not TOOL_NAME_PATTERN.match(name):
            raise ProviderInputError(
                "tool name must match ^[a-zA-Z][a-zA-Z0-9_]*$"
            )
        if name in seen:
            raise ProviderInputError(f"duplicate tool name: {name!r}")
        seen.add(name)

        description = raw.get("description")
        if description is not None:
            if not isinstance(description, str):
                raise ProviderInputError("tool description must be a string")
            if len(description) > MAX_TOOL_DESCRIPTION_LENGTH:
                raise ProviderInputError(
                    f"tool description exceeds maximum length "
                    f"{MAX_TOOL_DESCRIPTION_LENGTH}"
                )

        schema = raw.get("input_schema", {})
        if schema is None:
            schema = {}
        if not isinstance(schema, dict):
            raise ProviderInputError("tool input_schema must be a JSON object")
        _validate_schema_shape(schema, path="input_schema")
        try:
            serialized = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ProviderInputError(
                f"tool input_schema is not JSON-serializable: {exc}"
            ) from exc
        if len(serialized.encode("utf-8")) > MAX_SCHEMA_SERIALIZED_BYTES:
            raise ProviderInputError(
                f"tool input_schema exceeds maximum serialized size "
                f"{MAX_SCHEMA_SERIALIZED_BYTES} bytes"
            )
        if _schema_depth(schema) > MAX_SCHEMA_NESTING_DEPTH:
            raise ProviderInputError(
                f"tool input_schema nesting exceeds maximum depth "
                f"{MAX_SCHEMA_NESTING_DEPTH}"
            )

        normalized.append(
            {
                "name": name,
                "description": description,
                "input_schema": schema,
            }
        )
    return normalized


def _validate_schema_shape(schema: dict[str, Any], *, path: str) -> None:
    schema_type = schema.get("type")
    if schema_type is not None:
        if isinstance(schema_type, list):
            for item in schema_type:
                if item not in _SUPPORTED_SCHEMA_TYPES:
                    raise ProviderInputError(
                        f"{path} has unsupported schema type {item!r}"
                    )
        elif schema_type not in _SUPPORTED_SCHEMA_TYPES:
            raise ProviderInputError(
                f"{path} has unsupported schema type {schema_type!r}"
            )

    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema:
            raise ProviderInputError(
                f"{path} uses unsupported schema keyword {key!r}"
            )

    props = schema.get("properties")
    if props is not None:
        if not isinstance(props, dict):
            raise ProviderInputError(f"{path}.properties must be an object")
        for prop_name, prop_schema in props.items():
            if not isinstance(prop_schema, dict):
                raise ProviderInputError(
                    f"{path}.properties.{prop_name} must be an object"
                )
            _validate_schema_shape(prop_schema, path=f"{path}.properties.{prop_name}")

    items = schema.get("items")
    if items is not None:
        if not isinstance(items, dict):
            raise ProviderInputError(f"{path}.items must be an object")
        _validate_schema_shape(items, path=f"{path}.items")

    additional = schema.get("additionalProperties")
    if isinstance(additional, dict):
        _validate_schema_shape(additional, path=f"{path}.additionalProperties")


def validate_tool_input_size(tool_input: dict[str, Any]) -> None:
    try:
        serialized = json.dumps(tool_input, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        raise ProviderInputError(f"tool input is not JSON-serializable: {exc}") from exc
    if len(serialized.encode("utf-8")) > MAX_TOOL_CALL_INPUT_BYTES:
        raise ProviderInputError(
            f"tool input exceeds maximum size {MAX_TOOL_CALL_INPUT_BYTES} bytes"
        )


def validate_input_against_schema(
    tool_input: dict[str, Any],
    schema: dict[str, Any],
    *,
    tool_name: str,
) -> None:
    """Validate tool-call input against a tool JSON Schema (draft-7 subset)."""
    validate_tool_input_size(tool_input)
    errors = _collect_schema_errors(tool_input, schema, path="$")
    if errors:
        raise ProviderInputError(
            f"tool {tool_name!r} input failed schema validation: {errors[0]}"
        )


def _collect_schema_errors(
    value: Any,
    schema: dict[str, Any],
    *,
    path: str,
) -> list[str]:
    errors: list[str] = []
    expected_type = schema.get("type")
    if expected_type is not None:
        if not _value_matches_type(value, expected_type):
            errors.append(f"{path}: expected type {expected_type!r}")
            return errors

    if "enum" in schema:
        if value not in schema["enum"]:
            errors.append(f"{path}: value not in enum")

    if isinstance(value, dict):
        props = schema.get("properties") or {}
        required = schema.get("required") or []
        if not isinstance(required, list):
            errors.append(f"{path}: required must be a list")
            return errors
        for req in required:
            if req not in value:
                errors.append(f"{path}: missing required property {req!r}")
        for key, prop_schema in props.items():
            if key in value and isinstance(prop_schema, dict):
                errors.extend(
                    _collect_schema_errors(value[key], prop_schema, path=f"{path}.{key}")
                )
        additional = schema.get("additionalProperties", True)
        if additional is False:
            extra = set(value.keys()) - set(props.keys())
            if extra:
                errors.append(f"{path}: unexpected properties {sorted(extra)!r}")

    if isinstance(value, list) and "items" in schema:
        item_schema = schema["items"]
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                errors.extend(
                    _collect_schema_errors(
                        item, item_schema, path=f"{path}[{idx}]"
                    )
                )

    return errors


def _value_matches_type(value: Any, expected: str | list[str]) -> bool:
    types = [expected] if isinstance(expected, str) else list(expected)
    for t in types:
        if t == "null" and value is None:
            return True
        if t == "string" and isinstance(value, str):
            return True
        if t == "boolean" and isinstance(value, bool):
            return True
        if t == "integer" and isinstance(value, int) and not isinstance(value, bool):
            return True
        if t == "number" and isinstance(value, (int, float)) and not isinstance(
            value, bool
        ):
            return True
        if t == "object" and isinstance(value, dict):
            return True
        if t == "array" and isinstance(value, list):
            return True
    return False
