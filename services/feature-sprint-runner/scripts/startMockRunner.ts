import { ensureCursorAgentOnPath, loadRunnerEnvLocal } from "./runnerEnv";

process.env.FEATURE_SPRINT_RUNNER_MODE = "mock";
if (!process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim()) {
  process.env.FEATURE_SPRINT_RUNNER_TOKEN = "life-harness-dev";
}

loadRunnerEnvLocal();

const { startServer } = await import("../src/server");
startServer();
