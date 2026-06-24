import { describe, expect, it } from "vitest";

import {
  FEATURE_WORKER_OUTPUT_FENCE,
  formatWorkerOutputEvidencePacketSections,
  parseFeatureSprintWorkerOutputEvidence,
  parseFeatureWorkerOutputBlock,
  parseWorkerOutputFreeTextSections,
  redactWorkerOutputForReviewPacket,
  WORKER_OUTPUT_MALFORMED_FENCE_WARNING,
  WORKER_OUTPUT_NO_TESTS_WARNING,
  WORKER_OUTPUT_SECRET_REDACTION_WARNING
} from "./featureSprintWorkerOutput";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

describe("featureSprintWorkerOutput", () => {
  it("parses free-text Cursor final message sections", () => {
    const raw = `Summary:
- Added worker output parser

Files changed:
- src/core/featureSprintWorkerOutput.ts
- src/core/types.ts

Tests:
- npm test -- src/core/featureSprintWorkerOutput.test.ts
- npm run agent:typecheck — pass

Warnings:
- environment unavailable for dogfood on CI

Known limitations:
- Parser is heuristic only

Risks:
- Scope creep if parser grows too large`;

    const evidence = parseFeatureSprintWorkerOutputEvidence(raw, { now: new Date(FIXED_NOW) });
    expect(evidence.summary).toContain("worker output parser");
    expect(evidence.changedFiles).toEqual([
      "src/core/featureSprintWorkerOutput.ts",
      "src/core/types.ts"
    ]);
    expect(evidence.testsRun).toEqual(
      expect.arrayContaining([
        "npm test -- src/core/featureSprintWorkerOutput.test.ts",
        "npm run agent:typecheck"
      ])
    );
    expect(evidence.warnings?.some((w) => w.includes("environment unavailable"))).toBe(true);
    expect(evidence.knownLimitations?.[0]).toContain("heuristic");
    expect(evidence.risks?.[0]).toContain("Scope creep");
    expect(evidence.rawOutput).toBe(raw);
  });

  it("parses compact changed files and tests run lines", () => {
    const raw = `Changed files: src/a.ts, docs/b.md
Tests run: npm test, npm run lint`;

    const sections = parseWorkerOutputFreeTextSections(raw);
    expect(sections.changedFiles).toEqual(expect.arrayContaining(["src/a.ts", "docs/b.md"]));
    expect(sections.testsRun.length).toBeGreaterThan(0);
  });

  it("parses valid feature-worker-output fence", () => {
    const raw = [
      "```" + FEATURE_WORKER_OUTPUT_FENCE,
      JSON.stringify({
        source: "cursor_auto",
        summary: "Bounded slice shipped.",
        changedFiles: ["src/core/foo.ts"],
        testsRun: ["npm test"],
        withinScope: true
      }),
      "```"
    ].join("\n");

    const block = parseFeatureWorkerOutputBlock(raw);
    expect(block?.summary).toBe("Bounded slice shipped.");
    const evidence = parseFeatureSprintWorkerOutputEvidence(raw, { now: new Date(FIXED_NOW) });
    expect(evidence.source).toBe("cursor_auto");
    expect(evidence.changedFiles).toEqual(["src/core/foo.ts"]);
    expect(evidence.warnings).toBeUndefined();
  });

  it("falls back on malformed fence with explicit warning", () => {
    const raw = [
      "```" + FEATURE_WORKER_OUTPUT_FENCE,
      "{ not valid json",
      "```",
      "",
      "Changed files:",
      "- src/core/foo.ts"
    ].join("\n");

    const evidence = parseFeatureSprintWorkerOutputEvidence(raw, { now: new Date(FIXED_NOW) });
    expect(evidence.warnings).toContain(WORKER_OUTPUT_MALFORMED_FENCE_WARNING);
    expect(evidence.changedFiles).toEqual(["src/core/foo.ts"]);
  });

  it("never throws on empty or messy text", () => {
    expect(() => parseFeatureSprintWorkerOutputEvidence("")).not.toThrow();
    expect(() => parseFeatureSprintWorkerOutputEvidence("   \n\n ??? ")).not.toThrow();
    const evidence = parseFeatureSprintWorkerOutputEvidence("random gibberish");
    expect(evidence.rawOutput).toBe("random gibberish");
  });

  it("adds no-tests warning when tests missing", () => {
    const evidence = parseFeatureSprintWorkerOutputEvidence("Summary:\n- Done only.", {
      now: new Date(FIXED_NOW)
    });
    expect(evidence.warnings).toContain(WORKER_OUTPUT_NO_TESTS_WARNING);
  });

  it("preserves environment unavailable as warning", () => {
    const evidence = parseFeatureSprintWorkerOutputEvidence(
      "Verification:\n- npm test — could not run (environment unavailable)",
      { now: new Date(FIXED_NOW) }
    );
    expect(evidence.warnings?.some((w) => /environment unavailable|could not run/i.test(w))).toBe(
      true
    );
  });

  it("redacts secrets in packet sections", () => {
    const evidence = parseFeatureSprintWorkerOutputEvidence(
      "Summary:\nUsed key sk-abcdefghijklmnopqrstuvwxyz123456",
      { now: new Date(FIXED_NOW), source: "manual" }
    );
    const sections = formatWorkerOutputEvidencePacketSections(evidence).join("\n");
    expect(sections).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(sections).toContain("[REDACTED]");
    expect(sections).toContain(WORKER_OUTPUT_SECRET_REDACTION_WARNING);
  });

  it("caps long test output in packet sections while preserving full raw on evidence", () => {
    const longOutput = "x".repeat(5_000);
    const evidence = parseFeatureSprintWorkerOutputEvidence(
      `Test output:\n${longOutput}\n\nChanged files:\n- ${Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`).join("\n- ")}`,
      { now: new Date(FIXED_NOW) }
    );
    expect(evidence.rawOutput.length).toBeGreaterThan(4_000);
    const sections = formatWorkerOutputEvidencePacketSections(evidence).join("\n");
    expect(sections).toContain("[truncated]");
    expect(sections).toMatch(/and \d+ more/);
  });

  it("marks missing fields as not provided in packet sections", () => {
    const sections = formatWorkerOutputEvidencePacketSections({
      source: "manual",
      rawOutput: "hello",
      capturedAt: FIXED_NOW
    }).join("\n");
    expect(sections).toContain("(not provided)");
  });

  it("redactWorkerOutputForReviewPacket redacts api_key patterns", () => {
    const result = redactWorkerOutputForReviewPacket("DEEPSEEK_API_KEY=super-secret-value-here");
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("[REDACTED]");
    expect(result.text).not.toContain("super-secret-value-here");
  });
});
