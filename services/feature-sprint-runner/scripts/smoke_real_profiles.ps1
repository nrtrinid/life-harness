# Manual opt-in smoke for Feature Sprint real runners (Windows PowerShell).
# Does NOT run in CI. Does not fabricate success when CLIs/credentials are missing.
#
# Usage (repo root):
#   .\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile cursor_scoping
#   .\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile codex_review
#
# Prerequisites:
#   1. Configure env / .env.local (see docs/feature-sprint-runner-setup-v0.1.md)
#   2. npm run feature-runner:setup-check
#   3. Start runner: npm run feature-runner:cursor  OR  npm run feature-runner:real
#   4. Re-run this smoke

param(
  [ValidateSet(
    "cursor_scoping",
    "cursor_implementation",
    "cursor_review",
    "codex_scoping",
    "codex_implementation",
    "codex_review"
  )]
  [string]$Profile = "cursor_scoping",
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

Write-Host "Feature Sprint real-mode smoke"
Write-Host "Profile: $Profile"
Write-Host "Repo root: $RepoRoot"

$isCursor = $Profile.StartsWith("cursor_")
$isImpl = $Profile.EndsWith("_implementation")

# Exit 2 = blocked/not-run (missing env/CLI). Exit 1 = smoke/product failure.
function Exit-Blocked([string]$Blocker) {
  Write-Host "SMOKE_STATUS=blocked"
  Write-Host "BLOCKER=$Blocker"
  [Environment]::Exit(2)
}

if ($isCursor) {
  foreach ($name in @("FEATURE_SPRINT_RUNNER_TOKEN", "CURSOR_API_KEY")) {
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      Exit-Blocked "missing_$name"
    }
  }
  if ($env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR -ne "1") {
    Exit-Blocked "FEATURE_SPRINT_RUNNER_ENABLE_CURSOR"
  }
} else {
  if (-not $env:FEATURE_SPRINT_RUNNER_TOKEN) {
    Exit-Blocked "missing_FEATURE_SPRINT_RUNNER_TOKEN"
  }
  if ($env:FEATURE_SPRINT_RUNNER_ENABLE_CODEX -ne "1") {
    Exit-Blocked "FEATURE_SPRINT_RUNNER_ENABLE_CODEX"
  }
  $codexBin = if ($env:FEATURE_SPRINT_CODEX_BIN) { $env:FEATURE_SPRINT_CODEX_BIN } else { "codex" }
  Write-Host "Checking Codex binary: $codexBin"
  try {
    & $codexBin --version 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "non-zero" }
  } catch {
    Exit-Blocked "missing_codex_cli"
  }
}

if ($isImpl -and $env:FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION -ne "1") {
  Exit-Blocked "FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION"
}

if ($isCursor) {
  $agentCmd = if ($env:FEATURE_SPRINT_CURSOR_BIN) { $env:FEATURE_SPRINT_CURSOR_BIN } else { "agent" }
  Write-Host "Checking Cursor binary: $agentCmd"
  try {
    & $agentCmd --version 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "non-zero" }
  } catch {
    Exit-Blocked "missing_cursor_cli"
  }
}

$tempRepo = Join-Path ([System.IO.Path]::GetTempPath()) ("feature-sprint-smoke-" + [guid]::NewGuid().ToString("n"))
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

$bodyObj = @{
  profile = $Profile
  promptMarkdown = @"
## Feature Sprint smoke ($Profile)

Return a short response suitable for this profile.
For scoping: include a fenced feature-sprint-plan JSON block for a trivial hello-world feature.
For review: include a fenced feature-review-verdict JSON block approving a trivial change.
For implementation: create .life-harness/smoke-result.md with one line of text only inside this workspace.
"@
  repoPath = $tempRepo
}

if ($isImpl) {
  $bodyObj.worktree = @{ enabled = $true }
}

$body = $bodyObj | ConvertTo-Json -Depth 5
$headers = @{
  "Content-Type" = "application/json"
  Authorization = "Bearer $($env:FEATURE_SPRINT_RUNNER_TOKEN)"
}

$port = if ($env:FEATURE_SPRINT_RUNNER_PORT) { $env:FEATURE_SPRINT_RUNNER_PORT } else { "8127" }
$uri = "http://127.0.0.1:$port/feature-sprint/run"
Write-Host "POST $uri (timeout ${TimeoutSec}s)"
Write-Host "Start runner separately if needed: npm run feature-runner:cursor  or  npm run feature-runner:real"

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $uri `
    -Headers $headers `
    -Body $body `
    -TimeoutSec $TimeoutSec
} catch {
  Remove-Item -Recurse -Force $tempRepo -ErrorAction SilentlyContinue
  Write-Error "Request failed. Exact blocker: $($_.Exception.Message). Ensure the runner is listening on port $port."
}

Write-Host "ok=$($response.ok) profile=$($response.profile) terminationReason=$($response.terminationReason) failureClass=$($response.failureClass) resultUsability=$($response.resultUsability) runnerMode=$($response.runnerMode)"
if ($response.commandPreview) { Write-Host "commandPreview=$($response.commandPreview)" }
if ($response.error) { Write-Host "error=$($response.error)" }
if ($response.diagnosticMessage) { Write-Host "diagnosticMessage=$($response.diagnosticMessage)" }
if ($response.worktreePath) { Write-Host "worktreePath=$($response.worktreePath)" }
if ($response.outputText) {
  $excerpt = $response.outputText
  if ($excerpt.Length -gt 1200) { $excerpt = $excerpt.Substring(0, 1200) + "`n...[truncated]" }
  Write-Host "--- output excerpt ---"
  Write-Host $excerpt
}

Remove-Item -Recurse -Force $tempRepo -ErrorAction SilentlyContinue

# Real-profile smoke must not pass against mock mode (nonce/mock text is not proof of a real provider).
$preview = [string]$response.commandPreview
$mode = [string]$response.runnerMode
if ($mode -eq "mock" -or $preview.StartsWith("mock:")) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=mock_mode_not_real"
  Write-Error "Smoke failed for ${Profile}: runnerMode/commandPreview indicates mock execution. Start a real Cursor/Codex runner."
  exit 1
}

if ($response.failureClass -eq "empty_output" -or $response.resultUsability -eq "empty_output") {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=empty_output_after_exit_zero"
  Write-Error "Smoke failed for ${Profile}: process completed but captured output was empty/unusable."
  exit 1
}

if (-not $response.ok) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Error "Smoke failed for ${Profile} (ok=false). See error/diagnosticMessage above."
  exit 1
}

if ([string]::IsNullOrWhiteSpace([string]$response.outputText) -and -not $isImpl) {
  Write-Host "SMOKE_STATUS=failed"
  Write-Host "BLOCKER=empty_captured_content"
  Write-Error "Smoke failed for ${Profile}: nonempty output required for this profile."
  exit 1
}

Write-Host "SMOKE_STATUS=passed"
Write-Host "Smoke finished OK for ${Profile}."
