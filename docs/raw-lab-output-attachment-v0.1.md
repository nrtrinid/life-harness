# Raw Lab Output Attachment v0.1

## Problem

Raw Signal assistant turns lived in session memory only. Useful output disappeared on clear chat or navigation unless the user manually copied it elsewhere. That was intentional containment, but it left a spine gap: high-value lab insights had no one-click path onto the board.

## P0 fix: Capture as idea

Each completed assistant turn exposes **Capture as idea** (user click required).

Flow:

1. `buildRawLabIdeaCaptureText` prefixes output as `new idea: …` (truncated via `compactText`, max ~240 chars).
2. `submitQuickCapture` → `applyQuickCapture` → Inbox card + idea log + `PROOF_TITLES.idea` proof.

Success notice in Raw Signal: `Idea captured.`

No changes to Universal Capture grammar, ai-gateway, or Raw Lab persistence model.

## Optional: Save as memory

**Save as memory** writes a Memory Bank item via `createMemoryItem` + `saveMemoryItem`:

- `kind: "pattern"`
- `tags: ["raw-lab"]`
- **`isActive: false`** — Raw Lab is experimental; saved items do not feed Companion context until the user marks them active in Memory Bank.

Success notice: `Saved to Memory Bank.`

## Optional: Copy for Companion

**Copy for Companion** puts a clipboard packet (output + plain-text disclaimer) via `copyTextToClipboard`. No navigation, digest param, or state mutation — distinct from toolbar **Continue in Companion** handoff.

Success notice: `Copied for Companion.`

## Containment preserved

- User must click; no autonomous capture on send or stream completion.
- Attachment handlers live in `app/raw-lab.tsx` (screen); thread UI components stay free of `useLifeHarness`.
- Raw Lab remains lab/backroom — not board authority.
- No S3 redaction helpers (Raw Lab has no sensitivity metadata; user click is the gate).

## Core module

`src/core/rawLabOutputAttachment.ts` — UI-independent helpers for idea capture, memory input, and companion handoff packet.

## Future (not v0.1)

- Selected-text capture (partial turn)
- Editable memory save dialog
- Active-by-default opt-in for Raw Lab memories
- Assistant-proposed attachment actions
- Autonomous mutation of board or Memory Bank

## Verification

```bash
npm run typecheck
npm test -- rawLab
npm test -- actions
npm test
```

## Related

- [`spine-attachment-audit-v0.1.md`](spine-attachment-audit-v0.1.md) — P0 Raw Lab row
- [`universal-capture-v0.1.md`](universal-capture-v0.1.md) — `new idea:` grammar
