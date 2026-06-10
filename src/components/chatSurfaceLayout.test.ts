import { describe, expect, it } from "vitest";

import { getChatSurfaceHeight } from "./chatSurfaceLayout";

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
