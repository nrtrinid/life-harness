from __future__ import annotations

from app.models import ContentBlock, Message, MessagesRequest
from app.providers.local_coding import UPSTREAM_MODEL_ALIAS, translate_messages_to_coding


def _req(**kwargs: object) -> MessagesRequest:
    base = dict(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="hello")],
    )
    base.update(kwargs)
    return MessagesRequest(**base)  # type: ignore[arg-type]


def test_system_preserved_natively() -> None:
    body = translate_messages_to_coding(_req(system="Prefer pytest."))
    assert body.system == "Prefer pytest."
    assert body.messages[0].content == "hello"
    assert body.model_alias == UPSTREAM_MODEL_ALIAS
    # Must not use Raw Lab request shape.
    dumped = body.model_dump()
    assert "recent_turns" not in dumped
    assert "companion_self_memories" not in dumped
    assert "message" not in dumped or isinstance(dumped.get("messages"), list)


def test_ordered_history_preserved() -> None:
    body = translate_messages_to_coding(
        _req(
            messages=[
                Message(role="user", content="one"),
                Message(role="assistant", content="two"),
                Message(role="user", content="three"),
            ]
        )
    )
    assert [m.role for m in body.messages] == ["user", "assistant", "user"]
    assert [m.content for m in body.messages] == ["one", "two", "three"]


def test_generation_fields_forwarded_not_flattened_into_text() -> None:
    body = translate_messages_to_coding(
        _req(temperature=0.1, top_p=0.9, max_tokens=128, metadata={"k": "v"})
    )
    assert body.temperature == 0.1
    assert body.top_p == 0.9
    assert body.max_tokens == 128
    assert body.metadata == {"k": "v"}
    assert "k" not in str(body.messages[0].content)
    assert body.system is None


def test_text_blocks_flattened_per_message() -> None:
    body = translate_messages_to_coding(
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
    assert body.messages[0].content == "Hi there"
