import { describe, expect, it } from "vitest";

import { CAPTURE_GRAMMAR_HINT, parseQuickCapture, parseUniversalCapture } from "./parsing";

describe("parseUniversalCapture", () => {
  it("parses idea prefixes", () => {
    expect(parseUniversalCapture("new idea: ambient music sketch")).toEqual({
      type: "idea",
      text: "ambient music sketch"
    });
    expect(parseUniversalCapture("IDEA: Side project")).toEqual({
      type: "idea",
      text: "Side project"
    });
  });

  it("parses worked on prefixes with payload", () => {
    expect(parseUniversalCapture("worked on rpg for 10 min")).toEqual({
      type: "worked_on",
      text: "rpg for 10 min"
    });
    expect(parseUniversalCapture("Worked On: resume pipeline")).toEqual({
      type: "worked_on",
      text: "resume pipeline"
    });
  });

  it("parses follow-up prefixes", () => {
    expect(parseUniversalCapture("followed up with recruiter")).toEqual({
      type: "followed_up",
      text: "recruiter"
    });
    expect(parseUniversalCapture("followed up: Acme HR")).toEqual({
      type: "followed_up",
      text: "Acme HR"
    });
  });

  it("parses agent finished prefixes", () => {
    expect(parseUniversalCapture("agent finished card split")).toEqual({
      type: "agent_finished",
      text: "card split"
    });
    expect(parseUniversalCapture("Agent Done proof ledger")).toEqual({
      type: "agent_finished",
      text: "proof ledger"
    });
  });

  it("parses resume exported prefixes", () => {
    expect(parseUniversalCapture("resume exported for Acme application")).toEqual({
      type: "resume_exported",
      text: "Acme application"
    });
    expect(parseUniversalCapture("resume exported: life harness role")).toEqual({
      type: "resume_exported",
      text: "life harness role"
    });
  });

  it("parses park prefix only", () => {
    expect(parseUniversalCapture("park local llm")).toEqual({
      type: "park",
      text: "local llm"
    });
    expect(parseUniversalCapture("park: resume automation")).toEqual({
      type: "park",
      text: "resume automation"
    });
  });

  it("does not parse parking as park intent", () => {
    expect(parseUniversalCapture("parking the thought for later")).toBeUndefined();
  });

  it("rejects empty payloads", () => {
    expect(parseUniversalCapture("new idea:")).toBeUndefined();
    expect(parseUniversalCapture("worked on ")).toBeUndefined();
    expect(parseUniversalCapture("park:")).toBeUndefined();
  });

  it("trims whitespace in payloads", () => {
    expect(parseUniversalCapture("  worked on   resume pipeline  ")).toEqual({
      type: "worked_on",
      text: "resume pipeline"
    });
  });

  it("does not parse legacy implicit patterns", () => {
    expect(parseUniversalCapture("applied to Acme")).toBeUndefined();
    expect(parseUniversalCapture("bought cart $45")).toBeUndefined();
    expect(parseUniversalCapture("walked around the block")).toBeUndefined();
  });

  it("exposes grammar hint for unmatched capture", () => {
    expect(CAPTURE_GRAMMAR_HINT).toContain("worked on");
    expect(parseQuickCapture("random note")).toBeUndefined();
  });
});
