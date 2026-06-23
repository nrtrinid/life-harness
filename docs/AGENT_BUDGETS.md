# Agent Budgets

Life Harness should answer coding-agent questions cheaply. Agents should have a small first move, a clear router, bounded generated maps, and compact failure output instead of needing to read the whole repo.

## Guardrails

- Root `AGENTS.md` should stay short and stable. It is a router and hard-rules file, not a product encyclopedia.
- Skills should be concise workflow launchers. They should not copy long docs or the full architecture.
- Generated maps should be bounded by default, with explicit opt-in flags for larger output.
- Default-read docs should be current, short, and status-marked.
- Archived, planning, historical, compiled, fixture, and sample-output docs are not default-read.
- Future output-diet scripts should write full terminal logs to disk while showing compact summaries to agents.

## Initial Budgets

These are guardrails, not perfect laws. The checker enforces only the budgets it can verify deterministically.

| Item | Target |
|------|--------|
| Root `AGENTS.md` | <= 150 lines |
| Each `.agents/skills/**/SKILL.md` | <= 120 lines once skills exist |
| `docs/AGENT_CONTEXT_MAP.md` | <= 400 lines |
| Default `agent:preflight` output | <= 200 lines |
| Generated repo maps | <= 300 lines once implemented |
| Default-read docs | Avoid or status-review files over 15 KB |

## Default Agent Flow

1. Run `npm run agent:preflight`.
2. Read root `AGENTS.md` if present.
3. Use `docs/AGENT_CONTEXT_MAP.md`.
4. Prefer targeted search, symbol summaries, impact maps, and narrow tests.
5. Do not start RTK, Redux, runtime app, persistence, or Raw Lab streaming work unless the ticket explicitly asks for it.

Bootstrap compatibility: if you need the old bootstrap-style repo orientation, run `npm run agent:preflight -- --bootstrap`.

## Output Policy

Agent-facing commands should print compact summaries by default:

- command run
- pass/fail
- first relevant failure
- likely file or test
- suggested narrow rerun
- path to full raw log when a wrapper creates one

Human-facing commands such as `npm run test` and `npm run typecheck` should remain available unchanged.
