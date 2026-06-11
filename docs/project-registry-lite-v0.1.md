# Project Registry Lite v0.1

## What this adds

Project Registry Lite is a minimal metadata layer anchored to `LifeCard.id`. Each card may have at most one optional `HarnessProject` row with:

- repo path and branch
- docs paths
- likely files
- verification commands
- notes

Card Detail exposes a **Project metadata** section with Save and Clear actions. Saved metadata enriches:

- Harness Context Graph card packets (`## Project`)
- Agent Task Packets (`## Project context`, likely files, verification, repo/branch constraints)

## Source of truth

`LifeCard` remains the source of truth for status, next action, and board state. `HarnessProject` is metadata only. It does not introduce a second status system, sprint tracker, or execution bridge.

## How it improves agent packets

Before Project Registry Lite, Card Detail copy flows often emitted `(not specified)` for likely files and verification commands. With saved project metadata:

- **Copy agent context** includes a compact `## Project` section and project verification commands in the packet body.
- **Copy agent task packet** inherits project `likelyFiles` and `verificationCommands` when the builder input omits them. Explicit `[]` still means none.

Repo path and branch also flow into task-packet constraints when present.

## Core module

Pure helpers live in `src/core/projectRegistry.ts`:

- `getProjectForCard`
- `upsertProjectForCard`
- `deleteProjectForCard`
- `buildProjectContextForCard`
- `parseListField` / `formatListField`
- `applyUpsertProjectForCard` / `applyDeleteProjectForCard`

State wiring uses `save_project` and `delete_project` actions in `LifeHarnessState`.

## Persistence

`LifeHarnessData.projects` is optional in stored snapshots. `normalizeData()` defaults missing `projects` to `[]` without a schema version bump.

## Intentionally not added

- sprint tracker or dashboard
- GitHub sync or repo scanning
- automatic file discovery
- agent execution bridge
- orphan cleanup when cards are deleted

## Future hooks

Sprint Tracker and Agent Session Log can hang off `life_card:{id}` plus `HarnessProject.id` without changing the v0.1 card-first model.
