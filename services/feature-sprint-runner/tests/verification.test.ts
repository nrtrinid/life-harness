import { describe, expect, it } from "vitest";

import { buildVerificationSpawn, parseVerificationCommand } from "../src/verification";

describe("parseVerificationCommand", () => {
  it("accepts allowlisted simple commands", () => {
    expect(parseVerificationCommand("npm run typecheck")).toEqual({
      command: "npm run typecheck",
      bin: "npm",
      args: ["run", "typecheck"]
    });
    expect(parseVerificationCommand("npm --version")).toEqual({
      command: "npm --version",
      bin: "npm",
      args: ["--version"]
    });
    expect(parseVerificationCommand("node .life-harness/verify-pass.js")).toMatchObject({
      command: "node .life-harness/verify-pass.js",
      bin: "node",
      args: [".life-harness/verify-pass.js"]
    });
  });

  it("rejects shell metacharacters including single ampersand", () => {
    for (const command of [
      "npm test | head",
      "npm test && npm run lint",
      "npm test && echo hi",
      "npm test || true",
      "cmd1 & cmd2",
      "npm test; rm -rf .",
      "node -e \"console.log('ok')\"",
      "npm test > out.txt"
    ]) {
      expect(parseVerificationCommand(command)).toBeNull();
    }
  });

  it("rejects blocked and unknown commands", () => {
    for (const command of ["cd ..", "rm -rf .", "curl https://example.com", "git status", "bash script.sh"]) {
      expect(parseVerificationCommand(command)).toBeNull();
    }
  });

  it("rejects env assignments and empty commands", () => {
    expect(parseVerificationCommand("FOO=bar npm test")).toBeNull();
    expect(parseVerificationCommand("   ")).toBeNull();
  });
});

describe("buildVerificationSpawn", () => {
  it("uses cmd.exe shim for package-manager bins on Windows", () => {
    const parsed = parseVerificationCommand("npm --version");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "win32")).toEqual({
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "--version"]
    });
  });

  it("spawns package-manager bins directly on non-Windows", () => {
    const parsed = parseVerificationCommand("npm --version");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "linux")).toEqual({
      file: "npm",
      args: ["--version"]
    });
  });

  it("does not wrap native executables on Windows", () => {
    const parsed = parseVerificationCommand("node .life-harness/verify-pass.js");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "win32")).toEqual({
      file: "node",
      args: [".life-harness/verify-pass.js"]
    });
  });
});
