# Manual smoke: real Codex CLI via Feature Sprint runner (Windows)
#
# Usage (PowerShell, from repo root):
#   $env:FEATURE_SPRINT_RUNNER_MODE = "codex"   # or "real"
#   $env:FEATURE_SPRINT_RUNNER_ENABLE_CODEX = "1"
#   $env:FEATURE_SPRINT_RUNNER_TOKEN = "your-dev-token"
#   .\services\feature-sprint-runner\scripts\smoke_codex_real.ps1
#
# Multi-profile:
#   .\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile codex_scoping

param(
  [ValidateSet("codex_scoping", "codex_implementation", "codex_review")]
  [string]$Profile = "codex_scoping",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [int]$TimeoutSec = 600
)

& (Join-Path $PSScriptRoot "smoke_real_profiles.ps1") -Profile $Profile -RepoRoot $RepoRoot -TimeoutSec $TimeoutSec
