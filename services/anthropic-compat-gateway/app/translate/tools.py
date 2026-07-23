from __future__ import annotations

import json
import re
from typing import Any

from app.models import ToolDefinition

SAFE_TOOL_PREFERENCE = ("Read", "Glob", "Grep", "LS", "Search")


class NoSafeToolError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ToolInputValidationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def _schema_properties(schema: dict[str, Any]) -> dict[str, Any]:
    props = schema.get("properties")
    if isinstance(props, dict):
        return props
    return {}


def _required_fields(schema: dict[str, Any]) -> list[str]:
    required = schema.get("required")
    if isinstance(required, list):
        return [str(item) for item in required]
    return []


def _pick_string_path_value(tool_name: str, prop_name: str) -> str:
    lowered = prop_name.lower()
    if tool_name == "Read" or "path" in lowered or "file" in lowered:
        return "package.json"
    if "pattern" in lowered or "query" in lowered or "glob" in lowered:
        return "package.json"
    if "command" in lowered:
        return "echo ok"
    return "package.json"


def build_safe_tool_input(tool: ToolDefinition) -> dict[str, Any]:
    """Build a minimal input dict that satisfies the tool's JSON schema."""
    schema = tool.input_schema or {}
    props = _schema_properties(schema)
    required = _required_fields(schema)
    result: dict[str, Any] = {}

    fields = list(dict.fromkeys([*required, *props.keys()]))
    # Only populate required fields plus obvious path-like optionals for Read.
    for name in fields:
        if name not in required and name not in ("file_path", "path", "pattern", "glob"):
            if tool.name != "Read":
                continue
            if name not in ("file_path", "path"):
                continue
        prop = props.get(name, {})
        prop_type = prop.get("type") if isinstance(prop, dict) else None
        if prop_type == "string" or prop_type is None:
            result[name] = _pick_string_path_value(tool.name, name)
        elif prop_type == "integer" or prop_type == "number":
            result[name] = 0
        elif prop_type == "boolean":
            result[name] = False
        elif prop_type == "array":
            result[name] = []
        elif prop_type == "object":
            result[name] = {}
        else:
            result[name] = _pick_string_path_value(tool.name, name)

    validate_tool_input(tool, result)
    return result


def validate_tool_input(tool: ToolDefinition, tool_input: dict[str, Any]) -> None:
    """Lightweight JSON Schema subset validation for mock tool inputs."""
    schema = tool.input_schema or {}
    props = _schema_properties(schema)
    for name in _required_fields(schema):
        if name not in tool_input:
            raise ToolInputValidationError(
                f"Tool {tool.name!r} input missing required field {name!r}"
            )
    for name, value in tool_input.items():
        if name not in props:
            # Allow additional properties unless schema forbids them.
            if schema.get("additionalProperties") is False:
                raise ToolInputValidationError(
                    f"Tool {tool.name!r} input has unexpected field {name!r}"
                )
            continue
        prop = props[name]
        if not isinstance(prop, dict):
            continue
        expected = prop.get("type")
        if expected == "string" and not isinstance(value, str):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be string"
            )
        if expected == "integer" and not isinstance(value, int):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be integer"
            )
        if expected == "number" and not isinstance(value, (int, float)):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be number"
            )
        if expected == "boolean" and not isinstance(value, bool):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be boolean"
            )
        if expected == "array" and not isinstance(value, list):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be array"
            )
        if expected == "object" and not isinstance(value, dict):
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be object"
            )
        enum = prop.get("enum")
        if isinstance(enum, list) and value not in enum:
            raise ToolInputValidationError(
                f"Tool {tool.name!r} field {name!r} must be one of {enum}"
            )


def select_safe_tool(tools: list[ToolDefinition] | None) -> tuple[ToolDefinition, dict[str, Any]]:
    if not tools:
        raise NoSafeToolError("No tools were supplied on the request")

    by_name = {tool.name: tool for tool in tools}
    for preferred in SAFE_TOOL_PREFERENCE:
        tool = by_name.get(preferred)
        if tool is None:
            continue
        try:
            tool_input = build_safe_tool_input(tool)
        except ToolInputValidationError as exc:
            raise NoSafeToolError(
                f"Preferred tool {preferred!r} present but input could not be validated: {exc.message}"
            ) from exc
        return tool, tool_input

    available = ", ".join(sorted(by_name))
    raise NoSafeToolError(
        "No supported harmless tool available. "
        f"Looked for {list(SAFE_TOOL_PREFERENCE)}; request had: [{available}]"
    )


def chunk_json_string(raw: str, *, chunk_size: int = 8) -> list[str]:
    if not raw:
        return [""]
    return [raw[i : i + chunk_size] for i in range(0, len(raw), chunk_size)]


def tool_input_json_chunks(tool_input: dict[str, Any], *, chunk_size: int = 8) -> list[str]:
    raw = json.dumps(tool_input, separators=(",", ":"), ensure_ascii=False)
    chunks = chunk_json_string(raw, chunk_size=chunk_size)
    # Ensure more than one delta when possible for streaming tests.
    if len(chunks) == 1 and len(raw) > 1:
        mid = max(1, len(raw) // 2)
        return [raw[:mid], raw[mid:]]
    return chunks


_TOOL_RESULT_TYPES = {"tool_result"}


def message_has_tool_result(messages: list[Any]) -> bool:
    for message in messages:
        content = message.content if hasattr(message, "content") else message.get("content")
        if isinstance(content, str):
            continue
        if not isinstance(content, list):
            continue
        for block in content:
            block_type = block.type if hasattr(block, "type") else block.get("type")
            if block_type in _TOOL_RESULT_TYPES:
                return True
    return False


def looks_like_tool_id(value: str) -> bool:
    return bool(re.match(r"^toolu_[a-zA-Z0-9]+$", value))
