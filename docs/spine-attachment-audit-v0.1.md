# Spine Attachment Audit v0.1

## Executive Summary

Life Harness has a clear product spine: **cards are source of truth**, **capture is input**, **proof and logs are reward/history**, **agent sessions and career objects attach to cards**, and **Next Move Contract** surfaces derived moves on Today. After Today Act Mode, Universal Capture, Proof Ledger, Nav/Backroom cleanup, and Assistant Action Registry, most **daily-loop outputs attach well**.

**Strongest areas:** Universal Capture (prefix grammar), agent session completion with evidence, career intake and candidate approval, assistant actions on Approve, job source runs, feature sprint completion, Today recovery/pounce.

**Weakest areas:** outputs that are useful but **leave the spine on screen change** — Raw Lab thread text, Deep Synthesis reports, resume DOCX downloads, and agent clipboard copies without logging a session. Companion chat is intentionally ephemeral until the user saves a summary or memory item; that layer feeds context but not Proof Ledger.

This audit is **documentation only**. It maps attachment quality and a small fix queue. No schema or feature work in this slice.

**Audit baseline:** branch `codex/career-v0.1-pipeline` at nav cleanup + feature sprint orchestrator (card Backroom). No `/feature-sprints` route.

---

## Spine Attachment Points

Canonical files and link fields:

| Attachment | Canonical files | Persists? | Key links |
|------------|-----------------|-----------|-----------|
| **LifeHarnessData** | `src/core/lifeHarnessData.ts`, `src/storage/persistence.ts` | Yes (single snapshot) | Root blob |
| **LifeCard** | `src/core/types.ts`, `src/core/actions.ts` | Yes | `proofItemIds[]`, `careerApplication`, `nextTinyAction` |
| **LifeLogEntry** | `src/core/types.ts`, `src/core/actions.ts` | Yes | `cardId?`, `proofItemId?` |
| **ProofItem** | `src/core/proof.ts`, `src/core/actions.ts` | Yes | `cardId?`, `sourceLogId?` |
| **Next Move Contract** | `src/core/nextMoveContract.ts` | No (computed) | `cardId?`, `targetRoute?` |
| **Universal Capture** | `src/core/parsing.ts`, `applyQuickCapture` in `src/core/actions.ts` | Yes when grammar matches | Routes to card / log / proof per intent |
| **Proof Ledger** | `src/core/proofLedger.ts` | No (read model) | Aggregates `proofItems`, `logs`, done `agentSessions` |
| **Agent sessions** | `src/core/agentSessionLog.ts`, `applyCompleteAgentSessionWithEvidence` | Yes | `cardId`, `evidenceLogId`, `evidenceProofItemId` |
| **Project registry** | `src/core/projectRegistry.ts` | Yes | `HarnessProject.cardId` |
| **Assistant actions** | `src/core/assistantActionRegistry.ts` | Via `apply*` on Approve | `cardId` on card-targeted proposals |
| **Job candidates / application cards** | `applyJobCandidateIntake`, `applyApproveJobCandidate`, `applyCareerIntake` | Yes | `JobCandidate.applicationCardId` ↔ `CareerApplication.jobCandidateId` |
| **Companion memory layer** | `chatSummaries`, `memoryItems`; `src/core/harnessMemory.ts` | Yes | Companion context — **not** Proof Ledger |
| **Raw Lab self-memories** | `src/core/companionSelfMemory.ts` | Yes (isolated store) | Raw Lab only — not board spine |
| **Feature sprint plans** | `src/core/featureSprintOrchestrator.ts`, Card Detail Backroom | Yes | `cardId`; complete → win log + proof |

**Product rule:** No free-floating “interesting output.” Every meaningful output should answer what card it moves, what proof/log it creates, what next move it suggests, what session it belongs to, or what capture phrase would record it.

---

## Surface Matrix

| Surface | Output | Current attachment | Quality | Floating risk | Recommended fix |
|---------|--------|-------------------|---------|---------------|-----------------|
| **Today** `/` | Quick Capture | `applyQuickCapture` → card / log / proof | Strong | Low | Good — see `docs/universal-capture-v0.1.md` |
| Today | Pounce / MVD / Salvage | `dailyState` + log + proof | Strong | Low | Good |
| Today | Next Move Contract display | Computed `cardId` + `targetRoute`; not stored | Strong | Low | Good — conductor only |
| Today | Proof Shelf | Read `proofItems` / ledger slice | Backroom-only | Low | Good |
| **Board** `/board` | Card browse | Links to `/card/[id]` | Backroom-only | Low | No mutation here by design |
| **Jobs** `/career` | Fit finder run | `jobCandidates`, `jobSourceRuns` via runner | Partial | Medium | Candidates lack cards until Queue approve; run proof via `applyRunJobSourceResult` |
| Jobs | Hub navigation | Deep links only | Backroom-only | Low | Good |
| **Companion** `/ask-harness` | Chat turns | In-memory thread; gateway only | Floating | High | Ephemeral by design; user must save summary/memory or approve action |
| Companion | Approved assistant actions | `applyQuickCapture`, session, park, NTA | Strong | Low | Good — `assistantActionRegistry.ts` |
| Companion | Save chat summary | `chatSummaries[]` | Partial | Medium | Feeds context, not Proof Ledger |
| Companion | Save memory item | `memoryItems[]` | Partial | Medium | Same; Memory Bank machinery |
| Companion | Deep Synthesis report | Session UI only | Floating | High | P1: optional “Save as chat summary” |
| **Playback** `/progress` | Stats / warmth | Read-only derived | Backroom-only | Low | Good |
| Playback | Export / import JSON | Full snapshot file | Floating | Low | P2: label as backup machinery only |
| **Agent Workbench** | Copy + log sent | `HarnessAgentSession` + `cardId` | Strong | Low | Good |
| Agent Workbench | Copy task packet only | Clipboard | Floating | Medium | P1: nudge to log sent session |
| **Proof Ledger** | Ledger rows | Read `buildProofLedger()` | Backroom-only | Low | Good |
| **Memory Bank** | Active memories | `memoryItems` for Companion | Backroom-only | Low | Intentional machinery |
| **Raw Signal** `/raw-lab` | Thread / responses | In-memory; cleared on clear/nav | Floating | High | P0: capture-as-idea or contained handoff |
| Raw Signal | Self-memories | Isolated `companionSelfMemories` | Backroom-only | Medium | Raw Lab only — do not export to board |
| Raw Signal | Handoff digest | URL param → new Companion thread | Partial | Medium | User must continue explicitly |
| **Resume Bank** | Module browse | Read `resumeModules` | Backroom-only | Low | Good |
| **Career Pack** | Pack import | `careerSourcePack` (+ modules merge) | Partial | Low | No card until candidate/card flows |
| **Job Sources** | Source run | Log + `ranJobSource` proof; optional `foundJobCandidates` | Strong | Low | `applyRunJobSourceResult` in `actions.ts` |
| Job Sources | New candidates | `jobCandidates[]` | Partial | Medium | Queue approve → card |
| **Source Setup** | Save source | `jobSources` | Partial | Low | Preview candidates optional on save |
| Source Setup | Test / preview | Session until save | Floating | Low | Backroom-only |
| **Candidate Intake** | New candidate | Clarity log only; `jobCandidates[]` | Partial | Medium | P1: stronger Queue / Approve CTA |
| **Career Intake** | Application card | Card + log + `applicationCard` proof | Strong | Low | Good |
| **Queue** `/job-candidates` | Approve candidate | Application card + proof | Strong | Low | Good |
| Queue | Dismiss / save | Candidate status | Partial | Low | Status on spine object |
| **Log** `/log` | Log list | Read `logs` | Backroom-only | Low | Good |
| **Weekly Review** `/review` | Weekly stats | Computed summary | Backroom-only | Low | Good |
| Weekly Review | Suggested patch text | Display only | Floating | Low | P2: copy-to-capture helper |
| **Card Detail Act** | State change | Card + proof on done/park | Strong | Low | Good |
| **Card Detail Backroom** | Project save | `projects[]` on `cardId` | Strong | Low | Good |
| Card Detail Backroom | Agent session CRUD | `agentSessions[]` on `cardId` | Strong | Low | Mark done → evidence |
| Card Detail Backroom | Feature sprint complete | Plan + win log + proof on card | Strong | Low | `completeFeatureSprintPlan` |
| Card Detail Backroom | Sprint step agent output | On plan step record | Partial | Medium | Visible in ledger after complete |
| Card Detail Backroom | Resume DOCX download | Browser file only | Floating | High | P0: post-download capture or auto proof |
| Card Detail Backroom | Clipboard context/packet | Clipboard | Floating | Medium | P1: pair with log sent / session |

---

## Floating Outputs

High-risk (useful output does not clearly feed spine):

1. **Raw Lab assistant turns** — in-memory only; no board capture path (`app/raw-lab.tsx`, containment by design).
2. **Resume DOCX export** — `handleBuildResumeDocx` in `app/card/[id].tsx` downloads file; no log/proof despite `resume exported` capture grammar.
3. **Deep Synthesis report** — display in Companion; no persist path (`SynthesisReportCard` tests avoid auto `saveMemoryItem`).
4. **Companion chat** (default) — lost on clear unless user saves summary/memory or approves an action.
5. **Agent clipboard-only** — task packet / context copied without `createAgentSessionForCard`.

Medium-risk:

- Job candidate intake before Queue approval (log + candidate, no card).
- Raw Lab → Companion handoff (digest param only).
- Unmatched Universal Capture (`worked on …` with no card match) — log only.

Low-risk (acceptable backroom):

- Playback JSON export/import as backup.
- Source setup preview runs.
- Weekly Review prose suggestions.

---

## Strong Attachments

What already feeds the spine coherently:

- **Universal Capture** — prefix intents → inbox card, win logs, proof, park (`src/core/parsing.ts`, `src/core/actions.ts`).
- **Proof Ledger** — unified read model over proof, logs, agent sessions (`src/core/proofLedger.ts`).
- **Agent session mark done** — evidence log + proof on card (`applyCompleteAgentSessionWithEvidence`).
- **Agent Workbench “Copy + log sent”** — session anchored to `cardId`.
- **Career intake** — application `LifeCard` + proof.
- **Queue approve** — card + `approvedCandidate` proof + candidate link repair.
- **Job source runs** — clarity log + `ranJobSource` / `foundJobCandidates` proof.
- **Assistant Action Registry** — Approve → same `apply*` paths as manual UI.
- **Feature sprint mark complete** — idempotent win log + proof on plan card (`completeFeatureSprintPlan`).
- **Today recovery** — pounce, MVD, salvage → daily state + logs + proof.
- **Next Move Contract** — ranks board/career/agent/recovery moves with `cardId` routes for Today.

---

## Recommended Fix Queue

### P0 — breaks spine coherence

| Fix | Rationale |
|-----|-----------|
| After resume DOCX download, offer **one-tap** `resume exported for {card}` capture or auto log+proof | Export is meaningful career progress but invisible to Proof Ledger today |
| Raw Lab: **Capture as idea** (prefixed quick capture) or explicit **Open in Companion** + save path | High-value lab insights disappear on navigation |

### P1 — useful coherence improvement

| Fix | Rationale |
|-----|-----------|
| Deep Synthesis: optional **Save as chat summary** (user-initiated) | Reuse existing `chatSummaries` path |
| Candidate Intake success: prominent **Open Queue / Approve** | Partial attachment until approve |
| Agent Workbench / Card Backroom: inline note when copying packet without logging session | Reduces clipboard-only dead ends |
| Doc/product: clarify `chatSummaries` / `memoryItems` vs Proof Ledger | Context layer ≠ reward layer; optional Playback cross-links later |

### P2 — backroom polish

| Fix | Rationale |
|-----|-----------|
| Weekly Review: copy suggested patch into capture-friendly text | Low urgency reflection aid |
| Playback: label export/import as **backup machinery** in UI copy | Sets expectations |
| Feature sprint mid-flight step output | Proof appears after **Mark feature complete**; optional step-level proof later |

---

## Do Not Build Yet

- Autonomous agent execution, PC/browser automation, Codex/Cursor bridges
- New capture parser commands or assistant action types (audit first, then ticket)
- New routes or proof schema
- Raw Lab board context export or jailbreak export to Companion
- LLM-ranked next moves or universal search
- Broad Today / Career / Companion redesigns
- Feature Sprint standalone nav until attachment story is clear

---

## Verification

Audited against committed app on `codex/career-v0.1-pipeline`. Doc-only change set.

```bash
git fetch origin
git worktree add ../life-harness-spine-audit-clean origin/codex/career-v0.1-pipeline
cd ../life-harness-spine-audit-clean
# copy docs/spine-attachment-audit-v0.1.md and docs/README.md patch
npm ci
npm run typecheck   # pass
npm test            # 806 tests pass (80 files, e74d0d3 worktree)
```

---

## Related docs

- [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md) — act surfaces vs machinery
- [`universal-capture-v0.1.md`](universal-capture-v0.1.md) — capture grammar
- [`unified-proof-ledger-v0.1.md`](unified-proof-ledger-v0.1.md) — ledger sources
- [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md) — sprint completion proof
- [`assistant-action-registry-v0.1.md`](assistant-action-registry-v0.1.md) — Companion propose → approve → apply
