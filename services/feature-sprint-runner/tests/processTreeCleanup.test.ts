import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { killProcessTree, spawnAgentProcess } from "../src/spawnAgent";

const fixtureParent = path.resolve(
  __dirname,
  "../scripts/fixtures/spawn_tree_parent.js"
);

function processAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  if (process.platform === "win32") {
    const result = spawnSync(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true }
    );
    const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    return out.includes(`"${pid}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("Windows process-tree cleanup fixture", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("classifies timeout and kills parent + descendant", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "fs-tree-timeout-"));
    dirs.push(dir);
    const marker = path.join(dir, "child.marker");

    const result = await spawnAgentProcess({
      bin: process.execPath,
      args: [fixtureParent],
      cwd: dir,
      env: {
        ...process.env,
        FEATURE_SPRINT_TREE_MARKER: marker
      },
      timeoutMs: 800,
      maxStdoutChars: 20_000,
      maxStderrChars: 20_000,
      killGraceMs: 200
    });

    expect(result.termination).toBe("timeout");
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.stdout).toContain("TREE_PARENT_READY");

    // Marker may exist briefly; after kill, pids must not remain.
    await new Promise((r) => setTimeout(r, 400));
    if (existsSync(marker)) {
      const body = readFileSync(marker, "utf8");
      const match = /descendant:(\d+)/.exec(body);
      if (match) {
        const childPid = Number.parseInt(match[1]!, 10);
        expect(processAlive(childPid)).toBe(false);
      }
    }
    if (result.pid) {
      expect(processAlive(result.pid)).toBe(false);
    }
  }, 20_000);

  it("classifies cancellation and allows a second spawn afterward", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "fs-tree-cancel-"));
    dirs.push(dir);
    const marker = path.join(dir, "child.marker");
    const controller = new AbortController();

    const pending = spawnAgentProcess({
      bin: process.execPath,
      args: [fixtureParent],
      cwd: dir,
      env: {
        ...process.env,
        FEATURE_SPRINT_TREE_MARKER: marker
      },
      timeoutMs: 30_000,
      maxStdoutChars: 20_000,
      maxStderrChars: 20_000,
      signal: controller.signal,
      killGraceMs: 200
    });

    await new Promise((r) => setTimeout(r, 300));
    controller.abort();
    const cancelled = await pending;

    expect(cancelled.termination).toBe("cancelled");
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.timedOut).toBe(false);
    expect(cancelled.stdout.length).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 400));
    if (cancelled.pid) {
      expect(processAlive(cancelled.pid)).toBe(false);
    }

    // Runner reuse: a second short process must still work.
    const second = await spawnAgentProcess({
      bin: process.execPath,
      args: ["-e", "process.stdout.write('REUSE_OK'); process.exit(0);"],
      cwd: dir,
      timeoutMs: 5_000,
      maxStdoutChars: 1000,
      maxStderrChars: 1000
    });
    expect(second.termination).toBe("completed");
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("REUSE_OK");
  }, 20_000);

  it("killProcessTree is a no-op for invalid pids", () => {
    expect(() => killProcessTree(-1)).not.toThrow();
    expect(() => killProcessTree(0)).not.toThrow();
  });
});
