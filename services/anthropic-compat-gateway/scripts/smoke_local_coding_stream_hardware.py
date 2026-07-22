#!/usr/bin/env python3
"""Hardware smoke checklist for Coding Slice B (manual; not CI).

Requires A770 + OpenVINO GenAI 2026.2 + Qwen weights + running ai-gateway.

Record:
  - Upstream TTFT (time to first coding delta)
  - ACGW TTFT (time to first Anthropic content_block_delta)
  - Total generation time
  - Delta count
  - Joined streamed text vs non-stream /ai/coding/chat parity
  - Disconnect cancellation (streamer CANCEL status)
  - Pipeline load count == 1 (coding_fast shares companion_fast)
  - No cloud traffic

Acceptance claim requires: TTFT < total time AND >1 meaningful delta.
Do not claim native Claude Code coding capability from text-only streaming.
"""

from __future__ import annotations

print(
    "Hardware smoke is manual. Start ai-gateway with SCOUT_PROVIDER=openvino, "
    "ACGW with ACGW_PROVIDER=local_coding, then stream POST /v1/messages."
)
raise SystemExit(0)
