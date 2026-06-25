import json
import os
from pathlib import Path

from app.config import DEFAULT_CRITIC_CONTEXT_MAX_CHARS, Settings
from app.context_packet import AiContextPacketWire
from app.context_packet_render import (
    CRITIC_CONTEXT_MAX_CHARS,
    render_context_packet_sections,
    render_context_packet_sections_for_critic,
    resolve_context_bundle_for_prompt,
    resolve_critic_context_bundle_for_prompt,
    resolve_critic_context_max_chars,
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


def test_critic_context_max_chars_defaults_to_1800():
    prior = os.environ.pop("SCOUT_CRITIC_CONTEXT_MAX_CHARS", None)
    try:
        settings = Settings.from_env()
        assert settings.critic_context_max_chars == DEFAULT_CRITIC_CONTEXT_MAX_CHARS
        assert CRITIC_CONTEXT_MAX_CHARS == 1800
        assert resolve_critic_context_max_chars() == 1800
    finally:
        if prior is not None:
            os.environ["SCOUT_CRITIC_CONTEXT_MAX_CHARS"] = prior


def test_critic_context_respects_configured_max_chars():
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    )
    rendered = render_context_packet_sections_for_critic(packet, max_chars=500)
    assert len(rendered) <= 500
    assert rendered.endswith("(truncated for critic budget)")


def test_critic_evidence_section_when_fields_present():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    data["open_thread"]["recent_digest"] = "User asked about career avoidance twice."
    data["open_thread"]["active_goal"] = "Pick one career move today."
    data["open_thread"]["open_loops"] = ["Qualcomm follow-up", "networking guilt"]
    data["open_thread"]["pinned_facts"] = ["Main quest is Life Harness v0.1."]
    data["open_thread"]["user_steering"] = ["No productivity lectures."]
    data["open_thread"]["do_not_repeat"] = ["you should feel guilty"]
    data["open_thread"]["wire"]["recent_digest"] = data["open_thread"]["recent_digest"]
    data["open_thread"]["wire"]["active_goal"] = data["open_thread"]["active_goal"]
    data["open_thread"]["wire"]["open_loops"] = data["open_thread"]["open_loops"]
    data["open_thread"]["wire"]["pinned_facts"] = data["open_thread"]["pinned_facts"]
    data["open_thread"]["wire"]["user_steering"] = data["open_thread"]["user_steering"]
    data["open_thread"]["wire"]["do_not_repeat"] = data["open_thread"]["do_not_repeat"]
    data["companion"]["briefing_prepared"] = ["Career thread is cooling while build stays hot."]
    packet = AiContextPacketWire.model_validate(data)

    rendered = render_context_packet_sections_for_critic(packet, max_chars=3600)

    assert "### Critic evidence" in rendered
    assert "Main quest is Life Harness v0.1." in rendered
    assert "User asked about career avoidance twice." in rendered
    assert "No productivity lectures." in rendered
    assert "you should feel guilty" in rendered
    assert "Career thread is cooling while build stays hot." in rendered


def test_critic_evidence_omitted_when_empty():
    data = json.loads(PACKET_FIXTURE.read_text(encoding="utf-8"))
    data["open_thread"]["recent_digest"] = ""
    data["open_thread"]["active_goal"] = ""
    data["open_thread"]["open_loops"] = []
    data["open_thread"]["pinned_facts"] = []
    data["open_thread"]["user_steering"] = []
    data["open_thread"]["do_not_repeat"] = []
    data["open_thread"]["wire"]["recent_digest"] = ""
    data["open_thread"]["wire"]["active_goal"] = ""
    data["open_thread"]["wire"]["open_loops"] = []
    data["open_thread"]["wire"]["pinned_facts"] = []
    data["open_thread"]["wire"]["user_steering"] = []
    data["open_thread"]["wire"]["do_not_repeat"] = []
    data["companion"]["briefing_title"] = None
    data["companion"]["briefing_prepared"] = []
    data["companion"]["briefing_detected"] = []
    packet = AiContextPacketWire.model_validate(data)

    rendered = render_context_packet_sections_for_critic(packet)
    assert "### Critic evidence" not in rendered


def test_legacy_critic_context_includes_evidence_from_thread_state():
    context = HarnessContext.model_validate(
        json.loads(CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=context,
    )
    request.thread_state.pinned_facts = ["Pinned: finish Qualcomm follow-up."]
    request.thread_state.user_steering = ["Stay concrete."]

    bundle = resolve_critic_context_bundle_for_prompt(request)

    assert "### Critic evidence" in bundle
    assert "Pinned: finish Qualcomm follow-up." in bundle
    assert "Stay concrete." in bundle
