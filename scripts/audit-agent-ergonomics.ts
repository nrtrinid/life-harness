import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, REPO_ROOT, repoPath } from "./agent-utils";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LIFE_HARNESS_ROOT = resolve(SCRIPT_DIR, "..");

export type SurfaceStatus = "pass" | "warn" | "fail" | "skip";

export type RepoProfile = {
  name: string;
  defaultPath: string;
  entrypoints: string[];
  contextMap: string;
  preflightCommand: string;
  preflightShell?: boolean;
  doctorCommands?: string[];
  testSelectCommand?: string;
  noTouchFiles: string[];
  noTouchMarkers: string[];
  handoffMarkers: string[];
  handoffSearchPaths: string[];
  extraDoctorCommands?: string[];
};

export type SurfaceResult = {
  surface: string;
  status: SurfaceStatus;
  message: string;
};

export type RepoAuditResult = {
  name: string;
  root: string;
  overall: SurfaceStatus;
  surfaces: SurfaceResult[];
};

const PROFILES: RepoProfile[] = [
  {
    name: "life-harness",
    defaultPath: ".",
    entrypoints: ["AGENTS.md"],
    contextMap: "docs/AGENT_CONTEXT_MAP.md",
    preflightCommand: "npm run agent:preflight",
    doctorCommands: ["npm run check:agent-budget", "npm run check:agent-commands"],
    testSelectCommand: "npm run agent:tests-for -- --changed",
    noTouchFiles: [".agentignore"],
    noTouchMarkers: ["DO_NOT_READ:", "no-touch"],
    handoffMarkers: ["Changed / Tests / Docs / Risks", "Next safe step"],
    handoffSearchPaths: ["AGENTS.md", "docs/AGENT_CONTEXT_MAP.md"]
  },
  {
    name: "text-adventure",
    defaultPath: "../text-adventure/dungeon-party-game",
    entrypoints: ["AGENTS.md"],
    contextMap: "docs/AGENT_CONTEXT_MAP.md",
    preflightCommand: "rtk.ps1 preflight",
    preflightShell: true,
    testSelectCommand: undefined,
    noTouchFiles: [".agentignore"],
    noTouchMarkers: ["DO_NOT_READ", "no-touch", "DO_NOT_READ:"],
    handoffMarkers: ["Next safe step", "Changed / Tests"],
    handoffSearchPaths: [
      "AGENTS.md",
      "docs/AGENT_CONTEXT_MAP.md",
      "docs/STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md",
      "prompts/agent_workflow.md"
    ]
  },
  {
    name: "ev-tracker",
    defaultPath: "../ev-tracker",
    entrypoints: ["README.md", "docs/CODEX_HANDOFF.md"],
    contextMap: "docs/AGENT_CONTEXT_MAP.md",
    preflightCommand: "python scripts/agent_preflight.py",
    doctorCommands: ["python scripts/agent_doctor.py"],
    testSelectCommand: "python scripts/agent_test_select.py docs/README.md",
    noTouchFiles: [],
    noTouchMarkers: ["DO_NOT_READ", "no-touch", "Default No-Touch", "No-Touch"],
    handoffMarkers: ["Changed / Tests / Docs / Risks", "Next safe step", "Final response:"],
    handoffSearchPaths: ["docs/AGENT_CONTEXT_MAP.md", "README.md", "docs/CODEX_HANDOFF.md"]
  }
];

function readText(root: string, relativePath: string): string {
  const fullPath = join(root, relativePath);
  if (!existsSync(fullPath)) {
    return "";
  }
  return readFileSync(fullPath, "utf8");
}

function anyExists(root: string, paths: string[]): string | null {
  for (const path of paths) {
    if (existsSync(join(root, path))) {
      return path;
    }
  }
  return null;
}

export function assessContextMapShape(text: string): { status: SurfaceStatus; message: string } {
  if (!text.trim()) {
    return { status: "fail", message: "context map missing or empty" };
  }
  const taskHeaders = text.match(/^##\s+\S+/gm) ?? [];
  const hasUseWhen =
    /Use when:/i.test(text) ||
    /\*\*Use when:\*\*/i.test(text) ||
    /READ_FIRST/i.test(text);
  const hasVerify = /VERIFY/i.test(text) || /\*\*VERIFY\*\*/i.test(text);
  if (taskHeaders.length < 2) {
    return { status: "fail", message: "expected multiple task sections in context map" };
  }
  if (!hasUseWhen || !hasVerify) {
    return { status: "warn", message: "task blocks present but Use when / VERIFY markers incomplete" };
  }
  return { status: "pass", message: `found ${taskHeaders.length} task sections` };
}

export function hasHandoffMarkers(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

export function assessNoTouch(
  root: string,
  contextMapText: string,
  noTouchFiles: string[],
  noTouchMarkers: string[]
): SurfaceResult {
  if (noTouchFiles.some((file) => existsSync(join(root, file)))) {
    return { surface: "no-touch", status: "pass", message: "ignore file present" };
  }
  if (noTouchMarkers.some((marker) => contextMapText.includes(marker))) {
    return { surface: "no-touch", status: "pass", message: "no-touch guidance in context map" };
  }
  return { surface: "no-touch", status: "fail", message: "no .agentignore or no-touch section found" };
}

function runCommand(root: string, command: string, shell?: boolean): void {
  if (shell && process.platform === "win32") {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File ${command}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return;
  }
  if (shell && process.platform !== "win32") {
    throw new Error(`shell command requires Windows: ${command}`);
  }
  execSync(command, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
}

function smokeCommand(
  root: string,
  command: string | undefined,
  surface: string,
  shell?: boolean
): SurfaceResult {
  if (!command) {
    return { surface, status: "skip", message: "not defined for profile" };
  }
  try {
    runCommand(root, command, shell);
    return { surface, status: "pass", message: command };
  } catch (error) {
    if (shell && process.platform !== "win32") {
      return { surface, status: "warn", message: `skipped on non-Windows: ${command}` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { surface, status: "fail", message: `${command} failed: ${message}` };
  }
}

function overallStatus(surfaces: SurfaceResult[]): SurfaceStatus {
  if (surfaces.some((surface) => surface.status === "fail")) {
    return "fail";
  }
  if (surfaces.some((surface) => surface.status === "warn")) {
    return "warn";
  }
  return "pass";
}

export function auditRepoProfile(root: string, profile: RepoProfile): RepoAuditResult {
  const surfaces: SurfaceResult[] = [];
  const absRoot = resolve(root);

  if (!existsSync(absRoot)) {
    return {
      name: profile.name,
      root: repoPath(absRoot),
      overall: "skip",
      surfaces: [{ surface: "root", status: "skip", message: "path not found" }]
    };
  }

  const entrypoint = anyExists(absRoot, profile.entrypoints);
  surfaces.push(
    entrypoint
      ? { surface: "entrypoint", status: "pass", message: entrypoint }
      : {
          surface: "entrypoint",
          status: "fail",
          message: `missing one of: ${profile.entrypoints.join(", ")}`
        }
  );

  const contextMapPath = join(absRoot, profile.contextMap);
  const contextMapText = existsSync(contextMapPath) ? readFileSync(contextMapPath, "utf8") : "";
  const contextShape = assessContextMapShape(contextMapText);
  surfaces.push({ surface: "context-map", ...contextShape });

  surfaces.push(assessNoTouch(absRoot, contextMapText, profile.noTouchFiles, profile.noTouchMarkers));

  const handoffTexts = profile.handoffSearchPaths
    .map((path) => readText(absRoot, path))
    .filter(Boolean)
    .join("\n");
  surfaces.push(
    hasHandoffMarkers(handoffTexts, profile.handoffMarkers)
      ? { surface: "handoff", status: "pass", message: "handoff markers found" }
      : { surface: "handoff", status: "fail", message: "handoff shape not documented" }
  );

  surfaces.push(
    smokeCommand(absRoot, profile.preflightCommand, "preflight", profile.preflightShell)
  );

  if (profile.doctorCommands?.length) {
    for (const command of profile.doctorCommands) {
      surfaces.push(smokeCommand(absRoot, command, "doctor"));
    }
  } else {
    surfaces.push({ surface: "doctor", status: "warn", message: "folded into preflight or manual" });
  }

  surfaces.push(smokeCommand(absRoot, profile.testSelectCommand, "test-select"));

  return {
    name: profile.name,
    root: repoPath(absRoot),
    overall: overallStatus(surfaces.filter((surface) => surface.status !== "skip")),
    surfaces
  };
}

function profileByName(name: string): RepoProfile | undefined {
  return PROFILES.find((profile) => profile.name === name);
}

function resolveProfileRoot(profile: RepoProfile, overridePath?: string): string {
  if (overridePath) {
    return resolve(overridePath);
  }
  if (profile.name === "life-harness") {
    return LIFE_HARNESS_ROOT;
  }
  return resolve(LIFE_HARNESS_ROOT, profile.defaultPath);
}

function printRepoResult(result: RepoAuditResult): void {
  console.log(`## ${result.name} (${result.overall.toUpperCase()})`);
  console.log(`Root: ${result.root}`);
  for (const surface of result.surfaces) {
    console.log(`- ${surface.surface}: ${surface.status.toUpperCase()} — ${surface.message}`);
  }
  console.log("");
}

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  const auditAll = flags.has("all");
  const repoFlag = typeof flags.get("repo") === "string" ? String(flags.get("repo")) : null;
  const pathFlag = typeof flags.get("path") === "string" ? String(flags.get("path")) : null;

  const selected: Array<{ profile: RepoProfile; root?: string }> = [];
  if (repoFlag) {
    const profile = profileByName(repoFlag);
    if (!profile) {
      console.error(`Unknown repo profile: ${repoFlag}`);
      process.exitCode = 1;
      return;
    }
    selected.push({ profile, root: pathFlag ?? undefined });
  } else if (auditAll) {
    for (const profile of PROFILES) {
      selected.push({ profile });
    }
  } else {
    const profile = profileByName("life-harness");
    if (profile) {
      selected.push({ profile });
    }
  }

  console.log("# Agent Ergonomics Audit");
  console.log(`Life Harness reference root: ${repoPath(REPO_ROOT)}`);
  console.log("");

  const results: RepoAuditResult[] = [];
  for (const item of selected) {
    const root = resolveProfileRoot(item.profile, item.root);
    if (!existsSync(root) && item.profile.name !== "life-harness") {
      console.log(`## ${item.profile.name} (SKIP)`);
      console.log(`Root: ${repoPath(root)}`);
      console.log("- root: SKIP — path not found");
      console.log("");
      continue;
    }
    results.push(auditRepoProfile(root, item.profile));
  }

  for (const result of results) {
    printRepoResult(result);
  }

  const failed = results.some((result) => result.overall === "fail");
  console.log(`Audit: ${failed ? "FAIL" : "PASS"}`);
  if (failed) {
    process.exitCode = 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
