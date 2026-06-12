import { describe, expect, it } from "vitest";

import {
  getChatComposerInputMaxHeight,
  getChatFillPaneMinHeight,
  getChatSurfaceHeight
} from "./chatSurfaceLayout";

describe("getChatSurfaceHeight", () => {
  it("returns at least 420px and scales with viewport", () => {
    expect(getChatSurfaceHeight(1000, "harness", true)).toBe(620);
    expect(getChatSurfaceHeight(1000, "harness", false)).toBe(620);
    expect(getChatSurfaceHeight(600, "harness")).toBe(420);
  });

  it("uses the same scale for raw signal", () => {
    expect(getChatSurfaceHeight(1000, "rawLab")).toBe(620);
    expect(getChatSurfaceHeight(600, "rawLab")).toBe(420);
  });
});

describe("getChatComposerInputMaxHeight", () => {
  it("scales with viewport and enforces a usable floor", () => {
    expect(getChatComposerInputMaxHeight(900)).toBe(174);
    expect(getChatComposerInputMaxHeight(600)).toBe(160);
  });
});

describe("getChatFillPaneMinHeight", () => {
  it("reserves space for page chrome and enforces a floor", () => {
    expect(getChatFillPaneMinHeight(900)).toBe(540);
    expect(getChatFillPaneMinHeight(500)).toBe(240);
  });
});
