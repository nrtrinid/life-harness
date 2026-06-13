import { packageScripts } from "./agent-utils";
import { printSummary, runAgentCommand } from "./agent-run-command";

const scripts = packageScripts();
let command = "";
let note = "";

if (scripts.verify) {
  command = "npm run verify";
} else {
  const fallback = ["typecheck", "test"].filter((script) => scripts[script]).map((script) => `npm run ${script}`);
  if (fallback.length === 0) {
    console.error("No verify, typecheck, or test package scripts exist.");
    process.exit(1);
  }
  command = fallback.join(" && ");
  note = "No verify script exists; ran existing narrower package scripts only.";
}

const summary = runAgentCommand("verify", command, note);
printSummary(summary);
process.exit(summary.exitCode ?? 1);
