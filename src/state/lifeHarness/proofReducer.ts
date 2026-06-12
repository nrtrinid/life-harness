import type { LifeHarnessData } from "../../core/lifeHarnessData";

/**
 * Proof / playback domain boundary.
 *
 * `logs` and `proofItems` live on `LifeHarnessData` but are mutated through board
 * actions (quick capture, pounce, MVD, salvage) and harness actions (agent completion,
 * feature sprint completion). There is no separate reducer action group for proof yet.
 *
 * This module exists as an explicit domain marker for future proof-ledger-specific
 * reducer actions without changing persistence shape today.
 */
export function proofReducer(_state: LifeHarnessData, _action: { type: string }): null {
  return null;
}
