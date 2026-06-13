const fs = require("node:fs");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseJsonInput() {
  const input = readStdin().trim();
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function getCommand(input) {
  return String(input?.tool_input?.command || input?.toolInput?.command || input?.command || "");
}

module.exports = {
  getCommand,
  parseJsonInput,
  writeJson
};
