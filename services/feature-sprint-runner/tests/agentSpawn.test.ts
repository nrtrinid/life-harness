import { describe, expect, it } from "vitest";

import {
  buildAgentSpawnSpec,
  needsWindowsAgentSpawnShim,
  quoteWindowsCmdArg
} from "../src/agentSpawn";

describe("buildAgentSpawnSpec", () => {
  it("uses cmd.exe shim with quoted cmdline for .cmd agents on Windows", () => {
    const bin = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd";
    const args = ["exec", "-"];

    expect(buildAgentSpawnSpec(bin, args, "win32")).toEqual({
      file: process.env.ComSpec ?? "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        `""${bin}" "exec" "-""`
      ],
      windowsVerbatimArguments: true
    });
  });

  it("quotes paths containing spaces for cmd.exe", () => {
    const bin = "C:\\Program Files\\tools\\agent.cmd";
    const args = ["-p", "--workspace", "C:\\Users\\Nick Smith\\repo"];

    const spec = buildAgentSpawnSpec(bin, args, "win32");
    expect(spec.file).toBe(process.env.ComSpec ?? "cmd.exe");
    expect(spec.args[0]).toBe("/d");
    expect(spec.args[1]).toBe("/s");
    expect(spec.args[2]).toBe("/c");
    // Outer wrap for /s /c, plus per-arg quotes.
    expect(spec.args[3]).toBe(
      `""C:\\Program Files\\tools\\agent.cmd" "-p" "--workspace" "C:\\Users\\Nick Smith\\repo""`
    );
  });

  it("quotes metacharacters so cmd.exe cannot reinterpret them", () => {
    const bin = "C:\\tools\\agent.cmd";
    const model = "model&whoami";
    const tempish = "%TEMP%";
    const workspace = "C:\\Users\\Nick Smith\\life harness";
    const quoted = 'say "hi"';

    const spec = buildAgentSpawnSpec(bin, ["-p", "--model", model, tempish, workspace, quoted], "win32");
    const cmdline = spec.args[3]!;

    expect(cmdline.startsWith('"')).toBe(true);
    expect(cmdline.endsWith('"')).toBe(true);
    expect(cmdline).toContain('"model&whoami"');
    expect(cmdline).toContain('"^%TEMP^%"');
    expect(cmdline).toContain('"C:\\Users\\Nick Smith\\life harness"');
    expect(cmdline).toContain('"say ""hi"""');
  });

  it("uses PowerShell -File for .ps1 agents on Windows", () => {
    const bin = "C:\\Users\\me\\AppData\\Local\\cursor-agent\\agent.ps1";
    const spec = buildAgentSpawnSpec(bin, ["--version"], "win32");
    expect(spec.file.toLowerCase()).toContain("powershell");
    expect(spec.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      bin,
      "--version"
    ]);
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

  it("quoteWindowsCmdArg always quotes and escapes % / embedded quotes", () => {
    expect(quoteWindowsCmdArg("")).toBe('""');
    expect(quoteWindowsCmdArg("plain")).toBe('"plain"');
    expect(quoteWindowsCmdArg("a b")).toBe('"a b"');
    expect(quoteWindowsCmdArg('say "hi"')).toBe('"say ""hi"""');
    expect(quoteWindowsCmdArg("model&whoami")).toBe('"model&whoami"');
    expect(quoteWindowsCmdArg("%TEMP%")).toBe('"^%TEMP^%"');
    expect(quoteWindowsCmdArg("a|b>c<d^e")).toBe('"a|b>c<d^^e"');
  });
});

describe("cmd.exe metachar spawn (safe fixture)", () => {
  it("passes model&whoami and %TEMP% through without shell reinterpretation", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { spawnAgentProcess } = await import("../src/spawnAgent");

    const dir = await mkdtemp(path.join(os.tmpdir(), "cmd-meta-"));
    const script = path.join(dir, "echo-args.cmd");
    // Echo all args; do not execute them as commands.
    await writeFile(script, "@echo off\r\necho ARGS:%*\r\n", "utf8");

    try {
      const result = await spawnAgentProcess({
        bin: script,
        args: ["model&whoami", "%TEMP%", "C:\\Users\\Nick Smith\\repo", 'say "hi"'],
        cwd: dir,
        timeoutMs: 10_000,
        maxStdoutChars: 4_000,
        maxStderrChars: 4_000
      });

      expect(result.termination).toBe("completed");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("model&whoami");
      // % must not expand to a filesystem path; caret-escaped literal is acceptable.
      expect(result.stdout).toMatch(/%TEMP%|\^%TEMP\^%/);
      expect(result.stdout).not.toMatch(/"[A-Za-z]:\\Users\\[^"]+\\Temp"/i);
      expect(result.stdout).toContain("Nick Smith");
      expect(result.stdout).toContain("say");
      expect(result.stdout).toContain("hi");
      // If & were a command separator, whoami would run as its own command.
      expect(result.stderr.toLowerCase()).not.toContain("whoami");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
