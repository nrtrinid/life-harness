#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PRE_TOOL = path.join(ROOT, ".codex", "hooks", "pre-tool-use-policy.js");
const STOP = path.join(ROOT, ".codex", "hooks", "stop-summary-policy.js");

function runHook(script, input, env = {}) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited ${result.status}: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    throw new Error(`${path.basename(script)} returned invalid JSON: ${result.stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [
  () => {
    const output = runHook(PRE_TOOL, { tool_input: { command: "npm install left-pad" } });
    assert(output.hookSpecificOutput?.permissionDecision === "deny", "dependency install should be denied");
  },
  () => {
    const output = runHook(PRE_TOOL, { tool_input: { command: "npm run agent:bootstrap" } });
    assert(Object.keys(output).length === 0, "agent bootstrap should be allowed");
  },
  () => {
    const output = runHook(PRE_TOOL, { tool_input: { command: "git add ." } });
    assert(output.hookSpecificOutput?.permissionDecision === "deny", "git add . should be denied");
  },
  () => {
    const output = runHook(PRE_TOOL, { tool_input: { command: "npm run test" } });
    assert(output.hookSpecificOutput?.additionalContext, "broad test should receive context");
  },
  () => {
    const output = runHook(PRE_TOOL, { tool_input: { command: "Get-Content -Raw package-lock.json" } });
    assert(output.hookSpecificOutput?.permissionDecision === "deny", "large direct read should be denied");
  },
  () => {
    const output = runHook(STOP, { stop_hook_active: true, last_assistant_message: "" }, {
      LIFE_HARNESS_HOOK_TEST_STATUS: " M docs/CODEX_HOOKS.md"
    });
    assert(Object.keys(output).length === 0, "active stop hook should no-op");
  },
  () => {
    const output = runHook(STOP, { stop_hook_active: false, last_assistant_message: "" }, {
      LIFE_HARNESS_HOOK_TEST_STATUS: ""
    });
    assert(Object.keys(output).length === 0, "no changed files should no-op");
  },
  () => {
    const output = runHook(STOP, { stop_hook_active: false, last_assistant_message: "Done." }, {
      LIFE_HARNESS_HOOK_TEST_STATUS: " M docs/CODEX_HOOKS.md"
    });
    assert(output.decision === "block", "missing checklist with changed files should block");
  }
];

try {
  checks.forEach((check) => check());
  console.log(`codex hook smoke: PASS (${checks.length} checks)`);
} catch (error) {
  console.error(`codex hook smoke: FAIL - ${error.message}`);
  process.exit(1);
}
