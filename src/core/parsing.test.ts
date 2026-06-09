import { describe, expect, it } from "vitest";

import { parseQuickCapture } from "./parsing";

describe("parseQuickCapture", () => {
  it("parses new idea prefix", () => {
    expect(parseQuickCapture("new idea: ambient music sketch")).toEqual({
      kind: "new_idea",
      title: "ambient music sketch"
    });
  });

  it("parses park intent with word boundary", () => {
    expect(parseQuickCapture("park local llm")).toEqual({ kind: "park" });
  });

  it("does not parse parking as park intent", () => {
    expect(parseQuickCapture("parking the thought for later")).toBeUndefined();
  });

  it("parses build win", () => {
    expect(parseQuickCapture("worked on rpg for 10 min")).toEqual({
      kind: "log",
      type: "win",
      area: "build"
    });
  });

  it("parses applied career win with proof flag", () => {
    expect(parseQuickCapture("applied to Acme")).toEqual({
      kind: "log",
      type: "win",
      area: "social_career",
      applied: true
    });
  });

  it("parses money leak", () => {
    expect(parseQuickCapture("bought cart $45")).toEqual({
      kind: "log",
      type: "leak",
      area: "stability_vices"
    });
  });
});
