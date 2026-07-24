import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number.parseInt(process.env.DOGFOOD_WEB_PORT ?? "19007", 10);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.dogfood.spec.ts",
  timeout: 180_000,
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    navigationTimeout: 180_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npx expo start --web --port ${WEB_PORT}`,
    cwd: "..",
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      CI: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN:
        process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN?.trim() || "life-harness-dev",
      EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_BASE_URL:
        process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_BASE_URL?.trim() || "http://127.0.0.1:8127"
    }
  }
});
