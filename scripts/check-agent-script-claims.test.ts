import { describe, expect, it } from "vitest";

import { extractAdvertisedNpmScripts } from "./check-agent-script-claims";
import { collectLikelyTestsForFiles, likelyTestsFor } from "./agent-utils";

describe("extractAdvertisedNpmScripts", () => {
  it("extracts npm script names with line numbers", () => {
    const markdown = [
      "Run `npm run agent:preflight` first.",
      "Then npm run check:boundaries",
      ""
    ].join("\n");
    expect(extractAdvertisedNpmScripts(markdown)).toEqual([
      { script: "agent:preflight", line: 1 },
      { script: "check:boundaries", line: 2 }
    ]);
  });
});

describe("collectLikelyTestsForFiles", () => {
  it("matches the union of likelyTestsFor existing tests", () => {
    const files = ["src/core/actions.ts", "src/core/guards.ts"];
    const union = Array.from(
      new Set(files.flatMap((file) => likelyTestsFor(file).existing))
    ).sort();
    expect(collectLikelyTestsForFiles(files)).toEqual(union);
  });

  it("includes actions.test.ts for actions.ts", () => {
    const tests = collectLikelyTestsForFiles(["src/core/actions.ts"]);
    expect(tests).toContain("src/core/actions.test.ts");
  });
});
