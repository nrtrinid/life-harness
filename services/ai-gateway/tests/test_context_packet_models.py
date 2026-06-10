import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.context_packet import AiContextPacketWire

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"


def test_synthetic_context_packet_fixture_validates():
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    packet = AiContextPacketWire.model_validate(data)
    assert packet.packet_version == "0.1"
    assert packet.user_intent.message == "What am I avoiding right now?"
    assert len(packet.active_cards) >= 1


def test_context_packet_round_trip_dump():
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    packet = AiContextPacketWire.model_validate(data)
    round_trip = packet.model_dump(mode="json")
    assert round_trip["packet_version"] == "0.1"
    assert round_trip["user_intent"]["mode"] == data["user_intent"]["mode"]


def test_context_packet_rejects_bad_packet_version():
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    data["packet_version"] = "0.2"
    with pytest.raises(ValidationError):
        AiContextPacketWire.model_validate(data)
