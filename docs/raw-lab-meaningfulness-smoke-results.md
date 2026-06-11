# Raw Lab Meaningfulness Smoke Results

Generated: 2026-06-11T05:23:12.486341+00:00

This report is for the real OpenVINO Raw Lab smoke, not the mock CI bench.

Worktree note: Current laptop working tree state; check `git status --short` for exact files.

## Laptop Blocked / A770 Required

Status: blocked on this laptop. No real-model results were collected.

- Provider used for real smoke: none
- Model path on laptop: missing
- Fast vs Deep real results: not collected
- Laptop gateway venv: `services/ai-gateway/.venv` exists locally and is ignored by git
- `openvino` import: ok
- `openvino_genai` import: ok
- Mock gateway tests: pass

Reason: `SCOUT_MODEL_PATH` points at `C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway\models\qwen3-8b-int4-ov`, but that model directory does not exist on this laptop.

Approved model locations checked:

- `C:\Users\nicki\Projects\life-harness\services\ai-gateway\models\qwen3-8b-int4-ov`: missing
- `C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway\models`: missing
- `C:\Users\nicki\Models`: missing

Do not treat this as a failed model-quality result. It is only an environment handoff: the smoke needs the A770 desktop or an existing approved OpenVINO model path.

## A770 Desktop Runbook

Run these from the repo on the A770 desktop.

```powershell
cd C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway

if (!(Test-Path .venv)) {
  python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install -e ".[dev,openvino]"

$env:SCOUT_PROVIDER = "openvino"
$env:SCOUT_MODEL_PATH = "models\qwen3-8b-int4-ov"
$env:SCOUT_DEVICE = "GPU"

.\.venv\Scripts\python.exe -c "import openvino; import openvino_genai; print('openvino imports ok')"
Test-Path $env:SCOUT_MODEL_PATH

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111
```

In a second PowerShell window on the A770 desktop:

```powershell
cd C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway

$env:SCOUT_PROVIDER = "openvino"
$env:SCOUT_MODEL_PATH = "models\qwen3-8b-int4-ov"
$env:SCOUT_DEVICE = "GPU"

Invoke-RestMethod http://127.0.0.1:8111/health

.\.venv\Scripts\python.exe scripts\raw_lab_real_meaningfulness_smoke.py --output ..\..\docs\raw-lab-meaningfulness-smoke-results.md
```

Stop the gateway after the smoke run with `Ctrl+C` in the uvicorn window.

## Remote Laptop Option

If the gateway is running on the A770 desktop and is reachable from the laptop at `http://<desktop-ip>:8111`, the laptop can run the same smoke script against the desktop gateway.

On the A770 desktop:

```powershell
cd C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway

$env:SCOUT_PROVIDER = "openvino"
$env:SCOUT_MODEL_PATH = "models\qwen3-8b-int4-ov"
$env:SCOUT_DEVICE = "GPU"

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8111
```

On the laptop:

```powershell
cd C:\Users\nicki\Projects\Personal\life-harness\services\ai-gateway

$env:SCOUT_PROVIDER = "openvino"

.\.venv\Scripts\python.exe scripts\raw_lab_real_meaningfulness_smoke.py --base-url http://<desktop-ip>:8111 --output ..\..\docs\raw-lab-meaningfulness-smoke-results.md
```

The remote option uses the script's `--base-url` flag. For non-localhost base URLs, the script skips laptop-local OpenVINO import and model-path checks and relies on the desktop gateway `/health` response instead. Keep `$env:SCOUT_PROVIDER="openvino"` set on the laptop so the run is explicitly marked as real-provider smoke.

## Prerequisite Checklist

- `.\.venv\Scripts\python.exe -c "import openvino; import openvino_genai; print('ok')"` succeeds.
- `$env:SCOUT_MODEL_PATH` points to an existing `qwen3-8b-int4-ov` directory.
- The A770 GPU is visible to OpenVINO and `SCOUT_DEVICE=GPU` is set.
- `GET /health` returns provider `openvino`.
- `/health` includes provider health with `provider_ready: true`, or a degraded status with an actionable message.
- The smoke runner completes all Raw Lab meaningfulness cases.
- Each case sends both `reasoning_depth=fast` and `reasoning_depth=deep`.
- The final report contains real Fast vs Deep observations only after actual model output is collected.

For the remote laptop option, the OpenVINO import, model path, and GPU visibility checks apply to the A770 desktop, not to the laptop.

## Current Result

No Fast vs Deep rows are included here because no real OpenVINO model output was collected on this laptop.

Next valid completion states:

- Run the smoke on the A770 desktop and let this file be replaced with the real generated results.
- Run the laptop script against the desktop gateway with `--base-url`.
- If setup still fails, regenerate this report with the exact blocker and no fake result rows.
