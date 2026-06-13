# Start Feature Sprint runner in real mode (Codex + Cursor when configured).
# Usage (repo root): .\scripts\start-feature-runner-real.ps1
# Optional: copy .env.local.example to .env.local and set CURSOR_API_KEY.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot ".env.local"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

if (-not $env:FEATURE_SPRINT_RUNNER_TOKEN) {
  $env:FEATURE_SPRINT_RUNNER_TOKEN = "life-harness-local-dev"
}

$env:FEATURE_SPRINT_RUNNER_MODE = "real"
$env:FEATURE_SPRINT_RUNNER_ENABLE_CODEX = "1"
$env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR = "1"
$env:FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION = "1"
$env:FEATURE_SPRINT_CODEX_BIN = if ($env:FEATURE_SPRINT_CODEX_BIN) { $env:FEATURE_SPRINT_CODEX_BIN } else { "$env:APPDATA\npm\codex.cmd" }
$env:FEATURE_SPRINT_CURSOR_BIN = if ($env:FEATURE_SPRINT_CURSOR_BIN) { $env:FEATURE_SPRINT_CURSOR_BIN } else { (Join-Path $repoRoot "scripts\cursor-agent-wrapper.cmd") }
$env:FEATURE_SPRINT_CURSOR_MODEL = if ($env:FEATURE_SPRINT_CURSOR_MODEL) { $env:FEATURE_SPRINT_CURSOR_MODEL } else { "auto" }

Write-Host "[feature-runner:real] mode=$($env:FEATURE_SPRINT_RUNNER_MODE)"
Write-Host "[feature-runner:real] codex=$($env:FEATURE_SPRINT_CODEX_BIN)"
Write-Host "[feature-runner:real] cursor=$($env:FEATURE_SPRINT_CURSOR_BIN)"
Write-Host "[feature-runner:real] cursor_model=$($env:FEATURE_SPRINT_CURSOR_MODEL)"
Write-Host "[feature-runner:real] cursor_api_key=$([bool]$env:CURSOR_API_KEY)"

npm run feature-runner
