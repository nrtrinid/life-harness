from __future__ import annotations


def test_health(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["provider"] == "mock"
    assert body["ready"] is True
    assert body["port"] == 8131
