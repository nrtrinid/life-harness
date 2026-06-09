# First Codex Prompt

Paste this into Codex from an empty `life-harness/` folder.

```text
You are starting a new project called Life Harness.

Before coding, produce a concise implementation plan, then execute it.

Project thesis:
Life Harness is an alive, low-friction executive-function board that helps the user become more put together by making the next useful action obvious, small, urgent, rewarding, and recoverable.

It is NOT a generic to-do app, Notion clone, habit tracker, or full AI agent system.

v0.1 goal:
Create a cross-platform Expo + React Native + TypeScript app skeleton that works on phone and web, using seed data only. The app should demonstrate the core product loop without Supabase, AI, auth, notifications, or integrations yet.

Core v0.1 loop:
Open app -> see Today -> read While You Were Away -> see one Pounce Mission -> click Pounce -> log one sentence -> see Proof Shelf / XP / warmth update -> use Minimum Viable Day or Salvage Mode if behind.

Tech constraints:
- Use Expo + React Native + TypeScript.
- Use Expo Router if appropriate.
- Use local seed data/state only for v0.1.
- Keep the UI ugly but usable.
- Create portable core logic in a separate package/folder if practical.
- Do not add Supabase implementation yet.
- Do not add AI implementation yet.
- Do not add local LLM, OpenVINO, llama.cpp, IPEX-LLM, Ollama, or A770-specific code.
- Do not add notifications, auth, mobile widgets, calendar sync, GitHub sync, spending imports, or cloud functions.
- Do not add new product concepts beyond what is specified.

Create these project docs:
1. AGENTS.md
2. docs/design.md
3. docs/v0.1.md
4. docs/product-rules.md
5. docs/future-ai-provider-abstraction.md

AGENTS.md should include:
- Product mission.
- Non-negotiable v0.1 constraints.
- UX rules.
- No new major concepts rule.
- Manual before automation rule.
- The system can prepare; the user approves rule.
- The Intel Arc A770 is a future optional local AI provider, not a v0.1 dependency rule.
- Requirement that future AI behavior must go through a provider abstraction.
- Requirement that sensitive data must not be sent to cloud AI without explicit future user configuration.
- Agent workflow: read docs, make smallest change, run checks, summarize.

Core life areas:
- Build
- Body
- Money / Independence
- Social / Career
- Stability / Vices

Card states:
- Inbox
- Active
- Parked
- Waiting
- Done
- Killed

Warmth states:
- Hot
- Warm
- Cooling
- Cold
- Dormant

Seed cards:
1. EV Tracker / Kalshi
   Area: Build
   State: Active
   Progress: 72
   Warmth: Hot
   Next tiny action: Review one market and write a fair-value note.

2. Text RPG
   Area: Build
   State: Active
   Progress: 62
   Warmth: Warm
   Next tiny action: Write one enemy behavior test.

3. Fitness Return
   Area: Body
   State: Active
   Progress: 20
   Warmth: Cooling
   Next tiny action: Walk 10 minutes or do one small lift session.

4. Career / Networking
   Area: Social / Career
   State: Parked
   Progress: 15
   Warmth: Cold
   Next tiny action: Send one follow-up message.

5. Life Harness
   Area: Build
   State: Active
   Progress: 10
   Warmth: Hot
   Next tiny action: Scaffold v0.1 app.

6. Local LLM Setup
   Area: Money / Independence
   State: Parked
   Progress: 15
   Warmth: Dormant
   Next tiny action: Pick one use case before researching models.

7. Haircut Setup
   Area: Money / Independence
   State: Parked
   Progress: 5
   Warmth: Dormant
   Next tiny action: List starter tools.

8. Music Production
   Area: Build
   State: Inbox
   Progress: 0
   Warmth: Cold
   Next tiny action: Capture first small project idea.

Build these screens:

1. Today screen
Must include:
- While You Were Away briefing
- Main Quest
- Pounce Mission
- Smallest Start
- Pounce button
- Minimum Viable Day button
- Salvage Mode button
- Active cards summary
- Quick Capture input

Example briefing:
While You Were Away:
- EV Tracker / Kalshi is hot.
- Career / Networking is cold.
- Local LLM Setup is dormant.
- Active cards are 4/3. Park one soon.
- Suggested pounce: scaffold Life Harness v0.1.

2. Board screen
Columns:
- Inbox
- Active
- Parked
- Waiting
- Done
- Killed

Each card should show:
- title
- area
- progress
- warmth
- next tiny action
- last touched if available

No drag-and-drop required. Buttons are fine:
- Activate
- Park
- Waiting
- Done
- Kill

Enforce active limit:
- Max active cards: 3
- If activating a fourth card, show a warning and do not activate it.

3. Progress screen
Must show:
- Quest progress bars
- Identity scores / simple category bars
- Momentum warmth by card
- Weekly XP totals from seed logs
- Proof Shelf
- Pounce sessions count
- Salvage wins count

Identity categories:
- Builder
- Operator
- Body
- Social / Career
- Self-Sufficient
- Stable

4. Log screen
Must show:
- raw log entries
- timestamp
- area
- linked card
- XP
- type

5. Card detail screen
Must show:
- why it matters
- next tiny action
- done-for-now
- do lane
- improve lane
- trigger plan
- obstacle plan
- resume packet
- open loops
- optimization ideas
- recent wins

Core interactions to implement with local state:
1. Pounce button
- On click, log +10 Initiation XP.
- Increment pounce session count.
- Add proof item: Started pounce mission.

2. Minimum Viable Day button
On click, show/check these actions:
- Eat something real.
- Move 10 minutes.
- Send one message OR open one project for 10 minutes.
- Write tomorrow's first move.
When completed, log +30 Rescue XP and add proof item: Preserved the day.

3. Salvage Mode button
Show options:
- 10-minute walk
- send one text
- open repo for 10 minutes
- eat something real
- write tomorrow's first move
When one is selected, log +30 Rescue XP and add proof item: Used Salvage Mode.

4. Quick Capture
Implement simple rule-based parsing:
- starts with "new idea:" -> create Inbox card
- contains "worked on", "coded", "built" -> Build win
- contains "walked", "lifted", "ran", "ate" -> Body win
- contains "texted", "emailed", "applied", "follow-up" -> Social / Career win
- contains "bought", "$", "subscription" -> Money / Stability log
- contains "park" -> attempt to park matching card by title substring

After logging, update:
- log list
- proof shelf if appropriate
- linked card last touched
- weekly XP totals

5. Proof Shelf
Collect real evidence, not streaks.
Examples:
- Started pounce mission.
- Worked on Text RPG.
- Used Salvage Mode.
- Parked project cleanly.
- Captured new idea without activating it.

6. Momentum Warmth
Implement a simple helper:
- Hot, Warm, Cooling, Cold, Dormant
For v0.1, this can be seed/manual plus basic update when a card is touched.

7. Do vs Improve Split
Every card detail should show:
- Do the thing
- Improve the system
This is to prevent over-optimization.

8. Use-before-improve locks
Create a small locked features section showing:
- AI classification locked until 20 manual logs.
- GitHub integration locked until 10 manual Build logs.
- Calendar integration locked until 7 pounce sessions.
- Resume automation locked until 5 manual career actions.
These are display-only in v0.1.

Suggested file structure:
life-harness/
  AGENTS.md
  docs/
    design.md
    v0.1.md
    product-rules.md
    future-ai-provider-abstraction.md
  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/[id].tsx
  src/
    components/
    data/
      seed.ts
    core/
      types.ts
      scoring.ts
      warmth.ts
      parsing.ts
      guards.ts
      proof.ts
      briefing.ts

Acceptance criteria:
- App runs.
- TypeScript passes.
- Today screen renders seed data.
- Board screen groups cards by state.
- Active limit is enforced.
- Pounce button logs Initiation XP and proof.
- Minimum Viable Day logs Rescue XP and proof.
- Salvage Mode logs Rescue XP and proof.
- Quick Capture can add a new Inbox idea.
- Quick Capture can log a simple Build/Body/Social/Money event.
- Progress screen shows bars, warmth, XP, and Proof Shelf.
- Card detail shows Do vs Improve, next tiny action, and resume packet fields.
- No backend, AI, auth, notifications, or integrations are added.
- Final response summarizes what was built, commands run, and how to start the app.

Important:
Make the smallest useful version. Do not overbuild. Do not add features outside this prompt.
```
