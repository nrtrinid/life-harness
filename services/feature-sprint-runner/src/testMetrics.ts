/**
 * Mock-mode test instrumentation for Playwright dogfood.
 * Counts POST /feature-sprint/run acceptances and provider spawn attempts.
 * Never enabled outside FEATURE_SPRINT_RUNNER_MODE=mock.
 */

export type FeatureSprintRunnerTestMetrics = {
  postCount: number;
  spawnCount: number;
  lastAttemptId: string | null;
};

const metrics: FeatureSprintRunnerTestMetrics = {
  postCount: 0,
  spawnCount: 0,
  lastAttemptId: null
};

export function isMockRunnerTestInstrumentationEnabled(): boolean {
  return (process.env.FEATURE_SPRINT_RUNNER_MODE ?? "mock").trim().toLowerCase() === "mock";
}

export function resetFeatureSprintRunnerTestMetrics(): void {
  metrics.postCount = 0;
  metrics.spawnCount = 0;
  metrics.lastAttemptId = null;
}

export function getFeatureSprintRunnerTestMetrics(): FeatureSprintRunnerTestMetrics {
  return { ...metrics };
}

export function recordFeatureSprintRunnerTestPost(attemptId?: string): void {
  if (!isMockRunnerTestInstrumentationEnabled()) {
    return;
  }
  metrics.postCount += 1;
  if (attemptId) {
    metrics.lastAttemptId = attemptId;
  }
}

export function recordFeatureSprintRunnerTestSpawn(): void {
  if (!isMockRunnerTestInstrumentationEnabled()) {
    return;
  }
  metrics.spawnCount += 1;
}
