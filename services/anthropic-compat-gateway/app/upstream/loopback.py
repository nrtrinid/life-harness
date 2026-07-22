from __future__ import annotations

from urllib.parse import urlparse


def validate_loopback_base_url(url: str) -> str:
    """Normalize and validate a loopback-only HTTP base URL.

    Returns the base URL without a trailing slash.

    Rules:
    - Scheme must be ``http`` (https rejected).
    - Host must be ``127.0.0.1`` or ``localhost`` (case-insensitive host).
    - IPv6 loopback ``::1`` is unsupported and rejected with a clear message.
    - Userinfo / credentials in the URL are rejected.
    - LAN, public hostnames, and non-loopback IPs are rejected.
    """
    raw = (url or "").strip()
    if not raw:
        raise ValueError("local AI gateway base URL is empty")

    # Catch unbracketed IPv6 forms that urlparse cannot host-parse reliably.
    if "::1" in raw.lower():
        raise ValueError(
            "IPv6 loopback (::1) is unsupported for ACGW local AI gateway; "
            "use http://127.0.0.1 or http://localhost"
        )

    parsed = urlparse(raw)
    if parsed.scheme.lower() != "http":
        raise ValueError(
            f"local AI gateway base URL must use http scheme (got {parsed.scheme!r})"
        )

    if parsed.username is not None or parsed.password is not None:
        raise ValueError("local AI gateway base URL must not include userinfo/credentials")

    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise ValueError("local AI gateway base URL is missing a host")

    # urlparse keeps brackets for IPv6 in netloc; hostname is without brackets.
    if host in ("::1", "0:0:0:0:0:0:0:1") or host.startswith("["):
        raise ValueError(
            "IPv6 loopback (::1) is unsupported for ACGW local AI gateway; "
            "use http://127.0.0.1 or http://localhost"
        )

    if host not in ("127.0.0.1", "localhost"):
        raise ValueError(
            f"local AI gateway base URL host must be 127.0.0.1 or localhost "
            f"(got {host!r}); LAN/public hosts are rejected"
        )

    # Reject unexpected path components beyond empty or "/" — keep path if present
    # as part of a reverse-proxy prefix, but normalize trailing slash on the base.
    path = parsed.path or ""
    if path in ("", "/"):
        path = ""
    else:
        path = path.rstrip("/")

    netloc = parsed.netloc
    # Drop any userinfo that somehow remained (defensive; already checked).
    if "@" in netloc:
        raise ValueError("local AI gateway base URL must not include userinfo/credentials")

    # Rebuild without query/fragment.
    if parsed.query or parsed.fragment:
        raise ValueError("local AI gateway base URL must not include query or fragment")

    normalized = f"http://{netloc}{path}"
    return normalized.rstrip("/")
