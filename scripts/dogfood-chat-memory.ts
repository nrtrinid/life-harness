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
import {
  applySaveMemoryItem,
  buildMemoryCandidatesFromChatSummary,
  createMemoryItem,
  MEMORY_BANK_PREFIX
} from "../src/core/harnessMemoryBank";
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
    chatSummaries: state.chatSummaries,
    memoryItems: state.memoryItems
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

function citesMemoryBank(
  text: string,
  savedItem: ReturnType<typeof createMemoryItem> | undefined
): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];

  if (lower.includes("memory bank")) {
    hits.push("memory bank phrasing");
  }

  if (savedItem) {
    if (lower.includes(savedItem.title.toLowerCase())) {
      hits.push(`title:${savedItem.title}`);
    }

    for (const tag of savedItem.tags) {
      if (lower.includes(tag.toLowerCase())) {
        hits.push(`tag:${tag}`);
      }
    }

    const summarySnippet = savedItem.summary.slice(0, 40).toLowerCase();
    if (summarySnippet.length > 12 && lower.includes(summarySnippet.slice(0, 20))) {
      hits.push("summary snippet");
    }

    if (savedItem.kind === "pattern" && lower.includes("career avoidance")) {
      hits.push("pattern:career avoidance");
    }
  }

  return hits;
}

function citesChatMemory(text: string, summary: ReturnType<typeof buildChatSummary>): string[] {
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

  console.log("\n=== Step 2: Save chat summary ===");
  state = applySaveChatSummary(state, summary);
  context = buildCompactHarnessContext(exportInput(state));
  const chatMemInExport = context.recent_analyses.some((item) =>
    item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX)
  );
  console.log(`Summary: ${summary.assistantSummary}`);
  console.log(`Patterns: ${summary.patterns.join(", ") || "(none)"}`);
  console.log(`Chat memory in export: ${chatMemInExport}`);

  console.log("\n=== Step 3: Save one suggested durable memory ===");
  const candidates = buildMemoryCandidatesFromChatSummary(summary, state.memoryItems);
  if (candidates.length === 0) {
    throw new Error("No memory bank candidates generated from saved chat summary.");
  }
  const savedItem = createMemoryItem({
    kind: candidates[0]!.kind,
    title: candidates[0]!.title,
    summary: candidates[0]!.summary,
    tags: candidates[0]!.tags,
    sourceChatSummaryId: candidates[0]!.sourceChatSummaryId,
    isActive: true
  });
  state = applySaveMemoryItem(state, savedItem);
  context = buildCompactHarnessContext(exportInput(state));
  const memoryBankInExport =
    context.recent_analyses.some((item) => item.summary.startsWith(MEMORY_BANK_PREFIX)) ||
    context.decisions.some((item) => item.summary.startsWith(MEMORY_BANK_PREFIX));

  console.log(`Saved: ${savedItem.kind} · ${savedItem.title}`);
  console.log(`Summary: ${savedItem.summary}`);
  console.log(`Memory Bank in export: ${memoryBankInExport}`);

  console.log("\n=== Step 4: Memory Bank ledger check ===");
  const ledgerItem = state.memoryItems.find((item) => item.id === savedItem.id);
  console.log(
    ledgerItem
      ? `Memory Bank contains item (${ledgerItem.isActive ? "active" : "inactive"}): ${ledgerItem.title}`
      : "FAIL: item missing from memoryItems"
  );

  console.log("\n=== Step 5: What pattern should you remember about me? ===");
  const r2 = await ask("What pattern should you remember about me?", context);
  console.log(`[${r2.secs}s] used_context=${r2.used_context}`);
  console.log(`A: ${r2.answer}`);

  console.log("\n=== Step 6: Citation check ===");
  const bankHits = citesMemoryBank(r2.answer, savedItem);
  const chatHits = citesChatMemory(r2.answer, summary);
  console.log(`Memory Bank cites: ${bankHits.join(", ") || "none detected"}`);
  console.log(`Recent chat cites: ${chatHits.join(", ") || "none detected"}`);

  const pass =
    Boolean(ledgerItem) &&
    memoryBankInExport &&
    bankHits.length > 0 &&
    bankHits.length >= chatHits.length;
  console.log(`\n=== Dogfood result: ${pass ? "PASS" : "PARTIAL"} ===`);
  if (!pass) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
