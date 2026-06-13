import { latestFailureSummary, printSummary } from "./agent-run-command";

const summary = latestFailureSummary();

if (!summary) {
  console.log("# Agent Failure Summary");
  console.log("No agent logs found in tmp/agent-logs/.");
  console.log("Try one of:");
  console.log("- npm run agent:test");
  console.log("- npm run agent:typecheck");
  console.log("- npm run agent:verify");
  process.exit(0);
}

printSummary(summary);
