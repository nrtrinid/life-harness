import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "scripts/check-agent-script-claims.test.ts",
      "scripts/audit-agent-ergonomics.test.ts",
      "services/job-scout-runner/tests/**/*.test.ts",
      "services/feature-sprint-runner/tests/**/*.test.ts"
    ]
  }
});
