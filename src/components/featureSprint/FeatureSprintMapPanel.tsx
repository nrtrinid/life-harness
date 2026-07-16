import { Pressable, Text, View } from "react-native";

import {
  assessFeatureSprintMapReadiness,
  FEATURE_SPRINT_MAP_PHASES,
  canSeedFeatureSprintMapFromSteps,
  isSprintMapAuthoritative,
  resolveFeatureSprintExecutionModel,
  resolveSprintMapLifecycle
} from "../../core/featureSprintMap";
import type {
  HarnessFeatureSprintExecutionTarget,
  HarnessFeatureSprintMap,
  HarnessFeatureSprintMapPhase,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintTask
} from "../../core/types";
import { colors, styles } from "../styles";

export type FeatureSprintMapPanelProps = {
  plan: HarnessFeatureSprintPlan;
  onSelectExecutionTarget: (target: HarnessFeatureSprintExecutionTarget) => void;
  onSeedFromSteps?: () => void;
  onAdoptSprintMap?: () => void;
  onRevertToLegacy?: () => void;
};

function taskStatusLabel(task: HarnessFeatureSprintTask): string {
  if (task.gateState === "blocked" || task.status === "blocked") {
    return "blocked";
  }
  return task.status;
}

function taskStatusColor(status: string): string {
  if (status === "done" || status === "passed") {
    return colors.accentSuccess;
  }
  if (status === "blocked") {
    return colors.accentDanger;
  }
  if (status === "ready" || status === "in_progress") {
    return colors.accentPrimary;
  }
  return colors.textMuted;
}

function lifecycleLabel(lifecycle: ReturnType<typeof resolveSprintMapLifecycle>): string {
  if (lifecycle === "adopted") {
    return "Adopted — Sprint Map authoritative";
  }
  if (lifecycle === "seeded_preview") {
    return "Seeded preview — legacy steps still authoritative";
  }
  if (lifecycle === "out_of_sync") {
    return "Out of sync — linked steps do not all resolve";
  }
  return "No Sprint Map";
}

function selectedTask(
  map: HarnessFeatureSprintMap,
  target: HarnessFeatureSprintExecutionTarget | undefined
): HarnessFeatureSprintTask | undefined {
  if (!target) {
    return undefined;
  }
  for (const sprint of map.sprints) {
    if (sprint.id !== target.sprintId) {
      continue;
    }
    for (const story of sprint.stories) {
      if (story.id !== target.storyId) {
        continue;
      }
      return story.tasks.find((task) => task.id === target.taskId);
    }
  }
  return undefined;
}

export function FeatureSprintMapPanel({
  plan,
  onSelectExecutionTarget,
  onSeedFromSteps,
  onAdoptSprintMap,
  onRevertToLegacy
}: FeatureSprintMapPanelProps) {
  const map = plan.sprintMap;
  const lifecycle = resolveSprintMapLifecycle(plan);
  const authoritative = isSprintMapAuthoritative(plan);
  const readiness = assessFeatureSprintMapReadiness(plan, { requireMap: authoritative });
  const currentTask = map ? selectedTask(map, plan.executionTarget) : undefined;
  const notices = plan.sprintMapNotices ?? [];

  if (!map) {
    return (
      <View style={[styles.cardTile, { marginTop: 12 }]} testID="feature-sprint-map-panel-empty">
        <Text style={styles.label}>Sprint Map</Text>
        <Text style={[styles.helpText, { marginTop: 4 }]}>
          No Sprint Map attached. Legacy steps remain authoritative. Seed a deterministic preview map
          from current steps — seeding does not switch authority until you adopt.
        </Text>
        <Text style={[styles.helpText, { marginTop: 4 }]}>
          Terminology: schema uses Story; product label is Story / Slice (approved execution slice).
        </Text>
        {onSeedFromSteps && plan.steps.length > 0 ? (
          <Pressable
            style={[styles.secondaryAction, { marginTop: 12 }]}
            onPress={onSeedFromSteps}
            testID="feature-sprint-map-seed"
          >
            <Text style={styles.secondaryActionText}>Seed map from steps (preview)</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.cardTile, { marginTop: 12 }]} testID="feature-sprint-map-panel">
      <Text style={styles.label}>Sprint Map</Text>
      <Text style={[styles.helpText, { marginTop: 4 }]}>
        Feature → Sprint → Story / Slice → Task → Phase. Execution model:{" "}
        {resolveFeatureSprintExecutionModel(plan)}.
      </Text>
      <Text style={[styles.bodyText, { marginTop: 4 }]} testID="feature-sprint-map-lifecycle">
        {lifecycleLabel(lifecycle)}
      </Text>

      {notices.length > 0 ? (
        <View style={{ marginTop: 8, gap: 4 }} testID="feature-sprint-map-notices">
          {notices.map((notice) => (
            <Text
              key={notice.fingerprint}
              style={[styles.helpText, { color: colors.accentPrimary }]}
            >
              Notice: {notice.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
        {!authoritative && onAdoptSprintMap ? (
          <Pressable
            style={styles.secondaryAction}
            onPress={onAdoptSprintMap}
            testID="feature-sprint-map-adopt"
          >
            <Text style={styles.secondaryActionText}>Adopt Sprint Map execution</Text>
          </Pressable>
        ) : null}
        {authoritative && onRevertToLegacy ? (
          <Pressable
            style={styles.secondaryAction}
            onPress={onRevertToLegacy}
            testID="feature-sprint-map-revert"
          >
            <Text style={styles.secondaryActionText}>Revert to legacy steps</Text>
          </Pressable>
        ) : null}
        {!map && onSeedFromSteps && canSeedFeatureSprintMapFromSteps(plan) ? (
          <Pressable
            style={styles.secondaryAction}
            onPress={onSeedFromSteps}
            testID="feature-sprint-map-seed"
          >
            <Text style={styles.secondaryActionText}>Seed map from steps (preview)</Text>
          </Pressable>
        ) : null}
        {map || !canSeedFeatureSprintMapFromSteps(plan) ? (
          <Text style={[styles.helpText, { marginTop: 4 }]} testID="feature-sprint-map-seed-blocked">
            A Sprint Map already exists. Deliberately reset the map before seeding again — re-seed
            is not offered here to avoid a dead-end overwrite attempt.
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: 8, gap: 10 }}>
        {map.sprints.map((sprint) => {
          const sprintCurrent = plan.executionTarget?.sprintId === sprint.id;
          return (
            <View
              key={sprint.id}
              style={{
                borderColor: sprintCurrent ? colors.accentPrimary : colors.borderStrong,
                borderWidth: 1,
                borderRadius: 10,
                padding: 10,
                gap: 8
              }}
              testID={`feature-sprint-map-sprint-${sprint.id}`}
            >
              <Text style={styles.titleText}>{sprint.title}</Text>
              <Text style={styles.helpText}>{sprint.objective}</Text>
              {sprint.stories.map((story) => {
                const storyCurrent =
                  sprintCurrent && plan.executionTarget?.storyId === story.id;
                return (
                  <View
                    key={story.id}
                    style={{
                      marginTop: 4,
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: storyCurrent ? "rgba(200,168,75,0.08)" : "transparent",
                      gap: 6
                    }}
                    testID={`feature-sprint-map-story-${story.id}`}
                  >
                    <Text style={styles.bodyText}>
                      Story / Slice: {story.title}
                      {storyCurrent ? " · current" : ""}
                    </Text>
                    <Text style={styles.helpText}>{story.outcome}</Text>
                    {story.tasks.map((task) => {
                      const isCurrent = plan.executionTarget?.taskId === task.id;
                      const status = taskStatusLabel(task);
                      const unmetRequired = task.dependencies.some((dependency) => {
                        if (dependency.required === false) {
                          return false;
                        }
                        for (const rowSprint of map.sprints) {
                          for (const rowStory of rowSprint.stories) {
                            const prerequisite = rowStory.tasks.find(
                              (item) => item.id === dependency.taskId
                            );
                            if (prerequisite) {
                              return prerequisite.status !== "done";
                            }
                          }
                        }
                        return true;
                      });
                      return (
                        <Pressable
                          key={task.id}
                          style={[
                            styles.secondaryAction,
                            {
                              marginTop: 2,
                              borderColor: isCurrent ? colors.accentPrimary : colors.borderStrong,
                              opacity: status === "blocked" || status === "done" ? 0.85 : 1
                            }
                          ]}
                          onPress={() =>
                            onSelectExecutionTarget({
                              sprintId: sprint.id,
                              storyId: story.id,
                              taskId: task.id,
                              phase: plan.executionTarget?.phase ?? "implement"
                            })
                          }
                          testID={`feature-sprint-map-task-${task.id}`}
                        >
                          <Text style={styles.secondaryActionText}>
                            {isCurrent ? "● " : "○ "}
                            {task.title}
                          </Text>
                          <Text
                            style={[
                              styles.helpText,
                              { color: taskStatusColor(status), marginTop: 2 }
                            ]}
                          >
                            {status}
                            {unmetRequired ? " · deps unmet" : ""}
                            {task.gateState ? ` · gate ${task.gateState}` : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {currentTask ? (
        <View style={{ marginTop: 12, gap: 6 }} testID="feature-sprint-map-task-detail">
          <Text style={styles.label}>Selected task</Text>
          <Text style={styles.titleText}>{currentTask.title}</Text>
          <Text style={styles.bodyText}>{currentTask.objective}</Text>
          <Text style={styles.helpText}>
            Status: {taskStatusLabel(currentTask)}
            {plan.executionTarget ? ` · phase ${plan.executionTarget.phase}` : ""}
          </Text>
          {currentTask.acceptanceCriteria.length > 0 ? (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Acceptance criteria</Text>
              {currentTask.acceptanceCriteria.map((item) => (
                <Text key={item.id} style={styles.listItem}>
                  ▸ {item.text}
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.helpText}>No acceptance criteria declared.</Text>
          )}
          {(currentTask.scope.allowedPaths?.length ||
            currentTask.scope.forbiddenPaths?.length ||
            currentTask.scope.architecturalAreas?.length) && (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Scope</Text>
              {currentTask.scope.allowedPaths?.map((path) => (
                <Text key={`allow-${path}`} style={styles.listItem}>
                  ▸ allow {path}
                </Text>
              ))}
              {currentTask.scope.forbiddenPaths?.map((path) => (
                <Text key={`forbid-${path}`} style={styles.listItem}>
                  ▸ forbid {path}
                </Text>
              ))}
              {currentTask.scope.architecturalAreas?.map((area) => (
                <Text key={`area-${area}`} style={styles.listItem}>
                  ▸ area {area}
                </Text>
              ))}
            </>
          )}
          {currentTask.verificationRequirements.length > 0 ? (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Verification</Text>
              {currentTask.verificationRequirements.map((item) => (
                <Text key={item.id} style={styles.listItem}>
                  ▸ {item.description}
                  {item.command ? ` (${item.command})` : ""}
                </Text>
              ))}
            </>
          ) : null}

          <Text style={[styles.label, { marginTop: 8 }]}>Phase</Text>
          <View style={[styles.cardActionsRow, { flexWrap: "wrap", marginTop: 4 }]}>
            {FEATURE_SPRINT_MAP_PHASES.map((phase: HarnessFeatureSprintMapPhase) => (
              <Pressable
                key={phase}
                style={[
                  styles.secondaryAction,
                  plan.executionTarget?.phase === phase && {
                    borderColor: colors.accentPrimary
                  }
                ]}
                onPress={() =>
                  onSelectExecutionTarget({
                    sprintId: plan.executionTarget!.sprintId,
                    storyId: plan.executionTarget!.storyId,
                    taskId: plan.executionTarget!.taskId,
                    phase
                  })
                }
                testID={`feature-sprint-map-phase-${phase}`}
              >
                <Text style={styles.secondaryActionText}>{phase}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 12, gap: 4 }}>
        <Text style={styles.label}>Map readiness</Text>
        <Text style={styles.bodyText}>{readiness.nextSafeAction}</Text>
        {readiness.issues.map((issue) => (
          <Text
            key={issue.id}
            style={[
              styles.helpText,
              {
                color: issue.severity === "block" ? colors.accentDanger : colors.accentPrimary
              }
            ]}
          >
            {issue.severity === "block" ? "Block" : "Warn"}: {issue.message}
          </Text>
        ))}
      </View>
    </View>
  );
}
