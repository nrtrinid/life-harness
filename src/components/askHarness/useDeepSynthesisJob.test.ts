import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HOOK_PATH = resolve(__dirname, "useDeepSynthesisJob.ts");
const SCREEN_PATH = resolve(__dirname, "../../../app/ask-harness.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("useDeepSynthesisJob wiring", () => {
  const hookSource = readSource(HOOK_PATH);
  const screenSource = readSource(SCREEN_PATH);

  it("uses askHarnessSynthesis eligibility helper", () => {
    expect(hookSource).toContain("isAskThreadEligibleForSynthesis");
  });

  it("defaults synthesis pipeline to with_critic", () => {
    expect(hookSource).toContain('pipelineProfile: "with_critic"');
  });

  it("tracks generation for poll cleanup", () => {
    expect(hookSource).toContain("generationRef");
    expect(hookSource).toContain("dismissSynthesis");
  });

  it("disables action while synthesis is busy", () => {
    expect(screenSource).toContain("synthesisBusy");
    expect(screenSource).toContain("synthesisDisabled");
  });

  it("shows helper copy when thread is not eligible", () => {
    expect(screenSource).toContain("Need a bit more conversation first");
  });
});
