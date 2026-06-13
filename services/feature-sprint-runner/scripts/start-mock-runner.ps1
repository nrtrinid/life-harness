# Start Feature Sprint runner in mock mode (Windows).
# Usage (repo root):
#   .\services\feature-sprint-runner\scripts\start-mock-runner.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Push-Location $RepoRoot
try {
  npm run feature-runner:mock
} finally {
  Pop-Location
}
