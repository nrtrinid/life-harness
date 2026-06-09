import { createCareerApplicationCard } from "../core/career";
import type { DailyState, LifeCard, LifeLogEntry, ProofItem } from "../core/types";

export function daysAgo(n: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() - n);
  return date.toISOString();
}

export const seedCards: LifeCard[] = [
  {
    id: "career-networking",
    title: "Career / Networking",
    area: "social_career",
    state: "active",
    progress: 15,
    warmth: "cold",
    whyItMatters: "External-world job actions create useful pressure and optionality.",
    nextTinyAction: "Paste one job description or send one follow-up.",
    doneForNow: "One job description pasted or one follow-up sent.",
    doLane: "Paste one job description or send one follow-up.",
    improveLane: "Park resume automation until manual applications exist.",
    triggerPlan: {
      cue: "I open email or a job board",
      action: "paste one job description or send one follow-up before browsing"
    },
    obstaclePlan: {
      obstacle: "Job search expands into research instead of applying.",
      plan: "Use Career Intake or send one follow-up, then stop."
    },
    lastTouched: daysAgo(6),
    recentWins: [],
    openLoops: ["Paste one job description", "Send one follow-up"],
    optimizationIdeas: ["Resume automation", "Job-board scraping"],
    resumePacket: {
      whyItMatters: "Outside applications create the pressure the board cannot fake.",
      lastState: "Cold but active — needs one outside-world action.",
      nextTinyAction: "Paste one job description or send one follow-up.",
      openLoops: ["Paste one job description"],
      reentryAction: "Open Career Intake or draft one follow-up."
    },
    proofItemIds: [],
    sensitivity: "S2"
  },
  {
    id: "ev-tracker-kalshi",
    title: "EV Tracker / Kalshi",
    area: "build",
    state: "active",
    progress: 72,
    warmth: "hot",
    whyItMatters: "It is a practical build with market feedback and real decision pressure.",
    nextTinyAction: "Hold unless Career Pounce is complete today.",
    doneForNow: "Career pounce done or EV work explicitly chosen after.",
    doLane: "Hold unless Career Pounce is complete today.",
    improveLane: "Do not expand tooling until career pounce is done.",
    triggerPlan: {
      cue: "I want to open EV Tracker",
      action: "confirm career pounce is done first"
    },
    obstaclePlan: {
      obstacle: "Build energy hijacks career momentum.",
      plan: "Hold until career pounce is complete today."
    },
    lastTouched: daysAgo(0),
    recentWins: ["Wrote a sharper market note"],
    openLoops: ["Career pounce gate"],
    optimizationIdeas: ["Automated market scan"],
    resumePacket: {
      whyItMatters: "Keeps build energy attached to real-world judgment.",
      lastState: "Hot but gated behind career pounce.",
      nextTinyAction: "Hold unless Career Pounce is complete today.",
      openLoops: ["Career pounce gate"],
      reentryAction: "Check Today for career pounce status."
    },
    proofItemIds: [],
    sensitivity: "S1"
  },
  {
    id: "text-rpg",
    title: "Text RPG",
    area: "build",
    state: "parked",
    progress: 62,
    warmth: "cooling",
    whyItMatters: "It is a durable creative project that rewards returning after gaps.",
    nextTinyAction: "Write one enemy behavior test.",
    doneForNow: "One enemy behavior test exists.",
    doLane: "Write one test around enemy behavior.",
    improveLane: "Park larger combat-system redesign notes.",
    triggerPlan: {
      cue: "I have 20 minutes before switching tasks",
      action: "open the test file and add one case"
    },
    obstaclePlan: {
      obstacle: "Re-entry friction makes the project feel bigger than it is.",
      plan: "Use the resume packet before reading old design notes."
    },
    lastTouched: daysAgo(2),
    recentWins: ["Named the next test"],
    openLoops: ["Enemy behavior test"],
    optimizationIdeas: ["Scenario editor"],
    resumePacket: {
      whyItMatters: "Creative code stays alive when re-entry is easy.",
      lastState: "Parked with a clear next test.",
      nextTinyAction: "Write one enemy behavior test.",
      openLoops: ["Enemy behavior test"],
      reentryAction: "Open the enemy behavior file."
    },
    proofItemIds: [],
    sensitivity: "S1"
  },
  {
    id: "fitness-return",
    title: "Fitness Return",
    area: "body",
    state: "active",
    progress: 20,
    warmth: "cooling",
    whyItMatters: "Body floor makes the rest of the day easier to salvage.",
    nextTinyAction: "Walk 10 minutes or eat something real.",
    doneForNow: "Ten minutes of movement or one real meal counts.",
    doLane: "Walk 10 minutes or eat something real.",
    improveLane: "Do not optimize the routine until the floor is used.",
    triggerPlan: {
      cue: "I notice I am waiting for a perfect workout window",
      action: "take the 10-minute version"
    },
    obstaclePlan: {
      obstacle: "The full workout feels too big.",
      plan: "Use the floor action and call it preserved."
    },
    lastTouched: daysAgo(5),
    recentWins: ["Walked once this week"],
    openLoops: ["Pick simple lift floor"],
    optimizationIdeas: ["Detailed split"],
    resumePacket: {
      whyItMatters: "Small movement keeps the day from getting brittle.",
      lastState: "Walking is the easiest re-entry.",
      nextTinyAction: "Walk 10 minutes or eat something real.",
      openLoops: ["Pick simple lift floor"],
      reentryAction: "Put on shoes and walk around the block."
    },
    proofItemIds: [],
    sensitivity: "S2"
  },
  {
    id: "local-llm-setup",
    title: "Local LLM Setup",
    area: "money_independence",
    state: "parked",
    progress: 20,
    warmth: "warm",
    whyItMatters: "Private AI may be useful later, but it is not a v0.1 dependency.",
    nextTinyAction: "Keep parked until career actions are done.",
    doneForNow: "Still parked. No runtime setup.",
    doLane: "Keep parked until career actions are done.",
    improveLane: "Do not install model tooling in v0.1.",
    triggerPlan: {
      cue: "I want to research local models",
      action: "do one career action instead"
    },
    obstaclePlan: {
      obstacle: "Research can replace applying to jobs.",
      plan: "Keep parked until career actions are done."
    },
    lastTouched: daysAgo(15),
    recentWins: ["Parked local AI until it is earned"],
    openLoops: ["Career actions first"],
    optimizationIdeas: ["Provider gateway"],
    resumePacket: {
      whyItMatters: "Privacy matters later, but career execution comes first.",
      lastState: "Parked until career actions are done.",
      nextTinyAction: "Keep parked until career actions are done.",
      openLoops: ["Career actions first"],
      reentryAction: "Check Today for career pounce."
    },
    proofItemIds: [],
    sensitivity: "S2"
  },
  {
    id: "life-harness",
    title: "Life Harness",
    area: "build",
    state: "active",
    progress: 20,
    warmth: "hot",
    whyItMatters: "It lowers the cost of starting, recovering, and seeing progress.",
    nextTinyAction: "Scaffold Career Command Board v0.1.",
    doneForNow: "Career Command Board runs locally with seed data.",
    doLane: "Ship the career-first v0.1 loop.",
    improveLane: "Park advanced interactions until the loop is visible.",
    triggerPlan: {
      cue: "I open the repo",
      action: "make the smallest career-first change"
    },
    obstaclePlan: {
      obstacle: "The product concept tempts a beautiful UI rabbit hole.",
      plan: "Keep it ugly and usable until the loop is visible."
    },
    lastTouched: daysAgo(0),
    recentWins: ["Locked career-first v0.1 scope"],
    openLoops: ["Career Intake", "Career stats on Progress"],
    optimizationIdeas: ["Persistent local storage"],
    resumePacket: {
      whyItMatters: "This is the harness for every other card.",
      lastState: "Career Command Board scaffold in progress.",
      nextTinyAction: "Scaffold Career Command Board v0.1.",
      openLoops: ["Career Intake screen"],
      reentryAction: "Open Today and run the app."
    },
    proofItemIds: ["proof-life-harness-scope"],
    sensitivity: "S1"
  },
  {
    ...createCareerApplicationCard({
      company: "Qualcomm",
      roleTitle: "Security Engineer",
      sourceUrl: "https://example.com/jobs/qualcomm",
      jobDescription: "Security engineering role requiring application security experience.",
      roleType: "cybersecurity",
      applicationStatus: "waiting",
      followUpDate: "2026-06-08"
    }),
    id: "qualcomm-application",
    warmth: "cold",
    whyItMatters: "One follow-up keeps the application alive without becoming a job-search spiral.",
    nextTinyAction: "Send one follow-up on application status."
  }
];

export const seedLogs: LifeLogEntry[] = [
  {
    id: "log-life-harness-scope",
    timestamp: daysAgo(0),
    rawText: "locked career-first v0.1 scope for Life Harness",
    area: "build",
    cardId: "life-harness",
    type: "win",
    xp: 15,
    proofItemId: "proof-life-harness-scope",
    sensitivity: "S1"
  },
  {
    id: "log-salvage-follow-up",
    timestamp: daysAgo(2),
    rawText: "Used salvage mode: send one follow-up",
    area: "social_career",
    type: "salvage",
    xp: 30,
    proofItemId: "proof-salvage-follow-up",
    sensitivity: "S2"
  }
];

export const seedProofItems: ProofItem[] = [
  {
    id: "proof-life-harness-scope",
    timestamp: daysAgo(0),
    title: "Kept Life Harness v0.1 small and local.",
    area: "build",
    cardId: "life-harness",
    sourceLogId: "log-life-harness-scope"
  },
  {
    id: "proof-salvage-follow-up",
    timestamp: daysAgo(2),
    title: "Used Salvage Mode.",
    area: "social_career",
    sourceLogId: "log-salvage-follow-up"
  }
];

export const seedDailyState: DailyState = {
  date: "2026-06-09",
  mode: "normal",
  mainQuestId: "career-networking",
  pounceMission: "Paste one job description and create an application card.",
  smallestStart: "Open a job post and copy the description.",
  pounceWindowStart: "2026-06-09T10:00:00-07:00",
  pounceWindowEnd: "2026-06-09T11:00:00-07:00",
  pounceStarted: false,
  minimumViableDayCompleted: false,
  salvageCompleted: false,
  lastOpenedAt: daysAgo(2)
};
