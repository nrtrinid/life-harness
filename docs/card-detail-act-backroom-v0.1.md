# Card Detail Act / Backroom v0.1

## Product rationale

Today Act Mode v0.1 made the cockpit obvious: orient → one move → act → proof → recover. Opening a card could still feel like entering the machinery — agent packets, project metadata, resume internals, and career fields stacked in one dense surface.

**Card Detail Act / Backroom v0.1** answers one question first:

```text
What do I do with this card now?
```

Power tools remain available in **Backroom**. This is layout and composition only — no new capabilities, collectors, or automation.

## Act vs Backroom

| Mode | Role |
|------|------|
| **Act** (default) | Move the card forward — state, NTA, do/improve, proof, compact career summary |
| **Backroom** | Operator tools — agent copy/log, project metadata, sessions, resume/career internals |

Toggle placement: **Notice → card title strip → Act | Backroom** — page-level, always near the top. Mode is in-memory only (no route params, no persistence).

## Card Detail hierarchy

```text
Notice
Card title + area · state
[ Act | Backroom ]
```

### Act (default)

1. **Move** — progress, why it matters, state buttons
2. **Today's move** (when this card matches `buildNextMoveSummary`) — pressure, do, proof after
3. Nav links — Today, Board
4. **Next Tiny Action** + done for now
5. **Do vs Improve**
6. **Proof** — full linked proof items (reward)
7. **Recent wins** — up to 3-item teaser when wins exist
8. **Career** (application cards only) — strict cap:
   - Company / role
   - Follow-up status
   - Resume readiness status
   - Next resume action
   - Build Resume DOCX (when draft packet exists)
9. **Resume re-entry** (non-career resume packet) — last state + re-entry action only

### Backroom

- Agent handoff — copy context, task packet, copy + log sent
- Plans (trigger + obstacle)
- Project metadata (save / clear)
- Agent sessions (log, edit, mark done, delete)
- Resume Packet open loops (non-career)
- Resume Readiness / Hardening internals (modules, cautions, bank links)
- Career Application detail (status, URLs, angles, draft packet fields, job description)
- **Older wins** — full win history (Act shows a short teaser)
- Optimization Parking Lot

## What intentionally did not change

- `LifeCard` remains the source of truth
- All handlers preserved: state changes, project save/clear, copy/log, session CRUD, resume export, notices
- No new Next Move collectors — card note reuses `buildNextMoveSummary`
- No Unified Proof Ledger, Universal Capture, career redesign, nav redesign, ai-gateway, or Raw Lab changes

## Future path

- Deeper Card Next Move integration (card-native hero move)
- Unified Proof Ledger
- Universal Capture from card Act surface
- Nav / backroom cleanup across screens

## Do not build (this ticket)

- New agent capabilities or execution
- PC/browser automation
- New assistant action types
- New Next Move collectors
- New parser commands
- Cloud sync / auth
- Local-only WIP component imports (`AlivePatterns`, `CareerApplicationCardDetail`, etc.)
