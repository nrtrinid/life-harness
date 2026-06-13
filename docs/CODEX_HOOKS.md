# Codex Hooks

**Status:** Optional local Codex guardrails.

Life Harness uses a tiny project-local hook layer to prevent expensive agent mistakes and nudge agents toward deterministic repo scripts. These hooks require trust review in Codex before running.

## Hooks

- `PreToolUse` for Bash blocks dependency installation unless explicitly allowed.
- `PreToolUse` blocks bulk staging or commit commands such as `git add .`, `git add -A`, `git commit -a`, and `git commit --all` unless explicitly allowed.
- `PreToolUse` blocks direct dumps of known large default-read traps such as compiled context docs, current UX audit, large planning docs, and `package-lock.json` unless explicitly allowed.
- `PreToolUse` warns on broad test commands such as `npm run test` and `npm run verify`, pointing agents to compact wrappers.
- `Stop` asks for one concise final checklist when files changed and the final response is vague.

## Smoke Test

Run:

```bash
npm run codex:hooks:smoke
```

## Overrides

- `LIFE_HARNESS_ALLOW_DEP_CHANGE=1`
- `LIFE_HARNESS_ALLOW_BULK_GIT=1`
- `LIFE_HARNESS_ALLOW_LARGE_READ=1`

Use overrides only when the task explicitly scopes that risk, and call it out in the final response.

## Agent Commands Still Matter

Hooks are guardrails, not replacements for:

```bash
npm run agent:bootstrap
npm run agent:impact
npm run agent:review-packet
npm run check:boundaries
```

## Local Control

Review or disable hooks through the Codex `/hooks` trust/review UI. If the local tool supports project config disabling, remove or disable `.codex/hooks.json` for that local session.
