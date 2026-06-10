# Phi-4 / secondary critic — manual smoke results

Record A770 / SYCL manual runs here. Do not commit real personal context or model weights.

**Procedure:** [llamacpp-critic-slot.md](llamacpp-critic-slot.md)

## Session metadata

| Field | Value |
|-------|--------|
| Date | YYYY-MM-DD |
| Operator | |
| Gateway commit / branch | |
| llama.cpp build (SYCL?) | |
| Draft provider | `openvino` / `mock` |
| `SCOUT_CRITIC_SLOT` | `secondary` |
| `SCOUT_LLAMA_BASE_URL` | |
| `critic_small.enabled` | `true` / `false` |

## Per-run results

| Run | Model file | Quant | llama-server command (summary) | Draft latency (s) | Critic latency (s) | Verdict parse OK? | Useful critique? | Failure modes | Recommendation |
|-----|------------|-------|--------------------------------|-------------------|--------------------|--------------------|------------------|---------------|----------------|
| A clean deep | e.g. `phi-4-mini-instruct-q4_k_m.gguf` | Q4_K_M | `llama-server -m ... --port 8121 -ngl 99` | | | yes/no | yes/no/partial | | keep / tune / reject |
| B broad/sprawl | | | | | | | | `too_broad` missed, prose not JSON, timeout | |
| C pounce/career | | | | | | | career cited? | ignored stale career | |
| D1 server down | | | (stopped) | | n/a | n/a | n/a | fail-soft pass? | |
| D2 malformed JSON | | | | | | no (expected) | n/a | draft kept? | |

### Notes per run

#### Run A — clean deep pass

- Request: `What should I do next?` + seed `context_packet`
- `confidence_notes`:
- Critic revised? yes / no
- Raw critic JSON sample (redact):

```json

```

#### Run B — broad / sprawling

- Request message:
- Critic check ids observed:
- Answer length before/after:

#### Run C — pounce / career

- Request: `What is today's one pounce?`
- Career/stale mentioned in answer? 
- Hot build incorrectly prioritized?

#### Run D — fail-soft

- Server down: HTTP status ___ ; draft returned? ___
- Slot disabled fallback: log warning seen? ___

## Summary table (fill after session)

| Date | Draft model | Critic model | Quant | Backend | Avg latency | Parse success | Useful revisions | Failure modes | Recommendation |
| ---- | ----------- | ------------ | ----- | ------- | ----------- | ------------- | ---------------- | ------------- | -------------- |
| YYYY-MM-DD | Qwen3-8B OV | Phi-4-mini | Q4_K_M | llamacpp_secondary | | | | | |

## Decision rubric

| Outcome | Next step |
| ------- | --------- |
| Parse success **≥ 80%** and useful revisions are **common** | Add secondary critic eval fixtures in `evals/thread/`; keep `SCOUT_CRITIC_SLOT=secondary` manual/advanced only |
| Parse success **poor** | Add JSON repair for critic verdicts; simplify critic prompt |
| Latency **too high** | Keep `SCOUT_CRITIC_SLOT=same` as default; use secondary only for explicit “think harder” or batch jobs |

## Summary verdict

| Question | Answer |
|----------|--------|
| Ready for secondary critic eval fixtures? | yes / no / later |
| Default `SCOUT_CRITIC_SLOT` change? | stay `same` / local dev `secondary` only |
| Prompt/schema work needed? | |
| Blockers (VRAM, latency, parse rate): | |

## Follow-up (from smoke)

- [ ] Harden secondary critic evals in `evals/thread/`
- [ ] Improve critic prompt / JSON repair
- [ ] Keep secondary manual-only; document latency budget
- [ ] Try alternate quant or Phi-4 reasoning variant
