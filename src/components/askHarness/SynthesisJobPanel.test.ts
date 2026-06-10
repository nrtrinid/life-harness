import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PANEL_PATH = resolve(__dirname, "SynthesisJobPanel.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("SynthesisJobPanel", () => {
  const source = readSource(PANEL_PATH);

  it("delegates completed state to SynthesisReportCard", () => {
    expect(source).toContain("SynthesisReportCard");
    expect(source).toContain("result={jobState.result}");
    expect(source).toContain("stale={jobState.isStale}");
    expect(source).toContain("onDismiss={onDismiss}");
  });

  it("does not inline completed report sections", () => {
    expect(source).not.toContain("What we're circling");
    expect(source).not.toContain("Strongest idea");
  });

  it("shows recoverable failure actions", () => {
    expect(source).toContain("Try again");
    expect(source).toContain('kind="error"');
  });

  it("keeps loading states in the panel", () => {
    expect(source).toContain("Synthesizing this thread");
    expect(source).toContain("companionPhaseLabel");
  });
});
