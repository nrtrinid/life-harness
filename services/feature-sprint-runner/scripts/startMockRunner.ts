import { ensureCursorAgentOnPath, loadRunnerEnvLocal } from "./runnerEnv";

loadRunnerEnvLocal();
ensureCursorAgentOnPath();

// Force mock after .env.local so real-mode env files cannot silently override this script.
process.env.FEATURE_SPRINT_RUNNER_MODE = "mock";
if (!process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim()) {
  // Dev convenience for local mock only — setup-check does not invent tokens.
  process.env.FEATURE_SPRINT_RUNNER_TOKEN = "life-harness-dev";
}

async function main(): Promise<void> {
  const { startServer } = await import("../src/server");
  startServer();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
