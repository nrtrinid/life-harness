# Agent Cross-Repo Audit

Date: 2026-06-23  
Authority: portable contract in [`STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md`](STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md)  
Log: [`agent-cross-repo-audit-log.md`](agent-cross-repo-audit-log.md)

## When to audit

- Quarterly (or after any agent-ergonomics phase lands in a repo).
- Before a cross-repo agent session that spans multiple codebases.
- After adding a new advertised preflight/doctor/test-selector command.

**Automated:** `npm run audit:agent-ergonomics` (life-harness only in CI).  
**Manual full pass:** `npm run audit:agent-ergonomics -- --all` when sibling repos exist locally.

## Portable contract (judge by pattern, not identical scripts)

| Surface | What to verify |
|---------|----------------|
| Entrypoint | Root `AGENTS.md` or documented equivalent |
| Task router | `docs/AGENT_CONTEXT_MAP.md` with task blocks |
| Preflight | Read-only first command; works on clean tree |
| Doctor / drift | Freshness or script-claims check exists |
| Changed → tests | Advisory test routing for touched files |
| No-touch | `.agentignore` or explicit `DO_NOT_READ` / no-touch section |
| Handoff | `Changed / Tests / Docs / Risks / Did not touch / Next safe step` documented |

## Repo command profiles

| Repo | Root path (local default) | Entrypoint | Preflight | Doctor | Test select |
|------|-------------------------|------------|-----------|--------|-------------|
| life-harness | `.` | `AGENTS.md` | `npm run agent:preflight` | `check:agent-budget`, `check:agent-commands` | `agent:tests-for`, `agent:auto-check` |
| text-adventure | `../text-adventure/dungeon-party-game` | `AGENTS.md` | `.\rtk.ps1 preflight` | folded into preflight + `.\rtk.ps1 boundaries` | `.\rtk.ps1` test paths |
| ev-tracker | `../ev-tracker` | `README.md`, `docs/CODEX_HANDOFF.md` | `python scripts/agent_preflight.py` | `python scripts/agent_doctor.py` | `python scripts/agent_test_select.py` |

Sibling roadmaps: text-adventure `docs/STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md`; ev-tracker `docs/AGENT_ERGONOMICS_PLAN.md`.

Life Harness extras (skills, review-packet, full `agent:*` suite) are **optional** in other repos.

## Audit questions (pass / partial / fail)

1. **First command on clean and dirty trees** — Preflight exits 0 and prints git/task/test hints. Partial: works clean only. Fail: missing or crashes.
2. **Context map routes narrowly** — Task blocks list READ_FIRST, VERIFY, boundaries. Partial: blocks exist but vague. Fail: no router.
3. **No-touch paths explicit** — `.agentignore` or map section names default no-read zones. Fail: silent broad-read.
4. **Handoff shape consistent** — Entrypoint or map documents the six-part handoff. Partial: partial list. Fail: absent.
5. **Extras documented optional** — Repo does not require Life Harness-only tooling. Fail: docs imply npm `agent:*` is required everywhere.

## Manual checklist (not fully automated)

- Spot-read one task block: does READ_FIRST stay narrow?
- Confirm VERIFY commands match the repo's real runner (`npm`, `rtk.ps1`, `pytest`).
- Confirm boundary-sensitive areas name the right check (`check:boundaries`, `rtk.ps1 boundaries`, doctor dangers).
- Note sibling gaps in the audit log (e.g. text-adventure Phase 4 freshness).

## Scorecard template

```text
Repo:
Date:
Auditor:
Result: PASS | PARTIAL | FAIL

| Surface | Status | Evidence |
|---------|--------|----------|
| Entrypoint | | |
| Context map | | |
| Preflight | | |
| Doctor | | |
| Test select | | |
| No-touch | | |
| Handoff | | |

Notes:
Next safe step:
```

## Record results

Add a row to [`agent-cross-repo-audit-log.md`](agent-cross-repo-audit-log.md) after each audit.
