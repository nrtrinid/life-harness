import type { LifeHarnessData } from "../core/actions";
import { CURRENT_SCHEMA_VERSION, type PersistedEnvelope } from "./types";

export function isValidEnvelope(value: unknown): value is PersistedEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const envelope = value as PersistedEnvelope;
  return (
    typeof envelope.schemaVersion === "number" &&
    typeof envelope.savedAt === "string" &&
    envelope.data !== undefined &&
    typeof envelope.data === "object"
  );
}

export function parseEnvelopeJson(json: string): { ok: true; envelope: PersistedEnvelope } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  if (!isValidEnvelope(parsed)) {
    return { ok: false, error: "Missing schemaVersion, savedAt, or data." };
  }

  return { ok: true, envelope: parsed };
}

export function migrateEnvelope(
  envelope: PersistedEnvelope
): { ok: true; envelope: PersistedEnvelope } | { ok: false; error: string } {
  if (envelope.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schema version ${envelope.schemaVersion}. App supports up to ${CURRENT_SCHEMA_VERSION}.`
    };
  }

  if (envelope.schemaVersion < 1) {
    return { ok: false, error: `Unsupported schema version ${envelope.schemaVersion}.` };
  }

  return { ok: true, envelope: { ...envelope, schemaVersion: CURRENT_SCHEMA_VERSION } };
}

export function envelopeData(envelope: PersistedEnvelope): LifeHarnessData {
  return envelope.data;
}
