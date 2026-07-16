import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  assessFeatureSprintMapReadiness,
  assessFeatureSprintPhaseLaunch,
  buildSiblingExclusions,
  canLaunchFeatureSprintMapTarget,
  canLaunchFeatureSprintPhase,
  canSeedFeatureSprintMapFromSteps,
  formatFeatureSprintMapPacketSections,
  isSprintMapAuthoritative,
  normalizeExecutionTarget,
  normalizeFeatureSprintMap,
  normalizePlanSprintMapFields,
  resolveFeatureSprintExecutionModel,
  resolveFeatureSprintExecutionTarget,
  resolveSprintMapLifecycle,
  seedSprintMapFromLegacySteps,
  STALE_EXECUTION_TARGET_MESSAGE
} from "./featureSprintMap";
import {
  adoptSprintMapExecutionForPlan,
  buildFeatureStepImplementationPacket,
  canRunFeatureSprintImplementation,
  canRunFeatureSprintPhaseAction,
  createFeatureSprintPlanForCard,
  describeFeatureSprintPhaseLaunchBlock,
  importFeatureSprintPlanFromText,
  updateFeatureSprintPlan
} from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import { normalizeFeatureSprintPlan } from "./stateHydration";
import type {
  HarnessFeatureSprintExecutionTarget,
  HarnessFeatureSprintMap,
  HarnessFeatureSprintPlan,
  LifeCard
} from "./types";

const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");
const FIXED_NOW_ISO = FIXED_NOW.toISOString();

function card(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-map-1",
    title: "Sprint Map feature",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    nextTinyAction: "Wire sprint map",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW.toISOString()),
    cards: [card()],
    ...overrides
  };
}

function sampleMap(overrides?: {
  taskAStatus?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][0]["status"];
  taskBStatus?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][1]["status"];
  taskBDeps?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][1]["dependencies"];
}): HarnessFeatureSprintMap {
  return {
    sprints: [
      {
        id: "sprint-1",
        title: "Sprint 1",
        objective: "Land map foundations",
        stories: [
          {
            id: "story-1",
            title: "Schema story",
            outcome: "Typed hierarchy exists",
            tasks: [
              {
                id: "task-a",
                title: "Add types",
                objective: "Add sprint map contracts",
                status: overrides?.taskAStatus ?? "done",
                acceptanceCriteria: [{ id: "ac-a1", text: "Types compile" }],
                dependencies: [],
                scope: {
                  allowedPaths: ["src/core/types.ts"],
                  forbiddenPaths: ["services/"]
                },
                verificationRequirements: [
                  { id: "v-a1", description: "Typecheck", command: "npm run typecheck" }
                ],
                completionEvidence: ["Diff shows new types"],
                architectureDecisions: ["Keep steps as legacy lens"],
                gateState: "passed"
              },
              {
                id: "task-b",
                title: "Wire packets",
                objective: "Inherit map context into packets",
                status: overrides?.taskBStatus ?? "ready",
                acceptanceCriteria: [{ id: "ac-b1", text: "Packet includes exclusions" }],
                dependencies: overrides?.taskBDeps ?? [
                  { id: "dep-1", taskId: "task-a", required: true }
                ],
                scope: {
                  allowedPaths: ["src/core/featureSprintOrchestrator.ts"],
                  architecturalAreas: ["feature-sprint-packets"]
                },
                verificationRequirements: [
                  { id: "v-b1", description: "Orchestrator tests", command: "npm test" }
                ],
                completionEvidence: ["Packet snapshot includes Sprint Map section"],
                architectureDecisions: ["Extend packets; do not replace fences"]
              },
              {
                id: "task-c",
                title: "Sibling UI polish",
                objective: "Out of scope sibling",
                status: "planned",
                acceptanceCriteria: [],
                dependencies: [],
                scope: {},
                verificationRequirements: []
              }
            ]
          },
          {
            id: "story-2",
            title: "Other story",
            outcome: "Not this slice",
            tasks: [
              {
                id: "task-d",
                title: "Other work",
                objective: "Sibling story task",
                status: "planned",
                acceptanceCriteria: [],
                dependencies: [],
                scope: {},
                verificationRequirements: []
              }
            ]
          }
        ]
      }
    ]
  };
}

function target(
  overrides: Partial<HarnessFeatureSprintExecutionTarget> = {}
): HarnessFeatureSprintExecutionTarget {
  return {
    sprintId: "sprint-1",
    storyId: "story-1",
    taskId: "task-b",
    phase: "implement",
    ...overrides
  };
}

function planWithMap(
  options: {
    map?: HarnessFeatureSprintMap;
    executionTarget?: HarnessFeatureSprintExecutionTarget | null;
    executionModel?: HarnessFeatureSprintPlan["executionModel"] | null;
  } = {}
): HarnessFeatureSprintPlan {
  const map = options.map ?? sampleMap();
  const executionModel =
    options.executionModel === null
      ? undefined
      : options.executionModel === undefined
        ? "sprint_map"
        : options.executionModel;
  const executionTarget =
    options.executionTarget === null
      ? undefined
      : options.executionTarget === undefined
        ? target()
        : options.executionTarget;
  return {
    id: "plan-1",
    cardId: "card-map-1",
    title: "Map foundations",
    goal: "Anchor agent runs to tasks",
    status: "in_progress",
    acceptanceCriteria: ["Map launches are attributable"],
    nonGoals: ["Jira clone"],
    constraints: ["Additive only"],
    steps: [
      {
        id: "step-1",
        title: "Legacy step",
        goal: "Keep steps working",
        status: "ready",
        acceptanceCriteria: ["Legacy path works"],
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    ],
    currentStepId: "step-1",
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
    executionModel,
    sprintMap: map,
    executionTarget
  };
}

describe("featureSprintMap authority and hardening", () => {
  it("keeps plans without a map on legacy_steps", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-map-1",
        title: "Legacy plan",
        goal: "No map yet",
        acceptanceCriteria: ["Still works"],
        steps: [{ title: "Step one", goal: "Do the thing", acceptanceCriteria: ["Done"] }]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const plan = created.state.featureSprintPlans[0];
    expect(resolveFeatureSprintExecutionModel(plan)).toBe("legacy_steps");
    expect(isSprintMapAuthoritative(plan)).toBe(false);
    expect(canRunFeatureSprintImplementation(plan)).toBe(true);
  });

  it("does not make a seeded map authoritative until adopt", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-map-1",
        title: "Seed preview",
        goal: "Preview only",
        acceptanceCriteria: ["Seed stays legacy"],
        steps: [
          { title: "One", goal: "First", acceptanceCriteria: ["A"] },
          { title: "Two", goal: "Second", acceptanceCriteria: ["B"] }
        ]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const plan = created.state.featureSprintPlans[0];
    const seeded = seedSprintMapFromLegacySteps(plan, { nowIso: FIXED_NOW_ISO });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) {
      return;
    }
    const attached = updateFeatureSprintPlan(
      created.state,
      plan.id,
      {
        sprintMap: seeded.sprintMap,
        executionTarget: seeded.executionTarget ?? null,
        executionModel: null,
        sprintMapNotices: [seeded.notice]
      },
      FIXED_NOW
    );
    expect(attached.ok).toBe(true);
    if (!attached.ok) {
      return;
    }
    const preview = attached.state.featureSprintPlans[0];
    expect(resolveFeatureSprintExecutionModel(preview)).toBe("legacy_steps");
    expect(resolveSprintMapLifecycle(preview)).toBe("seeded_preview");
    expect(canRunFeatureSprintImplementation(preview)).toBe(true);
    expect(canLaunchFeatureSprintMapTarget(preview)).toBe(true);
  });

  it("makes adopted Sprint Map authoritative and blocks legacy bypass", () => {
    const previewPlan = planWithMap({
      map: sampleMap({ taskAStatus: "ready", taskBStatus: "ready" }),
      executionModel: null
    });
    expect(isSprintMapAuthoritative(previewPlan)).toBe(false);
    expect(canRunFeatureSprintImplementation(previewPlan)).toBe(true);

    const adopted = planWithMap({
      map: sampleMap({ taskAStatus: "ready", taskBStatus: "ready" }),
      executionModel: "sprint_map"
    });
    expect(isSprintMapAuthoritative(adopted)).toBe(true);
    expect(canLaunchFeatureSprintPhase(adopted, "implement")).toBe(false);
    expect(canRunFeatureSprintImplementation(adopted)).toBe(false);
    expect(adopted.currentStepId).toBe("step-1");
    expect(adopted.steps[0].status).toBe("ready");
  });

  it("blocks map-authoritative launch when target is missing", () => {
    const plan = planWithMap({
      map: sampleMap(),
      executionTarget: null,
      executionModel: "sprint_map"
    });
    const readiness = assessFeatureSprintMapReadiness(plan);
    expect(readiness.canLaunch).toBe(false);
    expect(readiness.issues.some((issue) => issue.id === "target_unresolved")).toBe(true);
    expect(canRunFeatureSprintImplementation(plan)).toBe(false);
  });

  it("blocks launch when required dependencies are unmet", () => {
    const plan = planWithMap({
      map: sampleMap({ taskAStatus: "ready", taskBStatus: "ready" }),
      executionModel: "sprint_map"
    });
    const readiness = assessFeatureSprintMapReadiness(plan);
    expect(readiness.canLaunch).toBe(false);
    expect(readiness.issues.some((issue) => issue.id.startsWith("dep_"))).toBe(true);
  });

  it("blocks phase mismatch for map-authoritative launches", () => {
    const plan = planWithMap({
      map: sampleMap(),
      executionTarget: target({ phase: "localize" }),
      executionModel: "sprint_map"
    });
    const readiness = assessFeatureSprintPhaseLaunch(plan, "implement");
    expect(readiness.canLaunch).toBe(false);
    expect(readiness.issues.some((issue) => issue.id === "phase_mismatch")).toBe(true);
  });

  it("removes stale targets and surfaces a durable notice without duplicates", () => {
    const stale = planWithMap({
      map: sampleMap(),
      executionTarget: target({ taskId: "gone" }),
      executionModel: "sprint_map"
    });
    const first = normalizePlanSprintMapFields(stale, FIXED_NOW_ISO);
    expect(first.executionTarget).toBeUndefined();
    expect(first.sprintMapNotices.some((notice) => notice.code === "stale_execution_target")).toBe(
      true
    );
    expect(first.sprintMapNotices[0]?.message).toBe(STALE_EXECUTION_TARGET_MESSAGE);

    const second = normalizePlanSprintMapFields(
      {
        ...stale,
        executionTarget: undefined,
        sprintMapNotices: first.sprintMapNotices
      },
      FIXED_NOW_ISO
    );
    expect(
      second.sprintMapNotices.filter((notice) => notice.code === "stale_execution_target")
    ).toHaveLength(1);

    const hydrated = normalizeFeatureSprintPlan(stale);
    expect(hydrated.executionTarget).toBeUndefined();
    expect(hydrated.sprintMapNotices?.[0]?.message).toBe(STALE_EXECUTION_TARGET_MESSAGE);
  });

  it("refuses to overwrite an existing map when seeding", () => {
    const plan = planWithMap({ map: sampleMap(), executionModel: null });
    const seeded = seedSprintMapFromLegacySteps(plan);
    expect(seeded.ok).toBe(false);
    if (seeded.ok) {
      return;
    }
    expect(seeded.error).toMatch(/already exists/i);
  });

  it("seeds deterministically and keeps stable ids on forced reseed", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-map-1",
        title: "Deterministic seed",
        goal: "Stable ids",
        acceptanceCriteria: ["Ids stable"],
        steps: [
          { title: "One", goal: "First", acceptanceCriteria: ["A"] },
          { title: "Two", goal: "Second", acceptanceCriteria: ["B"] }
        ]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const plan = created.state.featureSprintPlans[0];
    const first = seedSprintMapFromLegacySteps(plan, { nowIso: FIXED_NOW_ISO });
    const second = seedSprintMapFromLegacySteps(
      { ...plan, sprintMap: first.ok ? first.sprintMap : undefined },
      { force: true, nowIso: FIXED_NOW_ISO }
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.sprintMap.sprints[0].id).toBe(`fs_sprint_seed_${plan.id}`);
    expect(first.sprintMap.sprints[0].stories[0].tasks[0].id).toBe(
      `fs_task_seed_${plan.steps[0].id}`
    );
    expect(second.sprintMap.sprints[0].id).toBe(first.sprintMap.sprints[0].id);
    expect(second.sprintMap.sprints[0].stories[0].tasks[1].id).toBe(
      first.sprintMap.sprints[0].stories[0].tasks[1].id
    );
    expect(first.notice.code).toBe("seed_preview");
  });

  it("warns when linkedStepId mappings are stale", () => {
    const map = sampleMap();
    map.sprints[0].stories[0].tasks[1].linkedStepId = "missing-step";
    const plan = planWithMap({ map, executionModel: "sprint_map" });
    const normalized = normalizePlanSprintMapFields(plan, FIXED_NOW_ISO);
    expect(normalized.sprintMapNotices.some((notice) => notice.code === "stale_linked_step")).toBe(
      true
    );
    expect(resolveSprintMapLifecycle({ ...plan, sprintMapNotices: normalized.sprintMapNotices })).toBe(
      "out_of_sync"
    );
  });

  it("normalizes nested map hierarchy and rejects invalid targets", () => {
    const normalized = normalizeFeatureSprintMap({
      sprints: [
        {
          id: "sprint-1",
          title: " S1 ",
          goal: " objective as goal alias ",
          stories: [
            {
              id: "story-1",
              title: "Story",
              outcome: "Done outcome",
              tasks: [
                {
                  id: "task-1",
                  title: "Task",
                  goal: "objective alias",
                  status: "ready",
                  acceptanceCriteria: ["Plain string AC"],
                  dependencies: [{ taskId: "task-0", required: true }],
                  scope: { allowedPaths: [" src/a.ts "], expectedFileCountBudget: 3.9 },
                  verificationRequirements: ["Run tests"]
                }
              ]
            }
          ]
        }
      ]
    });
    expect(normalized?.sprints[0].objective).toBe("objective as goal alias");
    expect(normalized?.sprints[0].stories[0].tasks[0].objective).toBe("objective alias");

    const ok = resolveFeatureSprintExecutionTarget(planWithMap());
    expect(ok.ok).toBe(true);
    const stale = resolveFeatureSprintExecutionTarget(planWithMap(), target({ taskId: "missing" }));
    expect(stale.ok).toBe(false);
  });

  it("builds sibling exclusions and packet inheritance for adopted maps", () => {
    const plan = planWithMap();
    const exclusions = buildSiblingExclusions(sampleMap(), target(), new Set(["task-a"]));
    expect(exclusions.some((item) => item.id === "task-c")).toBe(true);
    expect(exclusions.some((item) => item.id === "task-a")).toBe(false);
    expect(exclusions.some((item) => item.reason.includes("story / slice"))).toBe(true);

    const sections = formatFeatureSprintMapPacketSections(plan).join("\n");
    expect(sections).toContain("## Story / Slice outcome");
    expect(sections).toContain("Execution model: sprint_map");
    expect(sections).toContain("## Explicitly excluded sibling work");
    expect(sections).toContain("## Stop condition");
  });

  it("imports classic plans without adopting map authority", () => {
    const classic = importFeatureSprintPlanFromText(
      baseData(),
      "card-map-1",
      [
        "```feature-sprint-plan",
        JSON.stringify(
          {
            title: "Classic",
            goal: "No map",
            acceptanceCriteria: ["Works"],
            nonGoals: [],
            constraints: [],
            steps: [{ title: "Step", goal: "Goal", acceptanceCriteria: ["AC"] }]
          },
          null,
          2
        ),
        "```"
      ].join("\n"),
      FIXED_NOW
    );
    expect(classic.ok).toBe(true);
    if (!classic.ok) {
      return;
    }
    expect(classic.state.featureSprintPlans[0].sprintMap).toBeUndefined();
    expect(resolveFeatureSprintExecutionModel(classic.state.featureSprintPlans[0])).toBe(
      "legacy_steps"
    );
  });

  it("includes map inheritance in implementation packets only when authoritative", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-map-1",
        title: "Map packet",
        goal: "Inherit context",
        acceptanceCriteria: ["Packet has map"],
        steps: [{ title: "Implement", goal: "Build", acceptanceCriteria: ["Tests"] }]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const preview = updateFeatureSprintPlan(
      created.state,
      created.planId,
      { sprintMap: sampleMap(), executionTarget: target(), executionModel: null },
      FIXED_NOW
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    const previewPacket = buildFeatureStepImplementationPacket(preview.state, preview.planId);
    expect(previewPacket.ok).toBe(true);
    if (!previewPacket.ok) {
      return;
    }
    expect(previewPacket.markdown).toContain("## Sprint Map (preview)");
    expect(previewPacket.markdown).not.toContain("Task ID: task-b");

    const adopted = adoptSprintMapExecutionForPlan(preview.state, preview.planId, FIXED_NOW);
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) {
      return;
    }
    expect(isSprintMapAuthoritative(adopted.state.featureSprintPlans[0])).toBe(true);
    const packet = buildFeatureStepImplementationPacket(adopted.state, adopted.planId);
    expect(packet.ok).toBe(true);
    if (!packet.ok) {
      return;
    }
    expect(packet.markdown).toContain("Task ID: task-b");
    expect(packet.markdown).toContain("## Explicitly excluded sibling work");
  });

  it("exposes current/blocked/done task states for UI readiness", () => {
    const map = sampleMap({
      taskAStatus: "done",
      taskBStatus: "blocked",
      taskBDeps: []
    });
    const plan = planWithMap({ map, executionModel: "sprint_map" });
    const readiness = assessFeatureSprintMapReadiness(plan);
    expect(readiness.canLaunch).toBe(false);
    expect(readiness.issues.some((issue) => issue.id === "task_blocked")).toBe(true);
    expect(normalizeExecutionTarget({ ...target(), phase: "nope" })).toBeUndefined();
  });

  it("allows implementation when adopted map target is ready with deps satisfied", () => {
    const plan = planWithMap({
      map: sampleMap({ taskAStatus: "done", taskBStatus: "ready", taskBDeps: [] }),
      executionTarget: target({ phase: "implement" }),
      executionModel: "sprint_map"
    });
    expect(canLaunchFeatureSprintPhase(plan, "implement")).toBe(true);
    expect(canRunFeatureSprintImplementation(plan)).toBe(true);
    expect(describeFeatureSprintPhaseLaunchBlock(plan, "implement")).toBeUndefined();
  });

  it("allows review when adopted map phase matches review", () => {
    const plan = planWithMap({
      map: sampleMap({ taskAStatus: "done", taskBStatus: "ready", taskBDeps: [] }),
      executionTarget: target({ phase: "review" }),
      executionModel: "sprint_map"
    });
    expect(canRunFeatureSprintPhaseAction(plan, "review")).toBe(true);
    expect(assessFeatureSprintPhaseLaunch(plan, "review").canLaunch).toBe(true);
  });

  it("blocks review when adopted map phase mismatches", () => {
    const plan = planWithMap({
      map: sampleMap({ taskAStatus: "done", taskBStatus: "ready", taskBDeps: [] }),
      executionTarget: target({ phase: "implement" }),
      executionModel: "sprint_map"
    });
    expect(canRunFeatureSprintPhaseAction(plan, "review")).toBe(false);
    expect(assessFeatureSprintPhaseLaunch(plan, "review").issues.some((i) => i.id === "phase_mismatch")).toBe(
      true
    );
  });

  it("surfaces dependency blocker for implementation UI when spec is already approved", () => {
    const plan = planWithMap({
      map: sampleMap({ taskAStatus: "ready", taskBStatus: "ready" }),
      executionTarget: target({ phase: "implement" }),
      executionModel: "sprint_map"
    });
    plan.featureSpec = {
      body: "Approved feature body",
      source: "manual",
      updatedAt: FIXED_NOW_ISO,
      approvedAt: FIXED_NOW_ISO,
      approvedBy: "user"
    };
    expect(canRunFeatureSprintImplementation(plan)).toBe(false);
    const block = describeFeatureSprintPhaseLaunchBlock(plan, "implement");
    expect(block).toBeTruthy();
    expect(block).toMatch(/dependency/i);
    expect(block).not.toMatch(/feature spec/i);
  });

  it("does not offer seed when a map already exists and refuses overwrite", () => {
    const plan = planWithMap({ executionModel: null });
    expect(canSeedFeatureSprintMapFromSteps(plan)).toBe(false);
    const seeded = seedSprintMapFromLegacySteps(plan);
    expect(seeded.ok).toBe(false);
    expect(canSeedFeatureSprintMapFromSteps({ sprintMap: undefined })).toBe(true);
  });

  it("normalizes live removal of the selected task with a stale-target notice", () => {
    const map = sampleMap();
    const plan = planWithMap({ map, executionModel: "sprint_map" });
    const data = baseData({ featureSprintPlans: [plan] });
    const withoutTaskB: typeof map = {
      sprints: map.sprints.map((sprint) => ({
        ...sprint,
        stories: sprint.stories.map((story) => ({
          ...story,
          tasks: story.tasks.filter((task) => task.id !== "task-b")
        }))
      }))
    };
    const updated = updateFeatureSprintPlan(
      data,
      plan.id,
      { sprintMap: withoutTaskB },
      FIXED_NOW
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    const next = updated.state.featureSprintPlans[0];
    expect(next.executionTarget).toBeUndefined();
    expect(next.sprintMapNotices?.some((notice) => notice.code === "stale_execution_target")).toBe(
      true
    );
    expect(next.sprintMapNotices?.[0]?.message).toBe(STALE_EXECUTION_TARGET_MESSAGE);
  });

  it("emits out-of-sync notices when a linked step disappears on live update", () => {
    const map = sampleMap();
    map.sprints[0].stories[0].tasks[1].linkedStepId = "step-1";
    const plan = planWithMap({ map, executionModel: "sprint_map" });
    const data = baseData({ featureSprintPlans: [plan] });
    const updated = updateFeatureSprintPlan(
      data,
      plan.id,
      {
        steps: [
          {
            id: "step-other",
            title: "Other",
            goal: "Replaced",
            status: "ready",
            acceptanceCriteria: ["x"],
            createdAt: FIXED_NOW_ISO,
            updatedAt: FIXED_NOW_ISO
          }
        ],
        currentStepId: "step-other"
      },
      FIXED_NOW
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    const next = updated.state.featureSprintPlans[0];
    expect(next.sprintMapNotices?.some((notice) => notice.code === "stale_linked_step")).toBe(true);
    expect(next.sprintMapNotices?.some((notice) => notice.code === "map_out_of_sync")).toBe(true);
  });

  it("clears sync notices when a stale linked step is repaired", () => {
    const map = sampleMap();
    map.sprints[0].stories[0].tasks[1].linkedStepId = "missing-step";
    const plan = planWithMap({ map, executionModel: "sprint_map" });
    const broken = normalizePlanSprintMapFields(plan, FIXED_NOW_ISO);
    expect(broken.sprintMapNotices.some((notice) => notice.code === "stale_linked_step")).toBe(true);

    map.sprints[0].stories[0].tasks[1].linkedStepId = "step-1";
    const repairedPlan = {
      ...plan,
      sprintMap: map,
      sprintMapNotices: broken.sprintMapNotices
    };
    const data = baseData({ featureSprintPlans: [repairedPlan] });
    const updated = updateFeatureSprintPlan(
      data,
      plan.id,
      { sprintMap: map },
      FIXED_NOW
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    const next = updated.state.featureSprintPlans[0];
    expect(next.sprintMapNotices?.some((notice) => notice.code === "stale_linked_step") ?? false).toBe(
      false
    );
    expect(next.sprintMapNotices?.some((notice) => notice.code === "map_out_of_sync") ?? false).toBe(
      false
    );
  });

  it("does not accumulate duplicate stale notices across repeated live normalization", () => {
    const map = sampleMap();
    const plan = planWithMap({
      map,
      executionTarget: target({ taskId: "gone" }),
      executionModel: "sprint_map"
    });
    const data = baseData({ featureSprintPlans: [plan] });
    const first = updateFeatureSprintPlan(data, plan.id, { title: "Pass 1" }, FIXED_NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = updateFeatureSprintPlan(first.state, plan.id, { title: "Pass 2" }, FIXED_NOW);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    const notices =
      second.state.featureSprintPlans[0].sprintMapNotices?.filter(
        (notice) => notice.code === "stale_execution_target"
      ) ?? [];
    expect(notices).toHaveLength(1);
  });
});
