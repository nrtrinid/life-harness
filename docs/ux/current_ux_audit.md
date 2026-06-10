# Current UX Audit

**Repo:** `life-harness` (Life Harness / Momentum Board v0.1)  
**Audit date:** 2026-06-09  
**Method:** Design docs + screen/component code review + test/typecheck validation. No product behavior changes.  
**Stability:** `npm run typecheck` ✅ · `npm run test` ✅ (203 tests)

---

## 1. Executive summary

### What is working?

- **Core loop exists in code and UI.** Today exposes briefing, pounce mission copy, follow-ups, capture, active summary, recovery (MVD/Salvage), and proof preview. Board, Progress, Log, and Card Detail round out the v0.1 surface.
- **Product philosophy is embedded.** Active limit (3), Inbox-first capture, parked-not-failed copy, warmth signals, proof shelf vs raw log, use-before-improve locks, and shame-free recovery language are present—not just documented.
- **Career machinery is real.** Intake → candidate queue → approval → application card, job sources/runner, resume bank, follow-up due dates, and career-oriented salvage options form a coherent (if sprawling) job-search subsystem.
- **Feedback on key actions is wired.** Pounce/MVD/Salvage/capture/state changes surface ephemeral notices with XP and proof suffixes; proof shelf can pulse after success.
- **Field Ops theme is consistent.** Brass/olive palette, uppercase section labels, bordered cards, and accent strips on XP/warmth/proof sections give a coherent “ops board” feel without a design rabbit hole.

### What feels promising?

- **While You Were Away** is the right opening move: computed bullets, deep links to cards, career/scout signals, and suggested pounce/salvage lines align with “alive board” intent.
- **Card Detail depth** (next tiny action, do/improve, resume packet, career fields) supports resumability—good foundation for agent/memory handoff later.
- **Ask Harness Dev** already exports structured context, shows quality summary, and saves chat memories—early proof that AI can sit beside the board without owning it.
- **Proof vs Log separation** is conceptually strong: Progress/Today emphasize evidence; Log stays append-only audit trail.

### What is currently confusing or rough?

- **Today is a long scroll with no visual hierarchy for “the one move.”** Eleven nav pills, then ~10 same-weight sections; primary actions (Pounce, capture, recovery) compete with secondary career links and summaries.
- **Career workflow is split across six top-level nav destinations** (Intake, Paste, Queue, Bank, Sources, Setup) with overlapping purposes—high cognitive load for a user who just wants to apply today.
- **Progress reads like an admin dashboard**, not a momentum/proof experience. Job-scout stats, locks, and export/import sit beside proof shelf with equal visual weight.
- **Jargon is mostly unexplained in UI** (pounce, MVD, salvage, warmth, proof shelf). Copy is warm in places but assumes prior context.
- **Pounce is initiation-only** (by design) but the UI does not make that clear; users may think tapping Pounce completes the mission.
- **Quick Capture is buried** mid-page and uses the label “Report” with a secondary-styled button—undercuts the “one input box” thesis.

### Biggest UX risk

**Feature surface outran information architecture.** The app accumulated career scout, persistence, and Ask Harness capabilities as peer top-level destinations. A user opening the app for the first time in the morning cannot answer “what matters and what do I do next?” in under 10 seconds without reading multiple sections and choosing among similar-sounding nav items (Intake vs Paste vs Queue vs Setup).

---

## 2. Product intent as implemented

### What the UI seems to be trying to do

The implemented product is a **local career command board** wrapped in a broader life momentum system:

1. **Orient** via While You Were Away + Main Quest + Career Pounce block.
2. **Execute** via Pounce button, career intake paths, job source runs, follow-up list, and card next-tiny-actions.
3. **Capture** via Quick Capture (rule-based) and multiple structured intake forms.
4. **Organize** via horizontal Board columns and Card Detail depth fields.
5. **Recover** via MVD checklist and Salvage picker at the bottom of Today.
6. **Accumulate proof** via proof items surfaced on Today (preview) and Progress (full shelf).
7. **Operate job scout** via Sources, Setup, Queue, Bank screens and extensive Progress stats.
8. **Experiment with AI** via Ask Harness Dev (optional gateway).

### Comparison to intended loop

> Open app → know what matters → take one small useful action → log proof → recover when stuck.

| Loop step | Implemented? | UX gap |
|-----------|--------------|--------|
| Know what matters | Partial | Briefing + pounce copy exist, but buried among peers; briefing “suggested pounce” can diverge from static `dailyState.pounceMission` shown in Career Pounce section |
| One small action | Partial | Smallest Start text is visible; no single primary CTA chains into the action (many secondary links instead) |
| Log proof | Yes | Capture, pounce, MVD, salvage, state changes create proof; feedback is brief (3s notice) |
| Recover when stuck | Partial | MVD/Salvage copy is good; placement at bottom + collapsed toggles reduces discoverability |

**Verdict:** Mechanics match the thesis better than the **daily experience** does. The backend/rules layer is ahead of the presentation layer.

---

## 3. Screen inventory

| Screen / area | Purpose | Main UI elements | Primary user action | Strengths | UX problems | Missing states | Confusing copy | Likely files |
|---------------|---------|------------------|---------------------|-----------|---------------|----------------|----------------|--------------|
| **Today** (`/`) | Daily command surface | Nav, notices, active limit banner, While You Were Away, Primary Objective, Career Pounce, Follow-ups, Quick Capture, Active summary, Recovery, Proof preview | Pounce / capture / open follow-up | Rich briefing; career links in one place; proof pulse | Too long; no focal CTA; capture too low; recovery at bottom | First-day empty briefing is generic; no “you already won today” state | “Primary Objective” vs “Main Quest”; “Report” on capture | `app/index.tsx`, `src/components/*`, `src/core/briefing.ts` |
| **Board** (`/board`) | Columnar card states | Intro copy, horizontal scroll columns (6 states), CardTiles with state buttons | Change card state; open card | Clear parked-safe intro; active limit banner; warmth on tiles | Horizontal scroll not obvious on desktop; no Inbox triage flow | Empty columns say “Nothing here” only | “Swipe sideways” — no swipe, scroll only | `app/board.tsx`, `src/components/CardTile.tsx` |
| **Progress** (`/progress`) | Stats + proof + data ops | Source stats, scout stats, career stats, XP, warmth lists, cold/dormant, proof shelf, locks, quest bars, export/import/reset | Review proof; export data | Proof shelf accent; cold/dormant links to re-entry actions | Dashboard sprawl; career momentum not storied; dev tools mixed with user value | No “week in review” narrative | Section titles are operator-facing (“Approved Source Fetching”) | `app/progress.tsx`, `src/core/progress.ts` |
| **Log** (`/log`) | Raw audit trail | Chronological entries with type, area, XP, card link | Inspect history | Clear “append-only” framing | Easy to confuse with Proof; no filter/search | No loading (N/A local) | “Raw mission log” — fine for ops, odd for user | `app/log.tsx` |
| **Card Detail** (`/card/[id]`) | Deep project/application context | Title/meta, state buttons, NTA, do/improve, plans, resume packet, career block, wins, parking lot, proof | Activate/park; read re-entry | Excellent resumability fields; career application block | Very long; no inline capture; state buttons wrap heavily | Not found state exists | Raw `card.state` in meta (e.g. `waiting` not label) | `app/card/[id].tsx` |
| **Career Intake** (`/career-intake`) | Direct application card | Form fields, role/status pickers, create button | Create application card | Straightforward form; redirects to card on success | Duplicates Paste path conceptually | No draft save | “Intake” vs “Paste” distinction unclear in nav | `app/career-intake.tsx` |
| **Candidate Intake** (`/candidate-intake`) | Queue-first job paste | Form + fit review after submit | Create candidate | Fit reasons/modules helpful | Two-step mental model hidden until after submit | No empty queue CTA from here | Nav label “Paste” vs screen “Candidate Intake” | `app/candidate-intake.tsx` |
| **Job Candidates** (`/job-candidates`) | Review queue | Status sections, approve/save/dismiss | Approve to card | Clear approve CTA; fit disclaimer | Status sections all shown even when empty | No batch actions | “Approve to Application Card” is long | `app/job-candidates.tsx` |
| **Resume Bank** (`/resume-bank`) | Resume module library | Expandable modules | Read bullets/tags | Good structured view | Read-only; disconnected from “apply now” | No link to use module in intake | “Deterministic keyword match” disclaimer buried | `app/resume-bank.tsx` |
| **Job Sources** (`/job-sources`) | Manual source runs | Add/edit sources, run due/all, cadence | Run source | Due badges; batch buttons | Requires external runner; errors easy | Runner-down state is message-only | Many kind labels (Greenhouse, etc.) unexplained | `app/job-sources.tsx` |
| **Source Setup** (`/source-setup`) | URL detect + dry-run | URL paste, detect, test, save | Configure source | Power-user friendly | High complexity for v0.1 daily user | Workday registry-only edge cases | “Adapter”, “fixture” dev vocabulary | `app/source-setup.tsx` |
| **Ask Harness Dev** (`/ask-harness`) | Local AI bridge | Gateway URL, mode/sensitivity, message, context preview, memory save | Send question | Context quality transparency; quick questions | In main nav; JSON preview; dev labels | Gateway down error only | “Ask Harness Dev” — clearly dev, but placement wrong | `app/ask-harness.tsx`, `src/core/harnessContext.ts` |
| **Nav** (global) | Wayfinding | 11 text pills, wrap row | Jump screens | All destinations reachable | Far too many top-level items; career tools dominate | No grouping/hierarchy | “Ask Harness Dev” alongside “Today” | `src/components/Nav.tsx` |

### Shared components (cross-cutting)

| Component | Role | UX notes | Files |
|-----------|------|----------|-------|
| QuickCapture | One-sentence input | Secondary button; “Report” label; help text good | `src/components/QuickCapture.tsx` |
| MvdChecklist | Recovery | Collapsed by default; all-4-required gate | `src/components/MvdChecklist.tsx` |
| SalvagePicker | Recovery | Good “Day not dead” copy; career options | `src/components/SalvagePicker.tsx` |
| ProofShelf | Evidence display | Strong empty state copy | `src/components/ProofShelf.tsx` |
| Notice | Toast-like feedback | 3–4s auto-dismiss; no action buttons | `src/components/Notice.tsx` |
| ActiveLimitBanner | Constraint surfacing | Clear warning/info | `src/components/ActiveLimitBanner.tsx` |
| CardTile | Card summary | Warmth badge; NTA visible | `src/components/CardTile.tsx` |

---

## 4. Primary user journeys

### Journey A: First open of the day

**Question:** Does the user immediately know what matters and what to do next?

| Aspect | Assessment |
|--------|------------|
| **Path** | Open `/` → scan Nav → While You Were Away bullets → Primary Objective → Career Pounce (mission + smallest start) → many secondary links → Follow-ups → … |
| **Friction** | No above-the-fold “do this now”; briefing capped at 5 items but competes with banner + nav; static pounce mission may not match briefing suggestion |
| **Missing feedback** | No session greeting; no compact “today status” (pounce done? MVD done?) at top |
| **Opportunities** | Hero strip: one suggested action + one button; collapse career links behind “More career moves” |
| **Severity** | **Critical** |

---

### Journey B: Add/capture an idea or task

**Question:** Is capture low-friction and does the user know where the item went?

| Aspect | Assessment |
|--------|------------|
| **Path** | Scroll to Quick Capture on Today **or** use Career/Candidate Intake from nav |
| **Friction** | Capture not at top; `Log Action` is secondary style; no-match leaves text with info notice only; no examples inline |
| **Missing feedback** | Success message doesn’t always say destination column (Inbox vs log win) |
| **Opportunities** | Sticky capture bar; primary submit; post-success “View in Inbox” link for ideas |
| **Severity** | **High** |

---

### Journey C: Do a pounce mission

**Question:** Is the pounce clear, motivating, and easy to complete?

| Aspect | Assessment |
|--------|------------|
| **Path** | Read Career Pounce section → optionally follow secondary links (Intake/Paste/Queue/Sources) → tap **Pounce** |
| **Friction** | Four secondary links before primary button; Pounce logs initiation without doing mission; button disables after once-per-session with small help text |
| **Missing feedback** | No guided “mark mission complete”; proof pulse only if notice contains “Proof updated” (pounce message uses suffix via `withProofSuffix` — works, but easy to miss in 3s) |
| **Opportunities** | Separate “Start Pounce” vs “Log mission done”; deep link smallest start to relevant screen; show proof item inline after pounce |
| **Severity** | **High** |

---

### Journey D: Recover from being stuck

**Question:** Are MVD/Salvage/recovery actions understandable and emotionally safe?

| Aspect | Assessment |
|--------|------------|
| **Path** | Scroll to bottom Recovery Systems → expand MVD or Salvage → complete |
| **Friction** | Below fold; collapsed; MVD requires all 4 checks (strict); Salvage is one-tap pick (good) |
| **Missing feedback** | Salvage doesn’t confirm which option was logged in proof preview prominently |
| **Opportunities** | Move recovery near briefing when day is “behind”; surface Salvage in briefing link; soften MVD with partial credit messaging |
| **Severity** | **Medium** (copy is good; placement is the issue) |

---

### Journey E: Review progress/proof

**Question:** Does the user feel momentum and trust that effort is accumulating?

| Aspect | Assessment |
|--------|------------|
| **Path** | Today Proof preview (3 items) **or** Progress → Proof Shelf / Weekly XP |
| **Friction** | Progress front-loads scout/source stats; proof is mid-page; Log looks similar to proof |
| **Missing feedback** | No “this week you…” narrative; XP number without emotional context |
| **Opportunities** | Progress opens with proof + weekly wins; demote dev stats to collapsible “Operator details” |
| **Severity** | **High** |

---

### Journey F: Career/job-search momentum

**Question:** Does the app clearly help toward applications, follow-ups, and job leads?

| Aspect | Assessment |
|--------|------------|
| **Path** | Today: Career Pounce + Follow-ups → Intake/Paste/Queue/Sources via nav or inline links |
| **Friction** | Too many paths; runner dependency for sources not obvious on Today; resume bank disconnected from apply flow |
| **Missing feedback** | No unified “application pipeline” view (candidates → inbox apps → waiting → done) |
| **Opportunities** | Single **Career** hub tab with pipeline stages; daily career CTA from briefing only |
| **Severity** | **Critical** (career-first v0.1 goal undermined by scatter) |

---

### Journey G: Ask Harness / AI context

**Question:** Does AI/chat/memory feel connected to the board, or bolted on?

| Aspect | Assessment |
|--------|------------|
| **Path** | Nav → Ask Harness Dev → configure gateway → send → optionally save memory |
| **Friction** | Equal nav weight to Today; no link from card/board to “ask about this”; memories not visible on Today |
| **Missing feedback** | Saved memories don’t surface in briefing |
| **Opportunities** | Secondary entry (settings/dev menu); “Ask about this card” on Card Detail; show recent memory snippet on Today |
| **Severity** | **Medium** (acceptable for dev sandbox; bad if treated as product feature) |

---

## 5. UX friction log

### UX-001: Today lacks a single obvious next action
**Severity:** Critical  
**Impact:** User must read and choose instead of starting; violates &lt;10s “know what to do” principle.  
**Evidence:** `app/index.tsx` stacks 10+ sections with equal `Section` styling; Pounce is primary only within Career Pounce block, not page-level.  
**Likely files:** `app/index.tsx`, `src/components/Section.tsx`, `src/components/styles.ts`  
**Suggested direction:** Above-the-fold “Today’s move” hero combining briefing’s top suggested pounce + one primary button + smallest start.  
**Future acceptance criteria:**
- Opening Today shows one recommended action without scrolling on common viewport heights
- Primary button visually distinct from all secondary links
- Tapping primary starts or deep-links the suggested flow

---

### UX-002: Navigation overload — eleven peer top-level items
**Severity:** Critical  
**Impact:** Career scout tools dominate nav; Board/Progress/Log lose salience; new user cannot form mental model.  
**Evidence:** `Nav.tsx` lists Today, Board, Intake, Paste, Queue, Bank, Sources, Setup, Progress, Log, Ask Harness Dev.  
**Likely files:** `src/components/Nav.tsx`, `app/_layout.tsx`  
**Suggested direction:** 4–5 top-level tabs (Today, Board, Career, Progress, More); nest scout tools under Career.  
**Future acceptance criteria:**
- ≤5 primary nav items visible without wrapping on mobile width ~390px
- Career-related screens reachable in ≤2 taps from Career hub
- Ask Harness not in primary nav

---

### UX-003: Quick Capture buried and de-emphasized
**Severity:** High  
**Impact:** Central product interaction competes with summaries; “one input box” thesis weakened.  
**Evidence:** Quick Capture is section 8 on Today; `QuickCapture.tsx` uses `secondaryAction` for submit and label “Report”.  
**Likely files:** `app/index.tsx`, `src/components/QuickCapture.tsx`  
**Suggested direction:** Sticky top or bottom capture bar; rename to “Capture”; primary submit; show parse hints.  
**Future acceptance criteria:**
- Capture visible on Today without scrolling
- Submit uses primary action styling
- Success notice states outcome (e.g. “Added to Inbox: …”)

---

### UX-004: Pounce completion semantics unclear
**Severity:** High  
**Impact:** User may believe Pounce finished the mission; motivation gap after click.  
**Evidence:** `applyPounce` logs “Started career pounce” proof; button disables after one tap; mission text remains static (`src/core/actions.ts`, `app/index.tsx`).  
**Likely files:** `app/index.tsx`, `src/core/actions.ts`, `docs/career-command-board-v0.1.md`  
**Suggested direction:** Rename button to “Start Pounce” / “Log pounce start”; add optional “Done with pounce” proof; inline proof card.  
**Future acceptance criteria:**
- UI copy explains pounce = starting, not finishing
- User sees proof item immediately after pounce without hunting
- Clear next step after pounce (e.g. open Paste)

---

### UX-005: Briefing suggestion vs Career Pounce block can disagree
**Severity:** High  
**Impact:** User sees conflicting “what to do” signals.  
**Evidence:** Briefing `prepared` lines computed in `briefing.ts` (career cold → paste job; due sources → run sources; etc.) while UI shows fixed `dailyState.pounceMission` / `smallestStart` from seed (`seed.ts`).  
**Likely files:** `src/core/briefing.ts`, `app/index.tsx`, `src/data/seed.ts`  
**Suggested direction:** Single source of truth for displayed pounce mission; sync dailyState from briefing on session start.  
**Future acceptance criteria:**
- Career Pounce section headline matches top briefing suggested pounce
- Smallest start updates when suggestion changes

---

### UX-006: Progress screen is an operator dashboard, not a momentum view
**Severity:** High  
**Impact:** User checking “am I making progress?” wades through scout metrics and JSON tools.  
**Evidence:** `progress.tsx` opens with Approved Source Fetching + Job Scout Foundation before Weekly XP/Proof.  
**Likely files:** `app/progress.tsx`  
**Suggested direction:** Reorder: Proof Shelf → Weekly XP → Career stats → warmth → collapsible “Scout operator panel”.  
**Future acceptance criteria:**
- First screenful emphasizes proof and XP
- Export/import/reset under “Advanced / Local data” collapsed by default

---

### UX-007: Career workflow split across Intake / Paste / Queue
**Severity:** High  
**Impact:** User must learn two intake paths and a queue without onboarding.  
**Evidence:** Separate nav labels “Intake” and “Paste”; README dogfood lists both; screens use different intros.  
**Likely files:** `app/career-intake.tsx`, `app/candidate-intake.tsx`, `app/job-candidates.tsx`, `README.md`  
**Suggested direction:** One “Add job” flow with “Quick apply card” vs “Review in queue first” fork at start.  
**Future acceptance criteria:**
- New user can add a job in one flow with explicit path choice
- Nav does not show two ambiguous intake labels

---

### UX-008: MVD and Salvage hidden at bottom, collapsed
**Severity:** Medium  
**Impact:** Recovery tools not visible when user feels behind (often early in session).  
**Evidence:** `Recovery Systems` last section; `MvdChecklist`/`SalvagePicker` default `open=false`.  
**Likely files:** `app/index.tsx`, `src/components/MvdChecklist.tsx`, `src/components/SalvagePicker.tsx`  
**Suggested direction:** Show Salvage chip in briefing when salvage suggested; expand recovery when MVD not done and time is late (rules-only).  
**Future acceptance criteria:**
- Salvage reachable in one tap from first screenful when briefing mentions salvage
- MVD state visible (not done / done) without expanding

---

### UX-009: Log vs Proof distinction weak for users
**Severity:** Medium  
**Impact:** Two history views; user may not know which to trust for “evidence.”  
**Evidence:** Log = raw entries; Proof = curated shelf; both accessible from nav with similar weight.  
**Likely files:** `app/log.tsx`, `src/components/ProofShelf.tsx`, `app/progress.tsx`  
**Suggested direction:** Log labeled “Debug/history”; link from Proof to Log only in advanced area.  
**Future acceptance criteria:**
- Product copy on Progress explains proof vs log in one sentence
- Log not in primary nav for v0.1 user mode

---

### UX-010: Card Detail overwhelming; raw state labels
**Severity:** Medium  
**Impact:** Resuming a project requires scrolling many sections; `waiting` shown raw in meta line.  
**Evidence:** `card/[id].tsx` — 8+ sections; meta uses `card.state` not `CARD_STATE_LABELS`.  
**Likely files:** `app/card/[id].tsx`  
**Suggested direction:** Progressive disclosure: “Resume” panel first; collapse Plans/Optimization by default.  
**Future acceptance criteria:**
- Re-entry action + NTA visible without scrolling on typical viewport
- All user-facing states use human labels

---

### UX-011: Job Sources runner dependency under-explained on Today
**Severity:** Medium  
**Impact:** User taps “Run Due Job Sources” from Today, fails silently/confusingly without runner.  
**Evidence:** README requires `npm run scout:runner`; Today link does not surface prerequisite.  
**Likely files:** `app/index.tsx`, `app/job-sources.tsx`, `README.md`  
**Suggested direction:** Inline prerequisite banner on Sources and Today career links when runner unreachable.  
**Future acceptance criteria:**
- User sees actionable message if runner is down before attempting run
- Link to README/setup steps

---

### UX-012: Ask Harness in primary nav
**Severity:** Medium  
**Impact:** Feels bolted on; exposes dev JSON/sensitivity controls to daily flow.  
**Evidence:** `Nav.tsx` includes Ask Harness Dev as peer to Today.  
**Likely files:** `src/components/Nav.tsx`, `app/ask-harness.tsx`  
**Suggested direction:** Move under “Dev tools” or overflow menu; entry from Card Detail context.  
**Future acceptance criteria:**
- Primary nav excludes dev-only surfaces
- Card-level “Ask about this” pre-fills context

---

### UX-013: Board horizontal scroll discoverability
**Severity:** Low  
**Impact:** Users may not find Parked/Waiting/Done columns.  
**Evidence:** `board.tsx` help text says “Swipe sideways” but implementation is horizontal `ScrollView`.  
**Likely files:** `app/board.tsx`  
**Suggested direction:** Visible scroll hint or column tabs; fix copy to “scroll sideways”.  
**Future acceptance criteria:**
- User can reach Parked column without guessing
- Copy matches interaction (scroll vs swipe)

---

### UX-014: Ephemeral notices too brief for proof rewards
**Severity:** Low  
**Impact:** XP/proof feedback easy to miss (3s timeout).  
**Evidence:** `index.tsx` notice timer 3000ms; proof pulse conditional on message substring.  
**Likely files:** `app/index.tsx`, `src/components/Notice.tsx`  
**Suggested direction:** Longer dismiss for proof events or persistent “last win” chip.  
**Future acceptance criteria:**
- Proof-generating actions leave visible evidence on screen &gt;10s or until next action

---

### UX-015: Accessibility — nav and tap targets
**Severity:** Medium  
**Impact:** Small uppercase nav pills; limited `accessibilityRole` usage outside links.  
**Evidence:** `navButton` padding ~10px vertical; many `Pressable` without roles/labels.  
**Likely files:** `src/components/styles.ts`, `src/components/Nav.tsx`  
**Suggested direction:** Min 44px touch targets; `accessibilityLabel` on icon-less buttons.  
**Future acceptance criteria:**
- Primary actions meet 44×44pt minimum
- Screen reader announces section headings and button purpose

---

## 6. Information architecture critique

| Question | Assessment |
|----------|------------|
| **Screens named clearly?** | Mixed. Board/Progress/Log are clear. “Intake” vs “Paste” vs “Queue” is jargon-heavy. “Primary Objective” ≠ design doc “Main Quest”. |
| **Navigation vs mental model?** | Misaligned. User thinks: today / my projects / job search / proof. App offers: today / board / 6 career tools / progress / log / AI dev. |
| **Today too crowded?** | Yes. Combines briefing, quest, career ops, capture, active list, recovery, proof — should be split into focal vs secondary layers. |
| **Board / Progress / Log distinct?** | Board = yes. Progress ≈ dashboard + proof (blurred). Log = raw history (should be tertiary). |
| **Future AI placement?** | Ask Harness Dev proves context export; primary nav placement will not scale. Needs contextual entry + approval/transparency surfaces. |
| **Top-level vs secondary?** | **Should be top-level:** Today, Board, Career (hub), Progress. **Secondary:** Sources, Setup, Bank, Ask Harness, Log, Local data tools. |

---

## 7. Visual hierarchy critique

| Dimension | Current state | Problem / opportunity |
|-----------|---------------|----------------------|
| **First attention** | Nav row (11 pills) and first section title | Nav steals focus from mission |
| **Primary action obvious?** | Pounce is primary only inside Career block; capture/recovery secondary | No page-level primary CTA |
| **Consistency** | Section cards consistent; button tiers (primary/secondary/small) used logically but overused as secondary | Too many secondary buttons look equally important |
| **Equal-weight information** | All `Section` components share same border/background except few accents | Everything feels mandatory |
| **Motivating vs cluttered** | Warm copy in salvage/MVD; brass theme cohesive | Clutter from volume, not from ornament |

**Field Ops theme** is a strength—future redesign should keep restraint and upgrade hierarchy, not replace the palette.

---

## 8. Copy/tone critique

| Term / area | Clarity | Notes |
|-------------|---------|-------|
| **Pounce** | Low | Not explained; “Career Pounce” helps slightly |
| **Proof / Proof Shelf** | Medium | Good empty state; shelf metaphor unexplained |
| **MVD** | Low | Spelled out on button only when expanded |
| **Salvage** | Medium | “Day not dead” is excellent, shame-free tone |
| **Warmth** | Low | Hot/Warm/Cold badges without legend |
| **Quick Capture “Report”** | Poor | Sounds like bug reporting, not logging |
| **While You Were Away** | High | Clear, alive, on-brand |
| **Parked** | High | Board intro explains safe-not-failed |
| **Fit score disclaimer** | High | Honest, manages expectations |

**Tone overall:** Warmth-without-guilt is present in salvage/briefing copy. Operator/dashboard sections drift technical (“Approved Source Fetching”, “Use-Before-Improve Locks”). Career intake intros are clear but repetitive across screens.

**Microcopy gaps:** No first-run glossary; no inline examples for capture patterns; session counters (pounce logged) easy to miss.

---

## 9. Executive-function fit

| Criterion | Rating | Evidence |
|-----------|--------|----------|
| **Reduces decisions?** | Partial | Active limit helps; too many nav/path choices hurt |
| **Makes starting easier?** | Partial | Smallest start text exists; not paired with one obvious button |
| **Helps after failure/absence?** | Good | Briefing + salvage + MVD + no guilt copy |
| **Avoids shame?** | Good | No streaks; “parked safe”; salvage framing |
| **Prevents overload?** | Partial | 3 active cap enforced; Today UI overloads |
| **Rewards tiny wins?** | Partial | XP notices + proof; easy to miss |

**Scope-creep risk for Nick:** Progress locks and scout stats may trigger “optimize the system” instead of applying. Use-before-improve is correct product-side; UX should hide locks until near-unlock.

---

## 10. Career-first fit

| Criterion | Met? | Gap |
|-----------|------|-----|
| Job leads visible | Partial | Queue/Sources exist; not unified on Today |
| Clear daily career action | Partial | Pounce mission + briefing; diluted by links |
| Applications/follow-ups next | Partial | Follow-ups section good; no pipeline view |
| Resume/project proof → job execution | Weak | Resume bank isolated; card career fields rich but not action-linked |
| v0.1 career usefulness | Partial | Mechanics strong; IA scatters user |

**Missing for career-first v0.1:**
- Single **Apply today** strip (one follow-up OR one paste OR one source review)
- Application pipeline counts (e.g. “2 inbox · 1 waiting · 1 due”)
- Post-apply proof prompt tied to application cards
- Clear “what Nick should do before noon” vs “operator maintenance”

---

## 11. Future AI/agent readiness

### What already scales

- `harnessContext.ts` — structured export (full/compact), quality summary, sensitivity levels
- `harnessMemory.ts` — chat summaries with patterns/decisions
- Card resume packets + proof shelf — agent resumption context
- Job scout run logs + candidate origins — agent audit trail seeds
- Use-before-improve locks — manual-before-automation UX pattern

### What UI should eventually expose

| Need | Current state | Gap |
|------|---------------|-----|
| What system knows | Context preview in Ask Harness only | Not on Today/Board |
| What agents did | Job source runs in Progress stats | No user-facing “agent activity” timeline |
| Context used | `used_context` in harness response | Not shown outside Ask Harness |
| What needs approval | Candidate approve flow | No generic approval queue for future agents |
| What changed | While You Were Away | Good start; no diff-style “since last session” |

**Codex/Cursor handoff:** Card Detail + resume packet + context export are the right primitives; need a “copy context for agent” action on cards, not a separate dev screen.

**Local model sidecar:** Compact context mode and char counts in Ask Harness are forward-looking; should move to settings, not daily nav.

---

## 12. Accessibility and responsiveness

| Area | Findings |
|------|----------|
| **Mobile usability** | Single-column scroll works; nav wraps to many rows; Board horizontal scroll OK on touch |
| **Tap targets** | Nav pills and small buttons may be &lt;44px; primary actions OK |
| **Text density** | Card Detail and Progress are text-heavy; line heights reasonable |
| **Contrast** | Brass on dark olive generally readable; muted help text (`textMuted` ~35% opacity) may fail WCAG for small text |
| **Keyboard** | Web: capture supports `onSubmitEditing`; no skip links |
| **Screen reader** | Some `accessibilityRole="link"`; most buttons unlabeled; sections not headings (Text not Header) |
| **Empty states** | Present and italic-muted — consistent |
| **Error/loading** | Ask Harness has loading spinner; source runs use notices; no global loading for persistence hydrate |
| **Responsive** | `flexWrap` used; no breakpoint-specific layouts; wide desktop = long line lengths |

---

## 13. UX debt backlog

| Rank | Issue | Severity | Effort | Impact | Suggested future task |
|------|-------|----------|--------|--------|----------------------|
| 1 | No single obvious next action on Today | Critical | Medium | High | Today hero + primary CTA redesign |
| 2 | Nav has 11 peer items | Critical | Medium | High | IA collapse: Career hub + More menu |
| 3 | Quick Capture buried/de-emphasized | High | Small | High | Sticky capture bar + copy fix |
| 4 | Career paths fragmented (Intake/Paste/Queue) | High | Medium | High | Unified “Add job” flow |
| 5 | Pounce semantics unclear | High | Small | High | Start vs complete copy + inline proof |
| 6 | Briefing vs pounce mission mismatch | High | Medium | High | Sync daily pounce display to briefing |
| 7 | Progress dashboard ordering | High | Small | Medium | Reorder Progress for momentum-first |
| 8 | MVD/Salvage below fold | Medium | Small | Medium | Recovery strip near top when suggested |
| 9 | Log vs Proof nav confusion | Medium | Small | Medium | Demote Log; clarify proof |
| 10 | Ask Harness in primary nav | Medium | Small | Medium | Move to dev/overflow |
| 11 | Card Detail density | Medium | Medium | Medium | Progressive disclosure on card |
| 12 | Runner prerequisite invisible | Medium | Small | Medium | Runner status banner |
| 13 | Board scroll copy wrong | Low | Small | Low | Fix swipe→scroll hint |
| 14 | Notice duration too short | Low | Small | Low | Persistent proof chip |
| 15 | a11y tap targets/labels | Medium | Medium | Medium | a11y pass on primary flows |

---

## 14. Recommended redesign principles

1. **One obvious next action per screen** — Today must answer “the move” in one glance.
2. **Capture is always one tap away** — sticky, primary-styled, with outcome feedback.
3. **Career is a hub, not six nav items** — pipeline mental model: discover → queue → apply → follow up.
4. **Proof before stats** — user-facing progress leads with evidence; operator metrics collapsed.
5. **Recovery is safe and nearby when suggested** — salvage/MVD surface in briefing context, not footer graveyard.
6. **Initiation ≠ completion** — pounce/start actions use distinct language and proof types.
7. **Briefing and mission stay in sync** — one source of truth for suggested pounce/smallest start.
8. **Dev/agent tools are contextual, not daily** — Ask Harness, JSON export, setup wizards off critical path.
9. **Preserve warmth, lose clutter** — keep Field Ops tone; reduce equal-weight sections.
10. **Explain jargon once, then use it** — inline micro-glossary or first-run tooltips for pounce/proof/MVD/warmth.

---

## 15. Suggested future UX redesign plan

### Phase 1: Clarity and hierarchy on existing screens
**Goal:** Make Today usable in &lt;10 seconds without removing features.

**Likely tasks:**
- Add Today hero (briefing top pick + primary CTA + smallest start)
- Reorder Today sections: hero → capture → follow-ups → active summary → recovery → proof preview
- Sticky Quick Capture; rename Report → Capture; primary submit
- Demote career links to “More career moves” accordion
- Fix briefing/pounce mission sync
- Reorder Progress: proof/XP first; scout/local data collapsed

**Acceptance criteria:**
- Dogfood checklist items 1–3 pass without scrolling on 768px height viewport
- User can log capture and pounce with clear proof feedback in-session
- Nav ≤5 primary items

---

### Phase 2: Career-first flows
**Goal:** Job search feels like the main quest, not a side menu.

**Likely tasks:**
- Career hub screen with pipeline stages and counts
- Unified Add Job entry (direct card vs queue-first)
- Today “Apply today” module (due follow-up | paste job | review candidate)
- Runner status component on career actions
- Resume bank links from candidate fit review → suggested modules

**Acceptance criteria:**
- README dogfood loop completable with Career hub only (no hunting Setup/Sources labels)
- User sees due follow-ups and inbox application count on Today
- New job added in &lt;60s from Career hub

---

### Phase 3: Proof, progress, and recovery feedback
**Goal:** Effort feels cumulative; bad days feel recoverable.

**Likely tasks:**
- Persistent “last proof” chip on Today after wins
- Weekly narrative block on Progress (rules-only templated copy)
- Salvage/MVD visibility rules tied to briefing
- Log screen demoted; Proof shelf gets “view all” from Today
- Pounce start/complete two-step with distinct proof titles

**Acceptance criteria:**
- After any proof-generating action, user sees proof item without opening Progress
- MVD/Salvage discoverable in one tap when briefing suggests salvage
- User reports “I can tell the app noticed I showed up” in dogfood

---

### Phase 4: IA for Ask Harness and agent features
**Goal:** AI/agent capabilities feel attached to cards and career moves.

**Likely tasks:**
- Remove Ask Harness from primary nav; add Dev menu
- Card Detail: “Copy resume packet for agent” / “Ask Harness about this card”
- Surface recent chat memories in briefing (1 bullet max)
- Agent activity section stub (source runs, approvals) on Career hub
- Context transparency chip: what was sent, sensitivity, compact/full

**Acceptance criteria:**
- Primary nav stable at v0.1 user set (Today, Board, Career, Progress)
- Agent context actions available from Card Detail and Career hub
- No daily workflow requires opening Ask Harness Dev

---

## Appendix: Validation commands

```bash
npm run typecheck   # pass
npm run test        # pass (203 tests)
```

## Appendix: Code was changed?

**No product code was changed.** This audit added only `docs/ux/current_ux_audit.md` (and created `docs/ux/`).
