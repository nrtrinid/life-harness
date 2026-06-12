import { spawn } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseFeatureReviewVerdictBlock, parseFeatureSprintPlanBlock } from "../../../src/core/featureSprintOrchestrator";
import type { FeatureSprintRunnerRequest, FeatureSprintRunnerResponse } from "../../../src/core/featureSprintRunner";
import type { FeatureSprintWorktreeCleanupResponse } from "../../../src/core/featureSprintRunner";
import { createServer } from "../src/server";
import { resolveWorktreeRoot } from "../src/worktree";

const baseRequest: FeatureSprintRunnerRequest = {
  profile: "codex_scoping",
  promptMarkdown: "Scope this feature sprint."
};

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { shell: false, cwd, env: process.env });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args.join(" ")} failed with ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function createTempGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feature-runner-repo-"));
  await runGit(dir, ["init"]);
  await runGit(dir, ["config", "user.email", "runner-test@example.com"]);
  await runGit(dir, ["config", "user.name", "Runner Test"]);
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  await runGit(dir, ["add", "README.md"]);
  await runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

function postRun(
  port: number,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: FeatureSprintRunnerResponse | { error: string } }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/feature-sprint/run",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function postCleanup(
  port: number,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: FeatureSprintWorktreeCleanupResponse | { error: string } }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/feature-sprint/cleanup-worktree",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function getHealth(
  port: number,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: { ok?: boolean; mode?: string; error?: string } }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
        headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

describe("feature-sprint-runner", () => {
  const envSnapshot = { ...process.env };
  let server: http.Server;
  let port: number;
  let tempRepoPath: string | undefined;
  let tempWorktreeRoot: string | undefined;

  beforeEach(async () => {
    process.env = { ...envSnapshot };
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX;
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;

    tempWorktreeRoot = await mkdtemp(path.join(os.tmpdir(), "feature-runner-worktrees-"));
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = tempWorktreeRoot;
    tempRepoPath = await createTempGitRepo();

    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        port = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env = { ...envSnapshot };
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (tempRepoPath) {
      await rm(tempRepoPath, { recursive: true, force: true });
    }
    if (tempWorktreeRoot) {
      await rm(tempWorktreeRoot, { recursive: true, force: true });
    }
  });

  it("defaults to mock mode when MODE is unset", async () => {
    const health = await getHealth(port);
    expect(health.statusCode).toBe(200);
    expect(health.body.mode).toBe("mock");

    const result = await postRun(port, baseRequest);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, profile: "codex_scoping" });
    if ("outputText" in result.body && result.body.outputText) {
      expect(parseFeatureSprintPlanBlock(result.body.outputText)?.title).toBeTruthy();
    }
  });

  it("returns mock review fence for codex_review", async () => {
    const result = await postRun(port, {
      profile: "codex_review",
      promptMarkdown: "Review this output."
    });
    expect(result.statusCode).toBe(200);
    if ("outputText" in result.body && result.body.outputText) {
      expect(parseFeatureReviewVerdictBlock(result.body.outputText)?.status).toBe("accepted");
    }
  });

  it("returns mock implementation output with isolated worktree metadata", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement this bounded slice.",
      cardId: "card-build-test",
      repoPath: tempRepoPath,
      worktree: { enabled: true }
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      profile: "codex_implementation"
    });

    if (!("worktreePath" in result.body)) {
      throw new Error("Expected worktreePath in response.");
    }

    expect(result.body.worktreePath).toContain(resolveWorktreeRoot());
    expect(result.body.branchName).toBeTruthy();
    expect(result.body.changedFiles?.length).toBeGreaterThan(0);
    expect(result.body.diffStat).toBeTruthy();
    expect(result.body.gitStatus).toBeTruthy();
    expect(result.body.diffText).toBeFalsy();
  });

  it("runs verification commands after mock implementation and continues after failure", async () => {
    const fixtureDir = path.join(tempRepoPath!, ".life-harness");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(path.join(fixtureDir, "verify-pass.js"), "process.exit(0);\n");
    await writeFile(path.join(fixtureDir, "verify-fail.js"), "process.exit(1);\n");
    await writeFile(path.join(fixtureDir, "verify-pass-2.js"), "process.exit(0);\n");
    await runGit(tempRepoPath!, ["add", ".life-harness"]);
    await runGit(tempRepoPath!, ["commit", "-m", "verification fixtures"]);

    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement with verification.",
      cardId: "card-build-test",
      repoPath: tempRepoPath,
      worktree: { enabled: true },
      runVerification: true,
      verificationCommands: [
        "node .life-harness/verify-pass.js",
        "node .life-harness/verify-fail.js",
        "node .life-harness/verify-pass-2.js"
      ]
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, profile: "codex_implementation" });
    if (!("verificationResults" in result.body)) {
      throw new Error("Expected verificationResults in response.");
    }

    expect(result.body.verificationResults).toHaveLength(3);
    expect(result.body.verificationResults?.map((row) => row.status)).toEqual([
      "passed",
      "failed",
      "passed"
    ]);
  });

  it("rejects unsafe verification commands via parser without failing implementation", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement with unsafe verify.",
      repoPath: tempRepoPath,
      worktree: { enabled: true },
      runVerification: true,
      verificationCommands: ["npm test | head"]
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true });
    if (!("verificationResults" in result.body)) {
      throw new Error("Expected verificationResults in response.");
    }

    expect(result.body.verificationResults?.[0]?.status).toBe("failed");
    expect(result.body.verificationResults?.[0]?.error).toContain("parser");
  });

  it("runs npm --version verification without spawn EINVAL", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement with npm verification.",
      repoPath: tempRepoPath,
      worktree: { enabled: true },
      runVerification: true,
      verificationCommands: ["npm --version"]
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, profile: "codex_implementation" });
    if (!("verificationResults" in result.body)) {
      throw new Error("Expected verificationResults in response.");
    }

    expect(result.body.verificationResults).toHaveLength(1);
    const row = result.body.verificationResults?.[0];
    expect(row?.status).toBe("passed");
    expect(row?.error).toBeUndefined();
    const output = `${row?.stdoutExcerpt ?? ""}${row?.stderrExcerpt ?? ""}`;
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it("rejects verification fields on scoping profile", async () => {
    const result = await postRun(port, {
      profile: "codex_scoping",
      promptMarkdown: "Scope packet",
      runVerification: true,
      verificationCommands: ["npm test"]
    });

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: expect.stringContaining("codex_implementation")
    });
  });

  it("rejects verification fields on review profile", async () => {
    const result = await postRun(port, {
      profile: "codex_review",
      promptMarkdown: "Review packet",
      verificationCommands: ["npm test"]
    });

    expect(result.statusCode).toBe(400);
  });

  it("rejects implementation profile when repoPath is missing", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement",
      worktree: { enabled: true }
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: "codex_implementation requires repoPath."
    });
  });

  it("rejects implementation profile when worktree is not enabled", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement",
      repoPath: tempRepoPath
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: "codex_implementation requires worktree.enabled === true."
    });
  });

  it("rejects invalid profile", async () => {
    const result = await postRun(port, {
      profile: "codex_builder",
      promptMarkdown: "nope"
    });
    expect(result.statusCode).toBe(400);
  });

  it("rejects MODE=codex without ENABLE_CODEX=1", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "codex";

    const result = await postRun(port, baseRequest);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      error: expect.stringContaining("FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1")
    });
  });

  it("rejects real implementation without ENABLE_IMPLEMENTATION=1", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "codex";
    process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX = "1";
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "secret-token";

    const result = await postRun(
      port,
      {
        profile: "codex_implementation",
        promptMarkdown: "Implement slice",
        repoPath: tempRepoPath,
        worktree: { enabled: true }
      },
      { Authorization: "Bearer secret-token" }
    );

    expect(result.statusCode).toBe(500);
    expect(result.body).toMatchObject({
      ok: false,
      error: expect.stringContaining("FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1")
    });
  });

  it("rejects empty prompt", async () => {
    const result = await postRun(port, {
      profile: "codex_scoping",
      promptMarkdown: ""
    });
    expect(result.statusCode).toBe(400);
  });

  it("requires bearer token when token is configured", async () => {
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "secret-token";

    const unauthorized = await postRun(port, baseRequest);
    expect(unauthorized.statusCode).toBe(401);

    const wrongToken = await postRun(port, baseRequest, {
      Authorization: "Bearer wrong"
    });
    expect(wrongToken.statusCode).toBe(401);

    const authorized = await postRun(port, baseRequest, {
      Authorization: "Bearer secret-token"
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.body).toMatchObject({ ok: true });
  });

  it("cleans up worktrees via POST /feature-sprint/cleanup-worktree", async () => {
    const runResult = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "Implement slice.",
      cardId: "card-build-test",
      repoPath: tempRepoPath,
      worktree: { enabled: true }
    });
    expect(runResult.statusCode).toBe(200);
    if (!("worktreePath" in runResult.body) || !runResult.body.worktreePath) {
      throw new Error("Expected worktreePath in implementation response.");
    }

    const cleanupResult = await postCleanup(port, {
      worktreePath: runResult.body.worktreePath,
      branchName: runResult.body.branchName,
      repoPath: tempRepoPath,
      force: true
    });

    expect(cleanupResult.statusCode).toBe(200);
    expect(cleanupResult.body).toMatchObject({ ok: true, status: "cleaned" });
  });

  it("requires bearer token for cleanup when token is configured", async () => {
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "secret-token";

    const unauthorized = await postCleanup(port, {
      worktreePath: path.join(tempWorktreeRoot!, "missing"),
      repoPath: tempRepoPath
    });
    expect(unauthorized.statusCode).toBe(401);

    const invalidBody = await postCleanup(
      port,
      { worktreePath: "" },
      { Authorization: "Bearer secret-token" }
    );
    expect(invalidBody.statusCode).toBe(400);

    const authorized = await postCleanup(
      port,
      {
        worktreePath: path.join(tempWorktreeRoot!, "life-harness/missing-branch"),
        branchName: "life-harness/missing-branch",
        repoPath: tempRepoPath
      },
      { Authorization: "Bearer secret-token" }
    );
    expect(authorized.statusCode).toBe(200);
    expect(authorized.body).toMatchObject({ status: "not_found" });
  });
});
