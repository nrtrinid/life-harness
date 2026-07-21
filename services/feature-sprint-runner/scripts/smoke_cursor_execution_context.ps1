# Opt-in integrated Sprint Map + Cursor smoke.
# Proves typed executionContext round-trip through the real runner HTTP path.
#
# Usage (repo root):
#   1. Start: npm run feature-runner:cursor
#   2. Run:   powershell -NoProfile -ExecutionPolicy Bypass -File services/feature-sprint-runner/scripts/smoke_cursor_execution_context.ps1
#
# Exit codes:
#   0 = passed (context echoed; history fields match)
#   1 = product/smoke failure
#   2 = blocked (missing credentials/CLI/runner)

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [string]$BaseUrl = "http://127.0.0.1:8127",
  [int]$TimeoutSec = 300
)

$ErrorActionPreference = "Stop"

function Import-DotEnvFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

Import-DotEnvFile (Join-Path $RepoRoot "services\feature-sprint-runner\.env.local")

Write-Host "Feature Sprint integrated Cursor executionContext smoke"
Write-Host "Repo root: $RepoRoot"
Write-Host "Base URL:  $BaseUrl"

foreach ($name in @("FEATURE_SPRINT_RUNNER_TOKEN", "CURSOR_API_KEY")) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    Write-Host "SMOKE_STATUS=blocked"
    Write-Host "BLOCKER=missing_$name"
    [Environment]::Exit(2)
  }
}
if ($env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR -ne "1") {
  Write-Host "SMOKE_STATUS=blocked"
  Write-Host "BLOCKER=FEATURE_SPRINT_RUNNER_ENABLE_CURSOR"
  [Environment]::Exit(2)
}

$agentCmd = if ($env:FEATURE_SPRINT_CURSOR_BIN) { $env:FEATURE_SPRINT_CURSOR_BIN } else { "agent" }
try {
  & $agentCmd --version 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "non-zero" }
} catch {
  Write-Host "SMOKE_STATUS=blocked"
  Write-Host "BLOCKER=missing_cursor_cli"
  [Environment]::Exit(2)
}

$nonce = "LH_CTX_" + [guid]::NewGuid().ToString("N").Substring(0, 10)
$runnerExecutionContext = @{
  planId = "plan-smoke-ctx"
  executionModel = "sprint_map"
  sprintId = "sprint-smoke-1"
  storyId = "story-smoke-1"
  taskId = "task-smoke-1"
  phase = "review"
  stepId = "step-smoke-1"
}

$prompt = @"
You are running a read-only Feature Sprint review smoke for Life Harness.

Respond with plain text that includes this exact nonce on its own line:
$nonce

Do not modify any files. Do not run destructive commands. Keep the answer under 5 lines.
"@

$body = @{
  profile = "cursor_review"
  promptMarkdown = $prompt
  timeoutMs = ($TimeoutSec * 1000)
  executionContext = $runnerExecutionContext
} | ConvertTo-Json -Depth 6

$headers = @{
  Authorization = "Bearer $($env:FEATURE_SPRINT_RUNNER_TOKEN)"
  "Content-Type" = "application/json"
}

try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $headers -Method Get -TimeoutSec 5
} catch {
  Write-Host "SMOKE_STATUS=blocked"
  Write-Host "BLOCKER=runner_unreachable"
  Write-Host "HINT=Start with: npm run feature-runner:cursor"
  [Environment]::Exit(2)
}

if (-not $health.ok) {
  Write-Host "SMOKE_STATUS=blocked"
  Write-Host "BLOCKER=runner_unhealthy"
  Write-Host ($health | ConvertTo-Json -Depth 6)
  [Environment]::Exit(2)
}

Write-Host "Posting cursor_review with typed executionContext..."
try {
  $response = Invoke-WebRequest -Uri "$BaseUrl/feature-sprint/run" -Headers $headers -Method Post -Body $body -TimeoutSec ($TimeoutSec + 30)
  $parsed = $response.Content | ConvertFrom-Json
} catch {
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $raw = $reader.ReadToEnd()
    Write-Host "SMOKE_STATUS=failed"
    Write-Host "BLOCKER=http_error"
    Write-Host $raw
    [Environment]::Exit(1)
  }
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=request_error"
  Write-Host $_
  [Environment]::Exit(1)
}

$echo = $parsed.executionContext
if (-not $echo) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=missing_execution_context_echo"
  Write-Host ($parsed | ConvertTo-Json -Depth 8)
  [Environment]::Exit(1)
}

$required = @("planId", "sprintId", "storyId", "taskId", "phase")
foreach ($key in $required) {
  if ($echo.$key -ne $runnerExecutionContext[$key]) {
    Write-Host "SMOKE_STATUS=failed"
    Write-Host "BLOCKER=context_mismatch_$key"
    Write-Host "expected=$($runnerExecutionContext[$key]) actual=$($echo.$key)"
    [Environment]::Exit(1)
  }
}

$output = [string]$parsed.outputText
if ([string]::IsNullOrWhiteSpace($output) -or $output -notmatch [regex]::Escape($nonce)) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=nonce_missing_or_empty_output"
  Write-Host "resultUsability=$($parsed.resultUsability)"
  Write-Host "failureClass=$($parsed.failureClass)"
  Write-Host "diagnosticMessage=$($parsed.diagnosticMessage)"
  [Environment]::Exit(1)
}

if ($parsed.ok -ne $true) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=runner_reported_not_ok"
  Write-Host ($parsed | ConvertTo-Json -Depth 8)
  [Environment]::Exit(1)
}

Write-Host "SMOKE_STATUS=passed"
Write-Host "ECHO_PLAN_ID=$($echo.planId)"
Write-Host "ECHO_SPRINT_ID=$($echo.sprintId)"
Write-Host "ECHO_STORY_ID=$($echo.storyId)"
Write-Host "ECHO_TASK_ID=$($echo.taskId)"
Write-Host "ECHO_PHASE=$($echo.phase)"
Write-Host "RUN_ID=$($parsed.runId)"
Write-Host "NOTE=No automatic import/save/advance/complete/cleanup was invoked by this smoke."
[Environment]::Exit(0)
