# Raw Lab Meaningfulness Bench

The Raw Lab meaningfulness bench is a small mock-safe replay suite for checking whether Raw Lab Deep feels more specific, continuous, and useful than Raw Lab Fast.

It does not measure durable memory, consciousness, board reasoning, or real-world autonomy. It only checks the current Raw Lab request path: recent turns, temporary thread state, approved Companion Self-Memories included in the request, and the Fast/Deep depth setting.

## What It Scores

The bench uses deterministic heuristics:

- specificity: Deep refers to concrete thread-state details instead of generic chat filler.
- continuity/thread awareness: Deep uses open loops, recurring topics, questions to revisit, or recent turns.
- non-generic insight: Deep avoids empty chatbot phrasing and gives enough substance to inspect.
- useful pushback: when asked, Deep names the unresolved edge without guilt or diagnosis.
- steering compliance: banned phrases and user steering are respected.
- distinct voice: Deep carries a Raw Lab voice/style signal.
- containment: no fake consciousness, no automatic memory-save claim, no board/context claim.
- hangout mode: no productivity push when the user asks to just hang out.

The paired comparison also checks that Deep is not merely longer than Fast. Deep must add synthesis, specificity, or continuity signals.

## How To Run

From `services/ai-gateway`:

```powershell
$env:SCOUT_PROVIDER="mock"
python -m app.raw_lab_meaningfulness_bench
```

The report prints:

```text
fixture | fast | deep | comparison | key heuristic failures
```

## How To Interpret Results

If Deep consistently beats Fast while containment stays green, Raw Lab is ready for dogfooding or durable memory proposal work.

If containment stays green but Deep feels generic or fails the meaningfulness comparison, prefer prompt tuning or model/runtime improvement before adding memory.

If Deep is specific but uneven across cases, the next useful slice is likely a Raw Lab Deep multi-pass critic.

For human A770 dogfooding, pair this mock-safe bench with [`raw-lab-emergence-review-pack.md`](raw-lab-emergence-review-pack.md). The review pack captures qualitative emergence signals that deterministic heuristics should not try to over-prescribe.
