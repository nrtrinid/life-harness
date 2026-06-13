import { describe, expect, it } from "vitest";

import { buildAgentSpawnSpec, needsWindowsAgentSpawnShim } from "../src/agentSpawn";

describe("buildAgentSpawnSpec", () => {
  it("uses cmd.exe shim for .cmd agents on Windows", () => {
    const bin = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd";
    const args = ["exec", "-"];

    expect(buildAgentSpawnSpec(bin, args, "win32")).toEqual({
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", bin, ...args]
    });
  });

  it("uses cmd.exe shim for .bat and .ps1 agents on Windows", () => {
    expect(needsWindowsAgentSpawnShim("scripts\\cursor-agent-wrapper.cmd", "win32")).toBe(true);
    expect(needsWindowsAgentSpawnShim("run.bat", "win32")).toBe(true);
    expect(needsWindowsAgentSpawnShim("tool.ps1", "win32")).toBe(true);
  });

  it("spawns native executables directly on Windows", () => {
    expect(
      buildAgentSpawnSpec("C:\\Program Files\\nodejs\\node.exe", ["script.js"], "win32")
    ).toEqual({
      file: "C:\\Program Files\\nodejs\\node.exe",
      args: ["script.js"]
    });
  });

  it("spawns agents directly on non-Windows", () => {
    expect(buildAgentSpawnSpec("codex", ["exec", "-"], "linux")).toEqual({
      file: "codex",
      args: ["exec", "-"]
    });
  });
});
