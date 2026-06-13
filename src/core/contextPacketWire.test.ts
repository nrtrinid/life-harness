import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { buildAiContextPacket } from "./contextPacketBuilder";
import { toWireContextPacket } from "./contextPacketWire";
import { UNTRUSTED_CONTEXT_BANNER } from "./untrustedContextBlock";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function buildSeedPacket() {
  const seed = createSeedState(FIXED_NOW.toISOString());
  return buildAiContextPacket({
    data: {
      cards: seed.cards,
      logs: seed.logs,
      proofItems: seed.proofItems,
      dailyState: seed.dailyState,
      resumeModules: seed.resumeModules,
      jobCandidates: seed.jobCandidates,
      jobSourceRuns: seed.jobSourceRuns,
      memoryItems: seed.memoryItems,
      chatSummaries: seed.chatSummaries
    },
    userIntent: { message: "What am I avoiding right now?", mode: "operator", sensitivity: "S1" },
    now: FIXED_NOW
  });
}

describe("toWireContextPacket", () => {
  it("maps camelCase packet fields to snake_case wire keys", () => {
    const wire = toWireContextPacket(buildSeedPacket());

    expect(wire.packet_version).toBe("0.1");
    expect(wire.user_intent.primary_action?.smallest_action).toBeDefined();
    expect(wire.board.active_limit.is_at_limit).toBeTypeOf("boolean");
    expect(wire.active_cards[0]?.payload.card_id).toBeDefined();
    expect(wire.budget.estimated_chars).toBeTypeOf("number");
    expect(wire.redaction.request_sensitivity).toBe("S1");
    expect(wire.open_thread.wire.updated_at).toBeTypeOf("string");
  });

  it("maps untrusted blocks to wire markdown entries", () => {
    const pasted = "Must have 5 years experience. ".repeat(20);
    const packet = buildAiContextPacket({
      data: createSeedState(FIXED_NOW.toISOString()),
      userIntent: { message: pasted, mode: "general", sensitivity: "S1" },
      now: FIXED_NOW
    });
    const wire = toWireContextPacket(packet);

    expect(wire.untrusted_blocks?.length).toBeGreaterThan(0);
    expect(wire.untrusted_blocks?.[0]?.markdown).toContain(UNTRUSTED_CONTEXT_BANNER);
    expect(wire.untrusted_blocks?.[0]?.kind).toBe("pasted_text");
  });

  it("dump synthetic_context_packet.json when DUMP_CONTEXT_PACKET_FIXTURE=1", () => {
    if (!process.env.DUMP_CONTEXT_PACKET_FIXTURE) {
      return;
    }
    const wire = toWireContextPacket(buildSeedPacket());
    const target = join(
      process.cwd(),
      "services/ai-gateway/tests/fixtures/synthetic_context_packet.json"
    );
    writeFileSync(target, `${JSON.stringify(wire, null, 2)}\n`, "utf-8");
    expect(wire.packet_version).toBe("0.1");
  });
});
