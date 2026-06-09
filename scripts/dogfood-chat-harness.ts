/**
 * Dogfood Chat Harness with real Momentum Board seed context.
 * Usage: npx tsx scripts/dogfood-chat-harness.ts [baseUrl]
 */

import { askChatHarness } from "../src/core/chatHarnessClient";
import { buildHarnessContext } from "../src/core/harnessContext";
import type { ChatHarnessMode } from "../src/core/harnessContext";
import { createSeedState } from "../src/data/createSeedState";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8111";

const QUESTIONS: { message: string; mode: ChatHarnessMode }[] = [
  { message: "What am I avoiding right now?", mode: "operator" },
  { message: "What should I do next?", mode: "operator" },
  { message: "Am I over-optimizing again?", mode: "reflection" },
  { message: "What should I park?", mode: "operator" },
  { message: "What career action should I take today?", mode: "operator" },
  { message: "Give me blunt advice based on my board.", mode: "general" }
];

async function main() {
  const seed = createSeedState();
  const context = buildHarnessContext({
    cards: seed.cards,
    logs: seed.logs,
    proofItems: seed.proofItems,
    dailyState: seed.dailyState,
    resumeModules: seed.resumeModules,
    jobCandidates: seed.jobCandidates
  });

  console.log("=== Exported context summary ===");
  console.log(`Cards: ${context.cards.length}`);
  console.log(`Titles: ${context.cards.map((c) => c.title).join(" | ")}`);
  console.log(`Logs: ${context.logs.length} | Proof: ${context.proof_items.length}`);
  console.log(`Gateway: ${baseUrl}\n`);

  for (const q of QUESTIONS) {
    const t0 = Date.now();
    try {
      const data = await askChatHarness({
        baseUrl,
        message: q.message,
        mode: q.mode,
        sensitivity: "S1",
        context
      });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`Q: ${q.message} (${q.mode}) [200 in ${dt}s]`);
      console.log(`A: ${data.answer}\n`);
    } catch (err) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`Q: ${q.message} (${q.mode}) [error in ${dt}s]`);
      console.log(`  ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

void main();
