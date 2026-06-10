import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RAW_LAB_SCREEN_PATH = resolve(__dirname, "../../app/raw-lab.tsx");
const RAW_LAB_THREAD_PATH = resolve(__dirname, "../components/rawLab/RawLabThread.tsx");
const RAW_LAB_MEMORY_PANEL_PATH = resolve(
  __dirname,
  "../components/rawLab/RawLabThreadMemoryPanel.tsx"
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("raw-lab screen containment", () => {
  const screenSource = readSource(RAW_LAB_SCREEN_PATH);
  const threadSource = readSource(RAW_LAB_THREAD_PATH);
  const memoryPanelSource = readSource(RAW_LAB_MEMORY_PANEL_PATH);
  const combined = `${screenSource}\n${threadSource}\n${memoryPanelSource}`;

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
  });

  it("does not clear thread on unmount", () => {
    expect(screenSource).not.toMatch(/return \(\) => \{[^}]*setTurns\(\[\]\)/);
  });

  it("includes containment and temporary memory copy", () => {
    expect(screenSource).toContain("unrestricted sandbox");
    expect(screenSource).toContain("not grounded");
    expect(screenSource).toContain("cannot change Life Harness");
    expect(screenSource).toContain("Do not paste secrets or S3-style private data");
    expect(memoryPanelSource).toContain("What this chat remembers");
    expect(memoryPanelSource).toContain("Temporary to this chat");
    expect(memoryPanelSource).toContain("Not saved to Life Harness");
    expect(memoryPanelSource).toContain("Personality forming in this chat");
    expect(memoryPanelSource).toContain("Temporary. Not saved to Life Harness.");
  });

  it("handoff banner does not mention personality export or Memory Bank auto-save", () => {
    expect(screenSource).toContain("Stay in Raw Lab");
    expect(screenSource).toContain("Use board context");
    expect(screenSource).not.toMatch(/export personality/i);
    expect(screenSource).not.toMatch(/auto.?save.*memory bank/i);
  });
});
