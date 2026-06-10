/**
 * Dogfood conversation summary memory loop.
 * Usage: npx tsx scripts/dogfood-chat-memory.ts [baseUrl]
 */

import { askChatHarness } from "../src/core/chatHarnessClient";
import {
  applySaveChatSummary,
  buildChatSummary,
  CHAT_MEMORY_ANALYSIS_PREFIX
} from "../src/core/harnessMemory";
import { buildCompactHarnessContext, estimateHarnessContextChars } from "../src/core/harnessContext";
import { createSeedState } from "../src/data/createSeedState";
import type { LifeHarnessData } from "../src/core/actions";
import type { HarnessContext } from "../src/core/harnessContext";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8111";

function exportInput(state: LifeHarnessData) {
  return {
    cards: state.cards,
    logs: state.logs,
    proofItems: state.proofItems,
    dailyState: state.dailyState,
    resumeModules: state.resumeModules,
    jobCandidates: state.jobCandidates,
    jobSourceRuns: state.jobSourceRuns,
    chatSummaries: state.chatSummaries
  };
}

async function ask(message: string, context: HarnessContext) {
  const t0 = Date.now();
  const data = await askChatHarness({
    baseUrl,
    message,
    mode: "operator",
    sensitivity: "S1",
    context
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  return { message, secs, answer: data.answer, used_context: data.used_context };
}

function citesMemory(text: string, summary: ReturnType<typeof buildChatSummary>): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];

  if (
    lower.includes("recent chat memory") ||
    lower.includes("chat memory") ||
    lower.includes("remember next time") ||
    lower.includes("saved chat")
  ) {
    hits.push("memory phrasing");
  }

  for (const pattern of summary.patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      hits.push(`pattern:${pattern}`);
    }
  }

  for (const item of summary.rememberForNextTime) {
    const snippet = item.slice(0, 40).toLowerCase();
    if (snippet.length > 8 && lower.includes(snippet.slice(0, 20))) {
      hits.push("remember item");
    }
  }

  for (const decision of summary.decisions) {
    if (lower.includes(decision.slice(0, 24).toLowerCase())) {
      hits.push("decision");
    }
  }

  if (lower.includes("career") || lower.includes("build")) {
    hits.push("board signal");
  }

  return hits;
}

async function main() {
  let state = createSeedState();
  let context = buildCompactHarnessContext(exportInput(state));
  console.log(`Gateway: ${baseUrl}`);
  console.log(`Initial compact context chars: ${estimateHarnessContextChars(context)}`);

  console.log("\n=== Step 1: What am I avoiding right now? ===");
  const r1 = await ask("What am I avoiding right now?", context);
  console.log(`[${r1.secs}s] used_context=${r1.used_context}`);
  console.log(`A: ${r1.answer}`);

  const summary = buildChatSummary({
    userMessage: "What am I avoiding right now?",
    assistantAnswer: r1.answer,
    mode: "operator",
    confidenceNotes: [],
    safetyNotes: []
  });
  state = applySaveChatSummary(state, summary);
  context = buildCompactHarnessContext(exportInput(state));
  const memInExport = context.recent_analyses.some((item) =>
    item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX)
  );

  console.log("\n=== Step 2: Saved chat summary ===");
  console.log(`Summary: ${summary.assistantSummary}`);
  console.log(`Patterns: ${summary.patterns.join(", ") || "(none)"}`);
  console.log(`Remember: ${summary.rememberForNextTime.join(" | ")}`);
  console.log(
    `Chat memory in export: ${memInExport} | context chars: ${estimateHarnessContextChars(context)}`
  );

  console.log("\n=== Step 3: What did we just decide? ===");
  const r2 = await ask("What did we just decide?", context);
  console.log(`[${r2.secs}s] used_context=${r2.used_context}`);
  console.log(`A: ${r2.answer}`);
  console.log(`Memory cites: ${citesMemory(r2.answer, summary).join(", ") || "none detected"}`);

  console.log("\n=== Step 4: What should I remember next time? ===");
  const r3 = await ask("What should I remember next time?", context);
  console.log(`[${r3.secs}s] used_context=${r3.used_context}`);
  console.log(`A: ${r3.answer}`);
  console.log(`Memory cites: ${citesMemory(r3.answer, summary).join(", ") || "none detected"}`);

  const followUpHits =
    citesMemory(r2.answer, summary).length > 0 || citesMemory(r3.answer, summary).length > 0;
  const result = memInExport && followUpHits ? "PASS" : "PARTIAL";
  console.log(`\n=== Dogfood result: ${result} ===`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
