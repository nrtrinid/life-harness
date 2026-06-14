# Agent Token Benchmark v0.3: Noisy Raw Command Outputs

## Status

- Branch: `agent-token-dogfood-results-v0.1`
- Shell: PowerShell
- RTK command used for this pass:
  - `C:\Users\nicki\AppData\Local\rtk\rtk.exe`
- Scope: docs measurement only
- Optional typecheck commands were not run:
  - `npm run typecheck`
  - `npm run agent:typecheck`

## Measurement method

For each command pair:

- capture exit status
- count output lines (`\n` split)
- count characters from stdout/stderr combined
- compute rough token estimate as `chars / 4`

## Commands compared

| # | Command | Exit | Raw lines | Raw chars | Raw tokens | RTK lines | RTK chars | RTK tokens | Usefulness for implementation agent |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | `rg "export" src app services docs` | 0 | 2156 | 203,195 | 50,798.8 | 2156 | 203,195 | 50,798.8 | Useful for broad search, but very noisy. RTK output is not compressed and did not reduce size. |
| 2 | `rtk rg "export" src app services docs` | 0 | 2156 | 203,195 | 50,798.8 | 2156 | 203,195 | 50,798.8 | Same command intent via RTK wrapper with effectively identical volume/noise profile and no clear compression gain. |
| 3 | `git log --stat --oneline -40` | 0 | 658 | 41,698 | 10,424.5 | 658 | 41,698 | 10,424.5 | Useful for recent-change context. RTK output mirrors raw size closely. |
| 4 | `rtk git log --stat --oneline -40` | 0 | 658 | 41,698 | 10,424.5 | 658 | 41,698 | 10,424.5 | No meaningful reduction versus raw. |
| 5 | `git diff HEAD~5 --stat` | 0 | 14 | 844 | 211 | 14 | 843 | 210.8 | Useful focused change summary. RTK output is effectively the same. |
| 6 | `rtk git diff HEAD~5 --stat` | 0 | 14 | 844 | 211 | 14 | 843 | 210.8 | No practical token benefit in this run. |
| 7 | `npm run verify:core` | 0 | 109 | 10,977 | 2,744.2 | 109 | 10,978 | 2,744.5 | Very high-value verification command. RTK prefix produced identical-sized output and preserved all details. |
| 8 | `rtk npm run verify:core` | 0 | 109 | 10,977 | 2,744.2 | 109 | 10,978 | 2,744.5 | No meaningful RTK compression and still includes full raw output. |

## Notes on usefulness and losses

- RTK was useful as an installed binary, but in this benchmark it did not noticeably compress command outputs.
- For commands with large or high-noise output (`rg`, `git log`, `verify`), RTK preserved detail without reducing line/char volume.
- The measured RTK passes did **not** appear to lose important technical details, but they also did **not** help reduce token load.

## Recommendation

- **Default workflow:** continue using repo-native `agent:*` commands as the primary noisy-output workflow (`agent:preflight`, `agent:grep`, `agent:auto-check`, `agent:review-packet`).
- **RTK usage:** keep RTK optional and ad-hoc for raw terminal experiments where wrapper outputs are unavailable.
- **AGENTS.md guidance:** RTK does not appear to be a replacement for repo-native tooling; keep it as optional.
