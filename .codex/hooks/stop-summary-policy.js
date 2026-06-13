#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const { parseJsonInput, writeJson } = require("./hook-utils");

const CHECKLIST_REASON =
  "Before finishing, provide a concise final response with: files changed, tests/checks run, known failures, skipped checks and why, and boundary/scope risks. Use npm run agent:review-packet if helpful.";

function getChangedFiles() {
  if (process.env.LIFE_HARNESS_HOOK_TEST_STATUS !== undefined) {
    return process.env.LIFE_HARNESS_HOOK_TEST_STATUS
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  try {
    return execFileSync("git", ["status", "--short"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasChecklist(message) {
  const lower = String(message || "").toLowerCase();
  const required = [
    "files changed",
    "tests",
    "known failures",
    "skipped checks",
    "boundary"
  ];
  return required.every((term) => lower.includes(term));
}

function evaluate(input) {
  if (!input || input.stop_hook_active === true) return {};
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) return {};
  if (hasChecklist(input.last_assistant_message)) return {};
  return {
    decision: "block",
    reason: CHECKLIST_REASON
  };
}

function main() {
  const input = parseJsonInput();
  if (!input) return writeJson({});
  writeJson(evaluate(input));
}

if (require.main === module) {
  main();
}

module.exports = { evaluate };
