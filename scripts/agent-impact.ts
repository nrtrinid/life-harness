import {
  changedFilePaths,
  likelyTestsFor,
  parseArgs,
  recommendedChecks,
  taskAreaForPath,
  truncateList
} from "./agent-utils";

function boundaryRisks(files: string[]): string[] {
  const risks: string[] = [];
  if (files.some((file) => file === "package.json" || file.endsWith("package-lock.json"))) {
    risks.push("package/dependency changes");
  }
  if (files.some((file) => file.includes("persistence") || file.includes("migrations"))) {
    risks.push("persistence/schema changes");
  }
  if (files.some((file) => file.startsWith("app/") || file.startsWith("src/"))) {
    risks.push("check app/src does not import from services");
  }
  if (files.some((file) => file.startsWith("src/core/"))) {
    risks.push("check src/core stays UI-independent");
  }
  if (files.some((file) => file.includes("rawLab") || file.includes("raw-lab"))) {
    risks.push("Raw Lab must not import board state/actions");
  }
  if (files.some((file) => file.includes("askHarness") || file.includes("ask-harness") || file.includes("chatHarness"))) {
    risks.push("Ask Harness must not import Raw Lab personality/thread internals");
  }
  return Array.from(new Set(risks));
}

function docsForArea(area: string): string[] {
  switch (area) {
    case "core-board-product-logic":
      return ["docs/01_final_design_doc.md", "docs/02_v0_1_scope.md", "docs/05_product_rules.md"];
    case "career-job-scout":
      return ["docs/career-hub-v0.1.md", "docs/job-scout-*.md"];
    case "ask-harness":
      return ["docs/ai-workflows-current.md", "docs/ask-harness-v0.1.md", "docs/conversation-thread-intelligence.md"];
    case "raw-lab-containment":
      return ["docs/raw-lab-architecture.md", "docs/raw-lab-thread-state.md", "docs/ai-workflows-current.md"];
    case "ai-gateway":
      return ["services/ai-gateway/AGENTS.md", "services/ai-gateway/README.md", "docs/local-ai-agent-guide.md"];
    case "docs-planning":
      return ["docs/AGENT_BUDGETS.md", "docs/AGENT_CONTEXT_MAP.md"];
    case "rtk-query-network-layer":
      return ["docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md", "docs/AGENT_CONTEXT_MAP.md"];
    default:
      return ["docs/AGENT_CONTEXT_MAP.md"];
  }
}

function main(): void {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const files = positionals.length > 0 && !flags.has("changed") ? positionals : changedFilePaths();
  const bounded = truncateList(files, 60);
  const areas = Array.from(new Set(files.map(taskAreaForPath))).sort();

  console.log("# Agent Impact");
  console.log(`Files considered: ${files.length}`);
  for (const file of bounded.shown) console.log(`- ${file}`);
  if (bounded.omitted) console.log(`- ... truncated ${bounded.omitted} more`);

  console.log("");
  console.log("## Likely Task Areas");
  for (const area of areas) console.log(`- ${area}`);

  console.log("");
  console.log("## Likely Tests");
  let printedTests = 0;
  for (const file of files.slice(0, 25)) {
    const tests = likelyTestsFor(file);
    if (tests.existing.length > 0) {
      console.log(`- ${file}: ${tests.existing.slice(0, 5).join(", ")}`);
      printedTests += 1;
    }
  }
  if (printedTests === 0) {
    console.log("- no obvious tests found for bounded file set");
  }

  console.log("");
  console.log("## Docs To Check");
  for (const doc of Array.from(new Set(areas.flatMap(docsForArea)))) console.log(`- ${doc}`);

  const risks = boundaryRisks(files);
  console.log("");
  console.log("## Boundary Risks");
  for (const risk of risks.length ? risks : ["none obvious"]) console.log(`- ${risk}`);

  console.log("");
  console.log("## Recommended Narrow Checks");
  for (const check of recommendedChecks(files)) console.log(`- ${check}`);
}

main();
