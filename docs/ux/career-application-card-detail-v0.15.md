# Career Application Card Detail UX v0.15

## Problem

After **Start application**, card detail showed the full generic card inspector plus duplicate resume blocks and agent dev tooling above the fold. Users needed one path: fix readiness → export DOCX → apply manually.

## Target layout

When `card.careerApplication` is set, [`app/card/[id].tsx`](../../app/card/[id].tsx) renders [`CareerApplicationCardDetail`](../../src/components/career/CareerApplicationCardDetail.tsx) instead of Act/Backroom. Inline [`ApplicationResumeModulePicker`](../../src/components/career/ApplicationResumeModulePicker.tsx) toggles `resumeDraftPacket.selectedModuleIds` (see selected module → section coverage in [`career-v0.1-pipeline.md`](../career-v0.1-pipeline.md)). [`ResumeModulePatchSheet`](../../src/components/career/ResumeModulePatchSheet.tsx) closes the patch-gap loop (date / bullet / skill / proof) on the card and in Resume Bank. Jobs **Apply** tab CTAs mirror [`deriveApplicationResumePrimaryAction`](../../src/core/applicationResumeAction.ts) from card detail.

| Zone | Default | Contents |
|------|---------|----------|
| **Resume next** | Open | Status, next fix, Build DOCX, Resume Bank / Career Pack |
| **Header** | Open | Company — role, status chips, follow-up, state buttons |
| **Next tiny action** | Open | `nextTinyAction` + `doneForNow` |
| **Resume details** | Closed | Selected modules, up to 5 warnings |
| **Posting and angle** | Closed | URL, angle, bullets, JD (expandable) |
| **Board extras** | Closed | Do/Improve, plans, wins, parking lot, proof |
| **Agent tools** | Closed | Copy context/packet, project metadata, agent sessions |

## Components

- [`ResumeNextStrip`](../../src/components/career/ResumeNextStrip.tsx) — hero strip
- [`CareerApplicationCardDetail`](../../src/components/career/CareerApplicationCardDetail.tsx) — application layout
- [`CardAgentToolsSection`](../../src/components/card/CardAgentToolsSection.tsx) — shared agent/project UI (`sections` for build cards, `embedded` inside Agent tools collapsible)

## Dedup rules

- One **Build Resume DOCX** control (in Resume next only)
- No linked candidate ID in UI
- No duplicate Selected Modules / Packet Patches sections
- Readiness logic unchanged in [`resumeReadiness.ts`](../../src/core/resumeReadiness.ts)

## Non-goals

- No schema or export rule changes
- Build/non-application cards keep the previous generic detail layout

## Related

- [`career-v0.1-pipeline.md`](../career-v0.1-pipeline.md) — Resume stage
- [`career-job-board-ux-v0.13.md`](../career-job-board-ux-v0.13.md) — Jobs board tabs
