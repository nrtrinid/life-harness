import { ensureCursorAgentOnPath, loadRunnerEnvLocal } from "./runnerEnv";
import { buildSetupCheckReport } from "../src/setupDiagnostics";
import { checkFeatureSprintRunnerHealth } from "../../../src/core/featureSprintRunnerClient";
import { redactSecrets } from "../src/redact";

loadRunnerEnvLocal();
ensureCursorAgentOnPath();

async function main(): Promise<void> {
  // Report configuration honestly first — never invent a token to look configured.
  const report = await buildSetupCheckReport();

  // Live health probe only: if the server token is present but the Expo public token
  // is not, temporarily pair them for the probe. This must not rewrite report results.
  const previousExpoToken = process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN;
  const serverToken = process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim();
  let pairedExpoForProbe = false;
  if (serverToken && !previousExpoToken?.trim()) {
    process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN = serverToken;
    pairedExpoForProbe = true;
  }

  let liveHealth: unknown = null;
  try {
    liveHealth = await checkFeatureSprintRunnerHealth();
  } catch (error) {
    liveHealth = {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (pairedExpoForProbe) {
      if (previousExpoToken === undefined) {
        delete process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN;
      } else {
        process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN = previousExpoToken;
      }
    }
  }

  const payload = {
    ok: report.ok,
    mode: report.mode,
    canRunMock: report.canRunMock,
    canRunRealCursor: report.canRunRealCursor,
    canRunRealCodex: report.canRunRealCodex,
    node: report.node,
    host: report.host,
    port: report.port,
    portStatus: report.portStatus,
    blockers: report.blockers,
    warnings: report.warnings,
    items: report.items,
    setup: report.setup,
    liveHealth
  };

  console.log(redactSecrets(JSON.stringify(payload, null, 2)));

  if (!report.ok) {
    console.error(
      `\nSetup check failed with ${report.blockers.length} blocker(s). Fix blockers above before real Feature Sprint runs.`
    );
    process.exit(1);
  }

  if (report.portStatus === "free") {
    console.error(
      `\nEnvironment looks usable for mode=${report.mode}, but the runner is not listening on port ${report.port}. Start it, then re-check.`
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
