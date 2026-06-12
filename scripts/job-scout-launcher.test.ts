import { describe, expect, it, vi } from "vitest";

import { isRunnerHealthy, startRunnerAndWait } from "./job-scout-launcher";

describe("job-scout-launcher helpers", () => {
  it("reports healthy when runner health endpoint responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true
      })
    );

    await expect(isRunnerHealthy()).resolves.toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns already running when health check passes before spawn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true
      })
    );

    const result = await startRunnerAndWait(100);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("already awake");

    vi.unstubAllGlobals();
  });
});
