import { existsSync } from "node:fs";
import path from "node:path";

import { ensureCursorAgentOnPath, loadRunnerEnvLocal, repoRootFromScripts } from "./runnerEnv";

const envFile = path.join(repoRootFromScripts(), "services/feature-sprint-runner/.env.local");
if (!existsSync(envFile)) {
  console.error(
    `Missing ${envFile}. Copy services/feature-sprint-runner/.env.local.example and set CURSOR_API_KEY.`
  );
  process.exit(1);
}

loadRunnerEnvLocal();
ensureCursorAgentOnPath();

if (!process.env.CURSOR_API_KEY?.trim()) {
  console.error("CURSOR_API_KEY is empty in .env.local");
  process.exit(1);
}

const { startServer } = await import("../src/server");
startServer();
