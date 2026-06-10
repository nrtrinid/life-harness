import { describe, expect, it } from "vitest";

import { getChatSurfaceHeight } from "./chatSurfaceLayout";

describe("getChatSurfaceHeight", () => {
  it("returns a fixed viewport fraction for harness layouts", () => {
    expect(getChatSurfaceHeight(1000, "harness", true)).toBe(550);
    expect(getChatSurfaceHeight(1000, "harness", false)).toBe(500);
  });

  it("returns a smaller fixed viewport fraction for raw lab", () => {
    expect(getChatSurfaceHeight(1000, "rawLab")).toBe(450);
  });
});
