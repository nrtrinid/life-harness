import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPORT_CARD_PATH = resolve(__dirname, "SynthesisReportCard.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("SynthesisReportCard", () => {
  const source = readSource(REPORT_CARD_PATH);

  it("defines primary report sections", () => {
    expect(source).toContain("ReportSection");
    expect(source).toContain("What we're circling");
    expect(source).toContain("Strongest idea");
    expect(source).toContain("Hidden risk");
    expect(source).toContain("synthesisNextPounceHero");
    expect(source).toContain("nextPounce.smallestAction");
  });

  it("renders grounding chips with chat meta pills", () => {
    expect(source).toContain("GroundingChips");
    expect(source).toContain("chatMetaPill");
  });

  it("handles stale and degraded warnings", () => {
    expect(source).toContain('kind="warning"');
    expect(source).toContain("stale");
    expect(source).toContain("degradedNotes");
  });

  it("renders connections when present", () => {
    expect(source).toContain("connections.length");
    expect(source).toContain("synthesisBulletRow");
  });

  it("keeps interpretations and critique secondary and collapsed by default", () => {
    expect(source).toContain("CollapsibleSection");
    expect(source).toContain('title="Interpretations"');
    expect(source).toContain('title="Critique"');
    expect(source).toContain("defaultOpen={false}");
  });

  it("shows read-only memory preview copy", () => {
    expect(source).toContain("Possible memories");
    expect(source).toContain("Read-only preview");
    expect(source).not.toMatch(/\bsaveMemoryItem\s*\(/);
  });

  it("omits personality proposal UI", () => {
    expect(source).not.toMatch(/personalityProposals/);
    expect(source).not.toMatch(/personality proposal/i);
  });

  it("includes footer meta notes", () => {
    expect(source).toContain("confidenceNotes");
    expect(source).toContain("safetyNotes");
    expect(source).toContain("MetaNotePills");
  });

  it("wires dismiss through onDismiss", () => {
    expect(source).toContain("onDismiss");
    expect(source).toContain("Dismiss");
  });

  it("wires web-only copy report without persistence helpers", () => {
    expect(source).toContain("Copy report");
    expect(source).toContain("copyTextToClipboard");
    expect(source).toContain("buildSynthesisReportPlainText");
    expect(source).toContain("canCopyTextToClipboard");
    expect(source).not.toMatch(/\bsaveMemoryItem\s*\(/);
  });
});
