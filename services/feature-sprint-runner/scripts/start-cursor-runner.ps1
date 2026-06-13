# Start Feature Sprint runner in real Cursor mode (Windows).
# Copy .env.local.example -> .env.local and set CURSOR_API_KEY first.
#
# Usage (repo root):
#   .\services\feature-sprint-runner\scripts\start-cursor-runner.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$EnvFile = Join-Path $RepoRoot "services\feature-sprint-runner\.env.local"

function Import-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    Write-Error "Missing $Path — copy .env.local.example and set CURSOR_API_KEY."
  }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
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

Import-DotEnvFile $EnvFile

$agentDir = Join-Path $env:LOCALAPPDATA "cursor-agent"
if ($env:PATH -notlike "*$agentDir*") {
  $env:PATH = "$env:PATH;$agentDir"
}
if (-not $env:FEATURE_SPRINT_CURSOR_BIN) {
  $env:FEATURE_SPRINT_CURSOR_BIN = Join-Path $agentDir "agent.cmd"
}

if (-not $env:CURSOR_API_KEY?.Trim()) {
  Write-Error "CURSOR_API_KEY is empty in .env.local"
}

Write-Host "Feature Sprint runner (Cursor mode)"
Write-Host "Repo: $RepoRoot"
Write-Host "Agent: $($env:FEATURE_SPRINT_CURSOR_BIN)"
Write-Host "Model: $($env:FEATURE_SPRINT_CURSOR_MODEL)"

Push-Location $RepoRoot
try {
  npm run feature-runner:cursor
} finally {
  Pop-Location
}
