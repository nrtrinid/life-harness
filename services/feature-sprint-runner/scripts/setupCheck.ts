import { ensureCursorAgentOnPath, loadRunnerEnvLocal } from "./runnerEnv";
import { checkFeatureSprintRunnerHealth } from "../../../src/core/featureSprintRunnerClient";

loadRunnerEnvLocal();
ensureCursorAgentOnPath();

if (!process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim()) {
  process.env.FEATURE_SPRINT_RUNNER_TOKEN = "life-harness-dev";
}

process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN =
  process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN ?? process.env.FEATURE_SPRINT_RUNNER_TOKEN;

const health = await checkFeatureSprintRunnerHealth();
console.log(JSON.stringify(health, null, 2));
process.exit(health.ok ? 0 : 1);
