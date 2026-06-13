import { commandOrExit, printSummary, runAgentCommand } from "./agent-run-command";

const summary = runAgentCommand("typecheck", commandOrExit("typecheck"));
printSummary(summary);
process.exit(summary.exitCode ?? 1);
