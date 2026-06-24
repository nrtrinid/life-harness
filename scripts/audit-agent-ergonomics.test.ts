import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  assessContextMapShape,
  assessNoTouch,
  auditRepoProfile,
  hasHandoffMarkers,
  type RepoProfile
} from "./audit-agent-ergonomics";

describe("assessContextMapShape", () => {
  it("passes maps with task sections and markers", () => {
    const text = [
      "## Task: core",
      "Use when:",
      "- core work",
      "READ_FIRST:",
      "VERIFY:",
      "",
      "## Task: docs",
      "Use when:",
      "VERIFY:"
    ].join("\n");
    expect(assessContextMapShape(text).status).toBe("pass");
  });

  it("fails empty maps", () => {
    expect(assessContextMapShape("").status).toBe("fail");
  });
});

describe("hasHandoffMarkers", () => {
  it("detects portable handoff shape", () => {
    const text = "Summarize handoff: Changed / Tests / Docs / Risks / Did not touch / Next safe step.";
    expect(hasHandoffMarkers(text, ["Changed / Tests / Docs / Risks", "Next safe step"])).toBe(true);
  });
});

describe("assessNoTouch", () => {
  it("passes when agentignore exists", () => {
    const root = mkdtempSync(join(tmpdir(), "lh-audit-"));
    writeFileSync(join(root, ".agentignore"), "private/\n");
    const result = assessNoTouch(root, "", [".agentignore"], ["DO_NOT_READ"]);
    expect(result.status).toBe("pass");
  });
});

describe("auditRepoProfile", () => {
  it("fails minimal fixture missing required surfaces", () => {
    const root = mkdtempSync(join(tmpdir(), "lh-audit-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "Changed / Tests / Docs / Risks / Next safe step\n");
    writeFileSync(
      join(root, "docs/AGENT_CONTEXT_MAP.md"),
      "## Task: x\nUse when:\nREAD_FIRST:\nVERIFY:\nDO_NOT_READ:\n\n## Task: y\nUse when:\nVERIFY:\n"
    );
    writeFileSync(join(root, ".agentignore"), "tmp/\n");

    const profile: RepoProfile = {
      name: "fixture",
      defaultPath: ".",
      entrypoints: ["AGENTS.md"],
      contextMap: "docs/AGENT_CONTEXT_MAP.md",
      preflightCommand: "node -e \"process.exit(0)\"",
      noTouchFiles: [".agentignore"],
      noTouchMarkers: ["DO_NOT_READ"],
      handoffMarkers: ["Changed / Tests", "Next safe step"],
      handoffSearchPaths: ["AGENTS.md"]
    };

    const result = auditRepoProfile(root, profile);
    expect(result.surfaces.find((surface) => surface.surface === "entrypoint")?.status).toBe("pass");
    expect(result.surfaces.find((surface) => surface.surface === "context-map")?.status).toBe("pass");
    expect(result.surfaces.find((surface) => surface.surface === "preflight")?.status).toBe("pass");
  });
});
