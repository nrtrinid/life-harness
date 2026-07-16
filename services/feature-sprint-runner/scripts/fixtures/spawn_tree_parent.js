/**
 * Parent fixture: spawns a long-lived child, prints partial output, then sleeps.
 * Used to verify timeout/cancel kills the whole tree on Windows.
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const childScript = path.join(__dirname, "spawn_tree_child.js");
const marker = process.env.FEATURE_SPRINT_TREE_MARKER;

process.stdout.write(`TREE_PARENT_READY pid=${process.pid}\n`);

const child = spawn(process.execPath, [childScript], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    FEATURE_SPRINT_TREE_MARKER: marker,
    FEATURE_SPRINT_TREE_LABEL: "descendant"
  },
  windowsHide: true
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(String(chunk));
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(String(chunk));
});

child.on("exit", (code) => {
  process.stdout.write(`TREE_CHILD_EXIT code=${code}\n`);
});

setInterval(() => {}, 60_000);
