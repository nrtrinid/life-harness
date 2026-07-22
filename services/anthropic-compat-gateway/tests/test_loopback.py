from __future__ import annotations

import pytest

from app.upstream.loopback import validate_loopback_base_url


@pytest.mark.parametrize(
    "url,expected",
    [
        ("http://127.0.0.1:8111", "http://127.0.0.1:8111"),
        ("http://127.0.0.1:8111/", "http://127.0.0.1:8111"),
        ("http://localhost:8111", "http://localhost:8111"),
        ("http://LOCALHOST:8111/", "http://LOCALHOST:8111"),
        ("http://127.0.0.1", "http://127.0.0.1"),
        ("http://127.0.0.1:8111/prefix/", "http://127.0.0.1:8111/prefix"),
    ],
)
def test_loopback_accepts(url: str, expected: str) -> None:
    assert validate_loopback_base_url(url) == expected


@pytest.mark.parametrize(
    "url,match",
    [
        ("", "empty"),
        ("https://127.0.0.1:8111", "http scheme"),
        ("http://user:pass@127.0.0.1:8111", "userinfo"),
        ("http://[::1]:8111", "IPv6"),
        ("http://::1:8111", "IPv6"),
        ("http://192.168.1.10:8111", "127.0.0.1 or localhost"),
        ("http://10.0.0.1:8111", "127.0.0.1 or localhost"),
        ("http://example.com:8111", "127.0.0.1 or localhost"),
        ("http://0.0.0.0:8111", "127.0.0.1 or localhost"),
        ("ftp://127.0.0.1:8111", "http scheme"),
        ("http://127.0.0.1:8111?x=1", "query or fragment"),
        ("http://127.0.0.1:8111#frag", "query or fragment"),
    ],
)
def test_loopback_rejects(url: str, match: str) -> None:
    with pytest.raises(ValueError, match=match):
        validate_loopback_base_url(url)
