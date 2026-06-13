#!/usr/bin/env node
const { getCommand, parseJsonInput, writeJson } = require("./hook-utils");

const DEP_REASON =
  "Dependency changes must be explicitly scoped. If this task intentionally adds dependencies, rerun with LIFE_HARNESS_ALLOW_DEP_CHANGE=1 and call it out in the final response.";
const BULK_GIT_REASON =
  "Bulk staging/commit is blocked to avoid mixing unrelated WIP. Stage scoped files explicitly or rerun with LIFE_HARNESS_ALLOW_BULK_GIT=1 if intentional.";
const LARGE_READ_REASON =
  "This file is not default-read. Use npm run agent:map, agent:grep, or targeted line reads instead. If the large read is intentional, rerun with LIFE_HARNESS_ALLOW_LARGE_READ=1.";
const BROAD_TEST_CONTEXT =
  "Broad test output can be expensive. Prefer npm run agent:test, npm run agent:verify, or npm run agent:failures when compact agent-facing output is enough.";

const LARGE_READ_PATHS = [
  "docs/meta/life_harness_compiled_context.md",
  "docs/ux/current_ux_audit.md",
  "package-lock.json",
  "docs/plans/a770-local-intelligence-integrated-roadmap.md",
  "docs/plans/a770-local-intelligence-roadmap.md",
  "docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md",
  "docs/plans/ai-gateway-model-slots-v0.1.md",
  "docs/plans/ask-deep-synthesis-ui-v0.1.md",
  "docs/plans/board-usability-v0.1.md",
  "docs/plans/companion-reflection-engine-v0.1.md",
  "docs/plans/context-packet-builder-v0.1.md",
  "docs/plans/deep-synthesis-overnight-brain-v0.1.md",
  "docs/plans/feature-sprint-v2-living-spec-loop-v0.1.md",
  "docs/plans/local-ai-deep-ux-v0.1.md",
  "docs/plans/local-ai-evals-v0.1.md",
  "docs/plans/local-coding-agent-loop-v0.1.md",
  "docs/plans/odysseus-patterns-repo-map-v0.1.md",
  "docs/plans/phi4-critic-deep-pass-v0.1.md",
  "docs/plans/raw-lab-deep-thinking-v0.1.md",
  "docs/plans/stash-recovery-a770-thinking-audit.md"
];

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}

function context(message) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: message
    }
  };
}

function hasOverride(command, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s;&])(?:\\$env:)?${escaped}\\s*=\\s*1\\b`, "i").test(command);
}

function normalizeCommand(command) {
  return command.replace(/\s+/g, " ").trim();
}

function looksLikeDependencyChange(command) {
  const normalized = normalizeCommand(command);
  return (
    /\bnpm(?:\.cmd)?\s+(?:install|i|add)\s+(?!run\b|test\b|ci\b)\S+/i.test(normalized) ||
    /\b(?:pnpm|yarn|bun)\s+add\s+\S+/i.test(normalized)
  );
}

function looksLikeBulkGit(command) {
  const normalized = normalizeCommand(command);
  return (
    /\bgit\s+add\s+(?:\.|-A|--all)(?:\s|$)/i.test(normalized) ||
    /\bgit\s+commit\s+(?:-[^\s]*a[^\s]*|--all)(?:\s|$)/i.test(normalized)
  );
}

function looksLikeLargeRead(command) {
  const normalized = command.replace(/\\/g, "/").toLowerCase();
  if (!/\b(?:cat|type|more|less|get-content)\b/i.test(command)) return false;
  return LARGE_READ_PATHS.some((target) => normalized.includes(target));
}

function looksLikeBroadTest(command) {
  const normalized = normalizeCommand(command);
  return /\bnpm(?:\.cmd)?\s+run\s+(?:test|verify)(?:\s|$)/i.test(normalized);
}

function evaluate(command) {
  if (!command) return {};
  if (looksLikeDependencyChange(command) && !hasOverride(command, "LIFE_HARNESS_ALLOW_DEP_CHANGE")) {
    return deny(DEP_REASON);
  }
  if (looksLikeBulkGit(command) && !hasOverride(command, "LIFE_HARNESS_ALLOW_BULK_GIT")) {
    return deny(BULK_GIT_REASON);
  }
  if (looksLikeLargeRead(command) && !hasOverride(command, "LIFE_HARNESS_ALLOW_LARGE_READ")) {
    return deny(LARGE_READ_REASON);
  }
  if (looksLikeBroadTest(command)) {
    return context(BROAD_TEST_CONTEXT);
  }
  return {};
}

function main() {
  const input = parseJsonInput();
  if (!input) return writeJson({});
  writeJson(evaluate(getCommand(input)));
}

if (require.main === module) {
  main();
}

module.exports = { evaluate };
