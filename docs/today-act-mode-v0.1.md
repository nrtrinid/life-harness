# Today Act Mode v0.1

## Product rationale

Life Harness had powerful lanes (board, career, agent, recovery) but Today risked feeling like a stack of separate widgets. **Next Move Contract v0.1** added a ranked spine; **Act Mode v0.1** makes Today visually commit to one loop:

```text
Open → see one move → understand why → act → capture/log → see proof → continue
```

This is layout, copy, and composition only — no new collectors, parsers, or data model.

## Today act loop

| Step | UI |
|------|-----|
| Orient | Compact **While you were away** briefing |
| Act | **Your move** — Next Move Contract (act mode hero) |
| Parallel quest | **Current quest** — demoted TinyQuestCard |
| Capture | **Quick Capture** — universal input |
| Reward | **You moved** — Proof Shelf |
| Recover | **Recovery fallback** — MVD / Salvage |
| Context | **Active threads** — board backup |
| Backroom | **More on Today** — bonus, companion, shortcuts |

## How Next Move Contract fits

`buildNextMoveSummary()` still ranks lane proposals in core. Today is the only surface that displays the winner. The act-mode panel shows:

- Move (title)
- Why this
- Do
- Proof after / Pressure (compact meta)
- Open link when `targetRoute` is set
- Backup move as secondary line

If no primary contract exists, Today falls back to **TinyQuestCard** as hero.

## Today hierarchy (top → bottom)

1. Notice
2. While you were away (`TodayBriefingStrip`)
3. Active limit banner (when relevant)
4. **Your move** (`NextMoveContractPanel` actMode)
5. **Current quest** (`TinyQuestCard`, demoted, when next move exists)
6. Quick Capture (`actMode` copy)
7. You moved (Proof Shelf)
8. Recovery fallback (MVD / Salvage / Rescue)
9. Active threads (collapsible)
10. More on Today (collapsible backroom)

## Visually demoted (not deleted)

- **TinyQuestCard** — labeled "Current quest", quiet card below the contract
- **CompanionNote** — highlights in briefing strip; full note in backroom
- **BonusTrackCard** — backroom
- **Career shortcuts** — backroom
- **Today mission** label — replaced by "Current quest" when demoted

## Intentionally unchanged

- Next Move collectors / ranking logic
- Recovery core (`computeRecoveryVisibility`, MVD/Salvage behavior)
- Proof data model and Proof Shelf behavior
- Quick Capture parser / commands
- TinyQuestCard functionality (pounce, make smaller, deep links)

## Future path

- Merge TinyQuestCard and Next Move Contract into one CTA
- Act buttons on contract (park, delegate, log proof) via Assistant Action Registry

Related shipped slices: Card Detail Act / Backroom, Unified Proof Ledger, Universal Capture, [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md).
