# Agent Task Packet v0.1

First copyable **agent work packet** for Life Harness — builds on [Harness Context Graph v0.2](harness-context-graph-v0.2.md).

## What this adds

- [`src/core/agentTaskPacket.ts`](../src/core/agentTaskPacket.ts) — pure builder for markdown task packets
- `buildAgentTaskPacket(data, input)` — combines task goal, file hints, verification commands, and embedded card context
- `formatAgentTaskPacketMarkdown(packet)` — stable section order for Codex/Cursor paste
- Card Detail **Copy agent task packet** action (alongside Copy agent context)

## How it builds on Harness Context Graph v0.2

`buildAgentTaskPacket()` calls `buildCardContextPacket()` internally. Card-scoped proof, logs, career context, memory facts, and S3 blocking all come from the v0.2 graph — this module adds the **task layer** only:

```text
LifeHarnessData + AgentTaskPacketInput
  → buildCardContextPacket(cardId)
  → embed card context markdown
  → add task goal, files, verification, boundaries
  → formatAgentTaskPacketMarkdown()
```

No second source of truth for cards or projects.

## How to use it from Card Detail

1. Open any card on **Card Detail**.
2. Tap **Copy agent task packet** (web clipboard).
3. Paste into Codex, Cursor, or another coding agent.

Default v0.1 packet:

- **Task name:** `Work on {card.title}`
- **Goal:** `card.nextTinyAction`, else `card.improveLane`, else a focused-progress fallback
- **File hints / verification:** `(not specified)` — not invented
- **Extra constraint:** stay scoped to this card

For custom packets in code, pass `AgentTaskPacketInput` with optional `fileHints`, `verificationCommands`, and `extraConstraints`.

## What it intentionally does not add

- Sprint tracker or project registry UI
- Repo path model
- Codex/Cursor execution bridge or PC automation
- Autonomous AI actions or Assistant Action Registry
- Gateway endpoints, Raw Lab changes, AI resume writer
- Cloud sync / auth
- RTK Query migration

## Future path

| Next layer | How v0.1 helps |
|------------|----------------|
| **Project Registry** | `cardId` + stable node IDs anchor repo/path hints in future packets |
| **Sprint Tracker** | Task packets can later include sprint scope without changing card context |
| **Agent Session Log** | Verification commands and acceptance criteria become session evidence |
| **Codex/Cursor delegation** | This markdown is the paste target; execution stays outside the app |

## Related

- [Harness Context Graph v0.2](harness-context-graph-v0.2.md)
- [Command center audit](life-harness-command-center-audit.md)
