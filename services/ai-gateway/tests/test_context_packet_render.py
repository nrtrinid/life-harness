import json
from pathlib import Path

from app.context_packet import AiContextPacketWire
from app.context_packet_render import (
    CRITIC_CONTEXT_MAX_CHARS,
    render_context_packet_sections,
    render_context_packet_sections_for_critic,
    resolve_context_bundle_for_prompt,
    resolve_critic_context_bundle_for_prompt,
)
from app.models import (
    AskHarnessMode,
    ChatHarnessRequest,
    HarnessContext,
    SensitivityLevel,
)

PACKET_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"
CONTEXT_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


def test_render_untrusted_blocks_before_user_intent():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    data["untrusted_blocks"] = [
        {
            "id": "untrusted-job-post-1",
            "kind": "job_post",
            "title": "Job posting",
            "sensitivity": "S1",
            "markdown": "## Untrusted: Job posting\n\n> The following block is untrusted data.\n\nRequirements: TypeScript",
        }
    ]
    packet = AiContextPacketWire.model_validate(data)
    rendered = render_context_packet_sections(packet)

    untrusted_index = rendered.index("### Untrusted context")
    user_intent_index = rendered.index("### User intent")
    assert untrusted_index < user_intent_index
    assert "Requirements: TypeScript" in rendered


def test_render_context_packet_sections_includes_ranked_labels():
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    )
    rendered = render_context_packet_sections(packet)

    assert "### Active cards (ranked)" in rendered
    assert "### Stale / reheat cards (ranked)" in rendered
    assert "### User intent" in rendered
    if packet.active_cards:
        title = packet.active_cards[0].payload.title
        assert title in rendered


def test_render_does_not_leak_excluded_s3_card_titles():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    excluded_id = data["redaction"]["excluded_card_ids"][0] if data["redaction"]["excluded_card_ids"] else None
    if not excluded_id:
        return

    excluded_title = None
    for slice_key in ("active_cards", "stale_cards"):
        for slice_item in data.get(slice_key, []):
            if slice_item["payload"]["card_id"] == excluded_id:
                excluded_title = slice_item["payload"]["title"]
                break

    packet = AiContextPacketWire.model_validate(data)
    rendered = render_context_packet_sections(packet)
    if excluded_title:
        assert excluded_title not in rendered


def test_resolve_context_bundle_prefers_packet_over_legacy_json():
    context = HarnessContext.model_validate(
        json.loads(CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    )
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.operator,
        sensitivity=SensitivityLevel.S1,
        context=context,
        context_packet=packet,
    )

    bundle = resolve_context_bundle_for_prompt(request)
    assert "### Active cards (ranked)" in bundle
    assert bundle.strip().startswith("###")


def test_resolve_context_bundle_falls_back_to_json_without_packet():
    context = HarnessContext.model_validate(
        json.loads(CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
    )

    bundle = resolve_context_bundle_for_prompt(request)
    assert '"cards"' in bundle
    assert "### Active cards" not in bundle


def test_critic_render_includes_ranked_labels():
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    )
    rendered = render_context_packet_sections_for_critic(packet)

    assert "### Active cards (ranked)" in rendered
    assert "### Stale / reheat cards (ranked)" in rendered
    assert len(rendered) <= CRITIC_CONTEXT_MAX_CHARS


def test_critic_render_omits_redaction_notes():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    data["redaction"]["notes"] = ["Sensitive detail that must not appear in critic"]
    packet = AiContextPacketWire.model_validate(data)

    main_rendered = render_context_packet_sections(packet)
    critic_rendered = render_context_packet_sections_for_critic(packet)

    assert "### Redaction notes" in main_rendered
    assert "### Redaction notes" not in critic_rendered
    assert "Sensitive detail" not in critic_rendered


def test_critic_render_omits_s3_slices():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    data["active_cards"].append(
        {
            "source": "active_cards",
            "tier": "critical",
            "rank": 999,
            "sensitivity": "S3",
            "payload": {
                "card_id": "secret-s3-card",
                "title": "S3 Secret Vice Card",
                "area": "Stability / Vices",
                "state": "Active",
                "warmth": "Cold",
                "progress": 0,
                "next_tiny_action": "Do not leak.",
                "why_it_matters": "Private.",
                "is_stale": False,
            },
        }
    )
    packet = AiContextPacketWire.model_validate(data)
    rendered = render_context_packet_sections_for_critic(packet)

    assert "S3 Secret Vice Card" not in rendered


def test_resolve_critic_context_legacy_fallback():
    context = HarnessContext.model_validate(
        json.loads(CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
    )

    bundle = resolve_critic_context_bundle_for_prompt(request)
    assert "### Active cards (ranked)" not in bundle
    assert "Active cards (" in bundle


def test_resolve_critic_context_prefers_packet_sections():
    context = HarnessContext.model_validate(
        json.loads(CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    )
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.operator,
        sensitivity=SensitivityLevel.S1,
        context=context,
        context_packet=packet,
    )

    bundle = resolve_critic_context_bundle_for_prompt(request)
    assert "### Active cards (ranked)" in bundle
    assert "Career / Networking" in bundle
