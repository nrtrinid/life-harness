import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ASK_HARNESS_PATH = resolve(__dirname, "../../app/ask-harness.tsx");
const CONTEXT_PANEL_PATH = resolve(
  __dirname,
  "../components/askHarness/ChatThreadContextPanel.tsx"
);
const ASK_SYNTHESIS_PATH = resolve(__dirname, "askHarnessSynthesis.ts");
const ASK_DEEP_SYNTHESIS_JOB_PATH = resolve(__dirname, "askDeepSynthesisJob.ts");
const USE_DEEP_SYNTHESIS_HOOK_PATH = resolve(
  __dirname,
  "../components/askHarness/useDeepSynthesisJob.ts"
);
const SYNTHESIS_PANEL_PATH = resolve(
  __dirname,
  "../components/askHarness/SynthesisJobPanel.tsx"
);
const SYNTHESIS_REPORT_CARD_PATH = resolve(
  __dirname,
  "../components/askHarness/SynthesisReportCard.tsx"
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("ask-harness thread context containment", () => {
  const panelSource = readSource(CONTEXT_PANEL_PATH);
  const screenSource = readSource(ASK_HARNESS_PATH);
  const combined = `${panelSource}\n${screenSource}`;

  it("does not import Raw Lab modules in conversation context panel", () => {
    expect(panelSource).not.toMatch(/from\s+["'].*rawLab/i);
    expect(panelSource).not.toMatch(/RawLabPersonality/i);
  });

  it("uses grounded conversation context copy", () => {
    expect(panelSource).toContain("Context snapshot");
    expect(panelSource).toContain("Board context is still source of truth");
    expect(panelSource).not.toMatch(/Personality forming/i);
    expect(panelSource).not.toMatch(/Lean into this/i);
    expect(panelSource).not.toMatch(/entity/i);
  });

  it("does not auto-save memory from thread context panel", () => {
    expect(panelSource).not.toMatch(/Save chat summary/i);
    expect(panelSource).not.toMatch(/Memory Bank/i);
    expect(panelSource).not.toMatch(/apply update/i);
  });

  it("ask harness sends thread_state without personality fields", () => {
    expect(screenSource).toContain("threadState");
    expect(screenSource).toContain("buildChatHarnessSendBundle");
    expect(screenSource).toContain("wireThreadState");
    expect(screenSource).not.toMatch(/personality/i);
  });
});

describe("askHarnessSynthesis containment", () => {
  const synthesisSource = readSource(ASK_SYNTHESIS_PATH);

  it("does not import Raw Lab modules", () => {
    expect(synthesisSource).not.toMatch(/from\s+["'].*rawLab/i);
    expect(synthesisSource).not.toMatch(/RawLabPersonality/i);
  });

  it("does not call persistence helpers", () => {
    expect(synthesisSource).not.toMatch(/\bsaveMemoryItem\s*\(/);
    expect(synthesisSource).not.toMatch(/\bsaveChatSummary\s*\(/);
  });

  it("does not import board mutation paths", () => {
    expect(synthesisSource).not.toMatch(/from\s+["'].*primaryAction/i);
    expect(synthesisSource).not.toMatch(/from\s+["'].*useLifeHarness/i);
    expect(synthesisSource).not.toMatch(/applyCardUpdate|applyLogUpdate|dispatch/i);
  });

  it("does not assemble personality state in outbound requests", () => {
    expect(synthesisSource).not.toMatch(/personality/i);
  });
});

describe("ask-harness deep synthesis containment", () => {
  const screenSource = readSource(ASK_HARNESS_PATH);
  const hookSource = readSource(USE_DEEP_SYNTHESIS_HOOK_PATH);
  const jobSource = readSource(ASK_DEEP_SYNTHESIS_JOB_PATH);
  const panelSource = readSource(SYNTHESIS_PANEL_PATH);
  const synthesisCoreSource = `${hookSource}\n${jobSource}\n${panelSource}`;

  it("exposes synthesis action wiring", () => {
    expect(screenSource).toContain("Synthesize this thread");
    expect(screenSource).toContain("useDeepSynthesisJob");
    expect(screenSource).toContain("SynthesisJobPanel");
    expect(hookSource).toContain("buildAskDeepSynthesisRequest");
    expect(hookSource).toContain("runAskDeepSynthesisJob");
  });

  it("does not alter Ask reasoning depth from synthesis path", () => {
    expect(synthesisCoreSource).not.toMatch(/setReasoningDepth\s*\(/);
    expect(hookSource).toContain("reasoningDepth");
  });

  it("does not append synthesis results to chat thread items", () => {
    expect(jobSource).not.toMatch(/setThread\s*\(/);
    expect(panelSource).not.toMatch(/setThread\s*\(/);
  });

  it("does not mutate board or memory from synthesis handler", () => {
    expect(synthesisCoreSource).not.toMatch(/\bsaveMemoryItem\s*\(/);
    expect(synthesisCoreSource).not.toMatch(/\bsaveChatSummary\s*\(/);
    expect(synthesisCoreSource).not.toMatch(/from\s+["'].*primaryAction/i);
  });

  it("does not import Raw Lab from synthesis UI path", () => {
    expect(synthesisCoreSource).not.toMatch(/from\s+["'].*rawLab/i);
  });
});

describe("SynthesisReportCard containment", () => {
  const reportCardSource = readSource(SYNTHESIS_REPORT_CARD_PATH);

  it("does not call persistence helpers", () => {
    expect(reportCardSource).not.toMatch(/\bsaveMemoryItem\s*\(/);
    expect(reportCardSource).not.toMatch(/\bsaveChatSummary\s*\(/);
  });

  it("does not import board mutation paths", () => {
    expect(reportCardSource).not.toMatch(/from\s+["'].*primaryAction/i);
    expect(reportCardSource).not.toMatch(/from\s+["'].*useLifeHarness/i);
  });

  it("does not reference personality proposals in source", () => {
    expect(reportCardSource).not.toMatch(/personalityProposals/);
    expect(reportCardSource).not.toMatch(/personality proposal/i);
  });

  it("does not import Raw Lab modules", () => {
    expect(reportCardSource).not.toMatch(/from\s+["'].*rawLab/i);
  });
});
