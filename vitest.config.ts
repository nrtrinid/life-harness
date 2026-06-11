import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "services/job-scout-runner/tests/**/*.test.ts",
      "services/feature-sprint-runner/tests/**/*.test.ts"
    ]
  }
});
