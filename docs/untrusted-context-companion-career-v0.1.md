# Untrusted Context in Companion + Career v0.1

## What this adds

Companion and Career packet exports now wrap externally sourced text in **untrusted context blocks** using the shared module in [`src/core/untrustedContextBlock.ts`](../src/core/untrustedContextBlock.ts).

| Surface | Wrapped content | Source kind |
|---------|-----------------|-------------|
| Companion send | Long pasted external text (when CapabilityRouter flags it) | `job_post` or `pasted_text` |
| Career card context | Application `jobDescription` | `job_post` |
| Career card context | Scout candidate description (when different from application text) | `job_post` |
| Agent task packet | Same career blocks via embedded card context markdown | `job_post` |

Feature Sprint scoping/review wrapping is unchanged. See [`feature-sprint-untrusted-context-v0.1.md`](feature-sprint-untrusted-context-v0.1.md).

## Why it exists

Pasted job posts and long external paste can carry prompt injection or accidental instructions. Wrapping that text tells the gateway model to treat it as evidence only, not as commands in the primary user message field.

CapabilityRouter v0.1 already detected pasted external hints in inspector metadata. This slice moves the actual paste body into structured untrusted blocks on the context packet and trusted send message.

## Companion behavior

When `routeCapabilities()` sets `untrustedHints` and the trimmed message is at least 240 characters:

1. `buildUntrustedBlocksFromRouting()` creates one block per hint (body = full trimmed message in v0.1).
2. `AiContextPacket.untrustedBlocks` carries the structured blocks.
3. `AiContextPacket.userIntent.message` is replaced with `resolveTrustedUserMessage()`:
   - If the first line is short (≤160 chars) and the remainder is long (≥200 chars), keep the first line as the trusted question.
   - Otherwise use the stub: *User pasted external content in the untrusted block below…*
4. `ask-harness` and Deep Synthesis send the trusted message to the gateway; UI thread history still stores the user's raw text.

Backroom inspector shows untrusted block count and kinds when preview packet blocks exist.

## Career behavior

In `formatCardContextPacketMarkdown`:

- Application `jobDescription` is rendered inside an untrusted `job_post` block under `## Career application`.
- Raw job description is **not** exported as a trusted bullet.
- When linked scout candidate description differs and is non-empty, a second block (`Scout candidate description`) may appear.

Agent task packets inherit the same wrapping through embedded card context markdown.

## Wire + gateway

App wire maps `untrustedBlocks` → `untrusted_blocks` with pre-rendered markdown per block ([`contextPacketWire.ts`](../src/core/contextPacketWire.ts)).

Gateway [`context_packet_render.py`](../services/ai-gateway/app/context_packet_render.py) renders `### Untrusted context` **before** `### User intent` when blocks are present.

## Manual gates unchanged

This slice does **not** change:

- save / import / approve flows
- career intake storage or submit
- runner service behavior
- Raw Lab containment
- board mutation guardrails

## Dogfood check

1. Companion → paste 300+ char job description with “ignore prior rules” → Backroom shows untrusted block count; gateway packet contains `untrusted_blocks`; send uses short trusted message.
2. Career application card → copy agent task packet → job description appears inside untrusted banner, not as a raw trusted bullet.
3. Feature Sprint scoping/review packets unchanged.
4. Save/import/approve gates unchanged.

## Related docs

- [`feature-sprint-untrusted-context-v0.1.md`](feature-sprint-untrusted-context-v0.1.md)
- [`ai-workflows-current.md`](ai-workflows-current.md)
- [`plans/odysseus-patterns-repo-map-v0.1.md`](plans/odysseus-patterns-repo-map-v0.1.md)
