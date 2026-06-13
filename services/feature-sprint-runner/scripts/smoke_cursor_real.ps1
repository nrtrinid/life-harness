# Manual smoke: real Cursor CLI via Feature Sprint runner (Windows)
#
# Usage (PowerShell, from repo root):
#   $env:FEATURE_SPRINT_RUNNER_MODE = "cursor"
#   $env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR = "1"
#   $env:FEATURE_SPRINT_RUNNER_TOKEN = "your-dev-token"
#   $env:CURSOR_API_KEY = "your-cursor-api-key"
#   .\services\feature-sprint-runner\scripts\smoke_cursor_real.ps1
#
# Requires: agent CLI on PATH, local git, Node/npm for runner service.

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [int]$TimeoutSec = 600
)

$ErrorActionPreference = "Stop"

Write-Host "Feature Sprint Cursor real-mode smoke"
Write-Host "Repo root: $RepoRoot"

if (-not $env:FEATURE_SPRINT_RUNNER_MODE) {
  $env:FEATURE_SPRINT_RUNNER_MODE = "cursor"
}
if (-not $env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR) {
  $env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR = "1"
}

$required = @(
  "FEATURE_SPRINT_RUNNER_TOKEN",
  "CURSOR_API_KEY"
)
foreach ($name in $required) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if (-not $value) {
    Write-Error "Missing env var: $name"
  }
}

$agentCmd = $env:FEATURE_SPRINT_CURSOR_BIN
if (-not $agentCmd) { $agentCmd = "agent" }

Write-Host "Checking agent binary: $agentCmd"
& $agentCmd --version 2>&1 | Write-Host

$tempRepo = Join-Path ([System.IO.Path]::GetTempPath()) ("feature-sprint-cursor-smoke-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $tempRepo | Out-Null
Push-Location $tempRepo
try {
  git init | Out-Null
  git config user.email "smoke@example.com"
  git config user.name "Smoke"
  "# smoke" | Out-File -Encoding utf8 README.md
  git add README.md
  git commit -m "init" | Out-Null
} finally {
  Pop-Location
}

$startedAt = Get-Date
Write-Host "Started: $startedAt"

Push-Location $RepoRoot
try {
  $body = @{
    profile = "cursor_scoping"
    promptMarkdown = @"
## Scoping smoke

Return short prose plus a fenced feature-sprint-plan JSON block for a trivial hello-world feature.
"@
    repoPath = $tempRepo
  } | ConvertTo-Json -Depth 5

  $headers = @{
    "Content-Type" = "application/json"
    Authorization = "Bearer $($env:FEATURE_SPRINT_RUNNER_TOKEN)"
  }

  $port = if ($env:FEATURE_SPRINT_RUNNER_PORT) { $env:FEATURE_SPRINT_RUNNER_PORT } else { "8127" }
  Write-Host "POST http://127.0.0.1:$port/feature-sprint/run (timeout ${TimeoutSec}s)"
  Write-Host "Start runner separately: npm run feature-runner"

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:$port/feature-sprint/run" `
    -Headers $headers `
    -Body $body `
    -TimeoutSec $TimeoutSec

  $elapsed = (Get-Date) - $startedAt
  Write-Host "Completed in $($elapsed.TotalSeconds.ToString('0.0'))s"
  Write-Host "ok=$($response.ok) profile=$($response.profile)"
  if ($response.commandPreview) {
    Write-Host "commandPreview=$($response.commandPreview)"
  }
  if ($response.error) {
    Write-Host "error=$($response.error)"
  }
  if ($response.outputText) {
    $excerpt = $response.outputText
    if ($excerpt.Length -gt 1200) {
      $excerpt = $excerpt.Substring(0, 1200) + "`n...[truncated]"
    }
    Write-Host "--- output excerpt ---"
    Write-Host $excerpt
  }

  if (-not $response.ok) {
    exit 1
  }
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $tempRepo -ErrorAction SilentlyContinue
}

Write-Host "Smoke finished OK. Record results in docs/feature-sprint-cursor-runner-v0.1.md appendix."
