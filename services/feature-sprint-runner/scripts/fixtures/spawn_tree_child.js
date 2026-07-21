/**
 * Disposable descendant process for Windows process-tree cleanup smokes.
 * Writes a marker file, prints a line, then sleeps until killed.
 */
const fs = require("node:fs");
const path = require("node:path");

const marker = process.env.FEATURE_SPRINT_TREE_MARKER;
const label = process.env.FEATURE_SPRINT_TREE_LABEL || "child";

if (marker) {
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, `${label}:${process.pid}\n`, "utf8");
}

process.stdout.write(`TREE_CHILD_READY pid=${process.pid} label=${label}\n`);
setInterval(() => {}, 60_000);
