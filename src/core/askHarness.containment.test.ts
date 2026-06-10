import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ASK_HARNESS_PATH = resolve(__dirname, "../../app/ask-harness.tsx");
const CONTEXT_PANEL_PATH = resolve(
  __dirname,
  "../components/askHarness/ChatThreadContextPanel.tsx"
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
    expect(panelSource).toContain("Conversation context");
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
    expect(screenSource).toContain("toWireChatHarnessThreadState");
    expect(screenSource).not.toMatch(/personality/i);
  });
});
