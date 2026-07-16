# Manual smoke: real Cursor CLI via Feature Sprint runner (Windows)
#
# Usage (PowerShell, from repo root):
#   $env:FEATURE_SPRINT_RUNNER_MODE = "cursor"
#   $env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR = "1"
#   $env:FEATURE_SPRINT_RUNNER_TOKEN = "your-dev-token"
#   $env:CURSOR_API_KEY = "your-cursor-api-key"
#   .\services\feature-sprint-runner\scripts\smoke_cursor_real.ps1
#
# Prefer the multi-profile script:
#   .\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile cursor_scoping

param(
  [ValidateSet("cursor_scoping", "cursor_implementation", "cursor_review")]
  [string]$Profile = "cursor_scoping",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [int]$TimeoutSec = 600
)

& (Join-Path $PSScriptRoot "smoke_real_profiles.ps1") -Profile $Profile -RepoRoot $RepoRoot -TimeoutSec $TimeoutSec
