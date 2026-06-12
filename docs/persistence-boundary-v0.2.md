# Persistence boundary v0.2

## Goal

Isolate Life Harness persistence behind a dedicated state-layer boundary **without** changing the serialized localStorage JSON format, export/import behavior, or runtime app behavior.

## What moved behind the boundary

State and provider code now import from [`src/state/lifeHarness/persistence.ts`](../src/state/lifeHarness/persistence.ts) only:

| Export | Responsibility |
|--------|----------------|
| `LIFE_HARNESS_SNAPSHOT_KEY` | localStorage key constant (`life-harness.snapshot`) |
| `hydrateLifeHarnessState` | Load snapshot or fall back to seed; apply session start on loaded daily state |
| `persistLifeHarnessState` | Save current `LifeHarnessData` to storage |
| `isLifeHarnessPersistenceAvailable` | Platform adapter availability check |
| `clearLifeHarnessPersistence` | Remove persisted snapshot (reset-to-seed) |
| `parseLifeHarnessImport` | Validate/migrate imported JSON envelope |
| `serializeLifeHarnessSnapshot` | Serialize export envelope JSON |
| `createLifeHarnessEnvelope` | Build versioned envelope object |

[`createInitialState.ts`](../src/state/lifeHarness/createInitialState.ts) re-exports `hydrateLifeHarnessState` for the reducer initializer.

Implementation still delegates to [`src/storage/`](../src/storage/) (`persistence.ts`, `localStorageAdapter.ts`, `migrations.ts`, `types.ts`).

## What intentionally did not change

- Persisted JSON envelope: `{ schemaVersion, savedAt, data }`
- Storage key: `life-harness.snapshot`
- localStorage adapter and web-only persistence semantics
- Export/import UX messages and snapshot download behavior
- Reducer and domain state modules
- Scripts and low-level tests that import `src/storage/persistence` directly

## Current storage format

```json
{
  "schemaVersion": 1,
  "savedAt": "2026-06-11T12:00:00.000Z",
  "data": { /* LifeHarnessData */ }
}
```

Written to `localStorage` under key `life-harness.snapshot` on web. Native builds use a no-op adapter until a future platform adapter is added.

## Why this is preparation, not a migration

This task adds a **facade** at the state layer so a future structured store (IndexedDB, SQLite, Supabase, per-domain stores) can replace the `src/storage/` implementation without touching `LifeHarnessProvider`, reducers, or routes. No new backend was introduced; no data migration was performed.

## Follow-up tickets

1. **Structured store design** — evaluate storage backends while keeping the export envelope contract stable.
2. **Per-domain persistence stores** — optional split of `LifeHarnessData` fields into domain-scoped stores with a composed hydrate path.
3. **Migration/versioning strategy** — formalize schema upgrades beyond current `migrateEnvelope` in `src/storage/migrations.ts`.
4. **Backup/export hardening** — checksums, conflict detection, and safer import validation at the boundary.

## Verification

```bash
npm run typecheck
npm run test -- persistence
npm run test
```

Boundary tests: [`src/state/lifeHarness/persistence.test.ts`](../src/state/lifeHarness/persistence.test.ts)  
Low-level storage tests: [`src/storage/persistence.test.ts`](../src/storage/persistence.test.ts)
