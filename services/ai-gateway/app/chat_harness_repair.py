from __future__ import annotations

CHAT_HARNESS_DRAFT_REPAIR_PROMPT = """\
The previous answer was not valid JSON for the Chat Harness schema.
Return ONLY a corrected JSON object. No markdown fences, no commentary, no thinking tags.

Required top-level fields (all must be present):
- answer (string, 2-8 substantive sentences)
- used_context (boolean true or false)
- confidence_notes (array of strings — NOT a single string)
- safety_notes (array of strings — NOT a single string)

Broken output:
{broken}
"""


def build_chat_harness_draft_repair_prompt(broken: str, *, max_chars: int = 4000) -> str:
    return CHAT_HARNESS_DRAFT_REPAIR_PROMPT.format(broken=broken[:max_chars])
