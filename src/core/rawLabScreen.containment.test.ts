import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RAW_LAB_SCREEN_PATH = resolve(__dirname, "../../app/raw-lab.tsx");
const ASK_HARNESS_SCREEN_PATH = resolve(__dirname, "../../app/ask-harness.tsx");
const HARNESS_READ_CARD_PATH = resolve(__dirname, "../components/askHarness/HarnessReadCard.tsx");
const CHAT_BACKROOM_SUMMARY_PATH = resolve(__dirname, "./chatBackroomSummary.ts");
const RAW_LAB_THREAD_PATH = resolve(__dirname, "../components/rawLab/RawLabThread.tsx");
const RAW_LAB_MEMORY_PANEL_PATH = resolve(
  __dirname,
  "../components/rawLab/RawLabThreadMemoryPanel.tsx"
);
const RAW_LAB_BUDGET_INSPECTOR_PATH = resolve(
  __dirname,
  "../components/rawLab/RawLabBudgetInspector.tsx"
);
const RAW_LAB_REFLECTION_PANEL_PATH = resolve(
  __dirname,
  "../components/rawLab/RawLabThreadReflectionPanel.tsx"
);
const RAW_LAB_REFLECTION_CLIENT_PATH = resolve(
  __dirname,
  "./rawLabThreadReflectionClient.ts"
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("raw-lab screen containment", () => {
  const screenSource = readSource(RAW_LAB_SCREEN_PATH);
  const threadSource = readSource(RAW_LAB_THREAD_PATH);
  const memoryPanelSource = readSource(RAW_LAB_MEMORY_PANEL_PATH);
  const budgetInspectorSource = readSource(RAW_LAB_BUDGET_INSPECTOR_PATH);
  const reflectionPanelSource = readSource(RAW_LAB_REFLECTION_PANEL_PATH);
  const reflectionClientSource = readSource(RAW_LAB_REFLECTION_CLIENT_PATH);
  const combined = `${screenSource}\n${threadSource}\n${memoryPanelSource}\n${budgetInspectorSource}\n${reflectionPanelSource}\n${reflectionClientSource}`;

  it("does not import harness context or memory modules", () => {
    expect(combined).not.toMatch(/from\s+["'].*harnessContext["']/);
    expect(combined).not.toMatch(/from\s+["'].*harnessMemory["']/);
    expect(combined).not.toMatch(/from\s+["'].*harnessMemoryBank["']/);
    expect(combined).not.toMatch(/from\s+["'].*useLifeHarness["']/);
    expect(combined).not.toMatch(/from\s+["'].*LifeHarnessState["']/);
    expect(combined).not.toMatch(/from\s+["'].*AskHarnessAdvancedPanel["']/);
    expect(combined).not.toMatch(/from\s+["'].*HarnessReadCard["']/);
  });

  it("does not expose apply or board mutation affordances", () => {
    expect(combined).not.toMatch(/Save chat summary/i);
    expect(combined).not.toMatch(/proposed_card/i);
    expect(combined).not.toMatch(/buildHarnessContext/);
    expect(combined).not.toMatch(/apply update/i);
    expect(combined).not.toMatch(/card update/i);
    expect(combined).not.toMatch(/save personality/i);
    expect(combined).not.toMatch(/AsyncStorage/i);
    expect(combined).not.toMatch(/apply to board/i);
    expect(combined).not.toMatch(/save.*memory bank/i);
    expect(combined).not.toMatch(/write.*memory bank/i);
  });

  it("does not clear thread on unmount", () => {
    expect(screenSource).not.toMatch(/return \(\) => \{[^}]*setTurns\(\[\]\)/);
  });

  it("includes containment and temporary memory copy", () => {
    expect(screenSource).toContain("Sandbox only");
    expect(screenSource).toContain("cannot read or change your board");
    expect(screenSource).toContain("Do not paste secrets or S3-style private data");
    expect(screenSource).toContain("Ungrounded");
    expect(screenSource).toContain("ChatStateStrip");
    expect(screenSource).toContain("RAW_LAB_DEPTHS");
    expect(screenSource).toContain("Deep");
    expect(memoryPanelSource).toContain("This chat remembers");
    expect(memoryPanelSource).toContain("Temporary to this chat");
    expect(memoryPanelSource).toContain("Not saved to Life Harness");
    expect(memoryPanelSource).toContain("recurringTopics");
    expect(memoryPanelSource).toContain("currentVibe");
    expect(memoryPanelSource).toContain("selfObservations");
    expect(memoryPanelSource).toContain("questionsToRevisit");
    expect(memoryPanelSource).toContain("Style in this chat");
    expect(memoryPanelSource).toContain("Temporary. Not saved to Life Harness.");
    expect(budgetInspectorSource).toContain("Smart compacted working memory");
    expect(budgetInspectorSource).toContain("Temporary working memory for this send");
    expect(budgetInspectorSource).toContain("Not saved to Life Harness");
    expect(budgetInspectorSource).toContain("not board context");
    expect(budgetInspectorSource).toContain("not Memory Bank");
    expect(budgetInspectorSource).toContain("Dismiss compacted working memory");
    expect(reflectionPanelSource).toContain("Reflect on thread");
    expect(reflectionPanelSource).toContain("Apply to this chat");
    expect(reflectionPanelSource).toContain("Temporary to this chat");
    expect(reflectionPanelSource).toContain("Not saved to Life Harness");
  });

  it("handoff banner does not mention personality export or Memory Bank auto-save", () => {
    expect(screenSource).toContain("Stay in Raw Signal");
    expect(screenSource).toContain("Open in Companion with board context");
    expect(screenSource).not.toMatch(/export personality/i);
    expect(screenSource).not.toMatch(/auto.?save.*memory bank/i);
  });
});

describe("companion chat safety copy", () => {
  const harnessScreenSource = readSource(ASK_HARNESS_SCREEN_PATH);
  const harnessReadCardSource = readSource(HARNESS_READ_CARD_PATH);
  const backroomSummarySource = readSource(CHAT_BACKROOM_SUMMARY_PATH);

  it("companion grounding states user approves board changes", () => {
    expect(harnessReadCardSource).toContain("will not change the board");
    expect(harnessReadCardSource).toContain("board context");
    expect(harnessScreenSource).toContain("You approve what changes");
    expect(harnessScreenSource).toContain("ChatStateStrip");
    expect(backroomSummarySource).toContain("Grounded");
  });

  it("raw signal sandbox copy denies board access", () => {
    const screenSource = readSource(RAW_LAB_SCREEN_PATH);
    expect(screenSource).toContain("cannot read or change your board");
  });
});
