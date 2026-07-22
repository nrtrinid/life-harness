from __future__ import annotations

from app.models import ContentBlock, Message, MessagesRequest
from app.providers.local_ai_gateway import translate_messages_to_raw_lab


def _req(**kwargs: object) -> MessagesRequest:
    base = dict(
        model="local-qwen",
        max_tokens=64,
        messages=[Message(role="user", content="hello")],
    )
    base.update(kwargs)
    return MessagesRequest(**base)  # type: ignore[arg-type]


def test_plain_user_message() -> None:
    body = translate_messages_to_raw_lab(_req())
    assert body.message == "hello"
    assert body.recent_turns == []
    assert body.thread_state == {}
    assert body.companion_self_memories == []
    assert body.reasoning_depth == "fast"


def test_system_string_prepended() -> None:
    body = translate_messages_to_raw_lab(_req(system="Be brief."))
    assert body.message == "System:\nBe brief.\n\nhello"


def test_system_list_text_parts_joined() -> None:
    body = translate_messages_to_raw_lab(
        _req(system=[{"type": "text", "text": "A"}, {"type": "text", "text": "B"}])
    )
    assert body.message == "System:\nA\nB\n\nhello"


def test_recent_turns_from_prior_messages() -> None:
    body = translate_messages_to_raw_lab(
        _req(
            messages=[
                Message(role="user", content="one"),
                Message(role="assistant", content="two"),
                Message(role="user", content="three"),
            ]
        )
    )
    assert body.message == "three"
    assert len(body.recent_turns) == 2
    assert body.recent_turns[0].role == "user"
    assert body.recent_turns[0].content == "one"
    assert body.recent_turns[1].role == "assistant"
    assert body.recent_turns[1].content == "two"


def test_flattens_text_blocks() -> None:
    body = translate_messages_to_raw_lab(
        _req(
            messages=[
                Message(
                    role="user",
                    content=[
                        ContentBlock(type="text", text="Hi "),
                        ContentBlock(type="text", text="there"),
                    ],
                )
            ]
        )
    )
    assert body.message == "Hi there"


def test_temperature_and_max_tokens_not_in_raw_lab_body() -> None:
    req = _req(temperature=0.2, top_p=0.9, metadata={"secret_key": "nope"}, max_tokens=128)
    body = translate_messages_to_raw_lab(req)
    dumped = body.model_dump()
    assert "temperature" not in dumped
    assert "top_p" not in dumped
    assert "max_tokens" not in dumped
    assert "metadata" not in dumped
    # metadata must never appear in model-visible message text
    assert body.message == "hello"
    assert "secret_key" not in body.message
    assert "nope" not in body.message
