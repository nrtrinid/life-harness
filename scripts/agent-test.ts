import { commandOrExit, printSummary, runAgentCommand } from "./agent-run-command";

const passthrough = process.argv.slice(2).filter((arg) => arg !== "--");
const command = passthrough.length > 0 ? `${commandOrExit("test")} -- ${passthrough.join(" ")}` : commandOrExit("test");
const summary = runAgentCommand("test", command);
printSummary(summary);
process.exit(summary.exitCode ?? 1);
