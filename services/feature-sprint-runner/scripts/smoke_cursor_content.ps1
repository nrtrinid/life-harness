# Opt-in Cursor content smoke — requires recognizable captured output (not just exit 0).
#
# Usage (repo root, runner already started in cursor/real mode):
#   .\services\feature-sprint-runner\scripts\smoke_cursor_content.ps1
#
# Exit codes:
#   0 = passed (nonce found in captured output)
#   1 = product/smoke failure (empty output, missing nonce, runner error)
#   2 = blocked (missing credentials/CLI) — not a product regression

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [int]$TimeoutSec = 600
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

Write-Host "Feature Sprint Cursor CONTENT smoke (requires nonempty nonce capture)"
Write-Host "Repo root: $RepoRoot"

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

$nonce = "LH_SMOKE_" + [guid]::NewGuid().ToString("N").Substring(0, 12)
$tempRepo = Join-Path ([System.IO.Path]::GetTempPath()) ("feature-sprint-content-smoke-" + [guid]::NewGuid().ToString("n"))
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

$prompt = @"
You are running a Feature Sprint runner content smoke.

Read-only rules: do not edit files, do not run mutating commands.

Respond with EXACTLY two lines and nothing else:
LINE1: $nonce
LINE2: content-smoke-ok

Do not wrap in markdown fences. Do not add commentary.
"@

$body = @{
  profile = "cursor_scoping"
  promptMarkdown = $prompt
  repoPath = $tempRepo
  timeoutMs = ($TimeoutSec * 1000)
} | ConvertTo-Json -Depth 5

$headers = @{
  "Content-Type" = "application/json"
  Authorization = "Bearer $($env:FEATURE_SPRINT_RUNNER_TOKEN)"
}

$port = if ($env:FEATURE_SPRINT_RUNNER_PORT) { $env:FEATURE_SPRINT_RUNNER_PORT } else { "8127" }
Write-Host "Expected nonce: $nonce"
Write-Host "POST http://127.0.0.1:$port/feature-sprint/run"

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:$port/feature-sprint/run" `
    -Headers $headers `
    -Body $body `
    -TimeoutSec $TimeoutSec
} catch {
  Remove-Item -Recurse -Force $tempRepo -ErrorAction SilentlyContinue
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=runner_request_failed"
  Write-Error "Request failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "ok=$($response.ok) terminationReason=$($response.terminationReason) failureClass=$($response.failureClass) resultUsability=$($response.resultUsability) durationMs=$($response.durationMs) provider=$($response.provider) profile=$($response.profile) runnerMode=$($response.runnerMode)"
if ($response.commandPreview) { Write-Host "commandPreview=$($response.commandPreview)" }
if ($response.diagnosticMessage) { Write-Host "diagnosticMessage=$($response.diagnosticMessage)" }
if ($response.parseWarnings) { Write-Host "parseWarnings=$($response.parseWarnings -join ' | ')" }

$captured = ""
if ($response.outputText) { $captured += [string]$response.outputText }
if ($response.stdoutText) { $captured += "`n" + [string]$response.stdoutText }
if ($response.stderrText) { $captured += "`n" + [string]$response.stderrText }

$excerpt = $captured
if ($excerpt.Length -gt 800) { $excerpt = $excerpt.Substring(0, 800) + "...[truncated]" }
Write-Host "--- captured excerpt ---"
Write-Host $excerpt

Remove-Item -Recurse -Force $tempRepo -ErrorAction SilentlyContinue

# Real content smoke must not pass against mock mode (a nonce in mock output is not proof).
$preview = [string]$response.commandPreview
$mode = [string]$response.runnerMode
if ($mode -eq "mock" -or $preview.StartsWith("mock:")) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=mock_mode_not_real"
  exit 1
}

if ($response.terminationReason -eq "completed" -and $response.failureClass -eq "empty_output") {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=empty_output_after_exit_zero"
  exit 1
}

if (-not $response.ok) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=runner_ok_false"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($captured)) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=empty_captured_content"
  exit 1
}

if ($captured -notmatch [regex]::Escape($nonce)) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=nonce_missing_from_capture"
  exit 1
}

if ($response.provider -ne "cursor" -or $response.profile -ne "cursor_scoping") {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=unexpected_provider_or_profile"
  exit 1
}

if ($null -eq $response.durationMs -or $response.durationMs -lt 0) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=missing_durationMs"
  exit 1
}

Write-Host "SMOKE_STATUS=passed"
Write-Host "Smoke finished OK - nonce captured in runner output."
exit 0
