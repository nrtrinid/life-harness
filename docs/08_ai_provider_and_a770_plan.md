# 08 - AI Provider and Intel Arc A770 Plan

## Core principle

Do not make local AI or the Intel Arc A770 the foundation of v0.1.

The app should work in this order:

```text
rules-only -> cloud AI optional -> local A770 provider optional -> full operator layer later
```

## Why

The product's first value is not AI. It is the executive-function board:

```text
Today screen
Active / Parked board
Pounce Mission
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
While You Were Away
```

These should all work without any LLM.

## A770 role

The Intel Arc A770 is useful later as a private local AI provider for lightweight operator tasks.

Good future uses:

```text
log classification
short summaries
card resume packets
pounce suggestions
weekly review drafts
private reflections
small RAG over Life Harness data
local embeddings
experimentation with quantized small/medium models
```

Not ideal as the foundation for:

```text
giant coding-agent workflows
large context reasoning
heavy multi-agent orchestration
replacing top cloud models
always-on Jarvis behavior
```

## AI Gateway architecture

```text
Life Harness App
  -> Core API / data layer
  -> AI Gateway
      -> rules provider
      -> cloud provider
      -> local A770 provider
      -> disabled/no-AI provider
```

The app should call task-level endpoints, not model-specific endpoints:

```text
POST /ai/classify-log
POST /ai/suggest-pounce
POST /ai/summarize-card
POST /ai/generate-briefing
POST /ai/create-resume-packet
POST /ai/detect-scope-creep
POST /ai/weekly-review
```

## Provider interface sketch

```ts
type AIProvider =
  | "none"
  | "rules"
  | "cloud_openai"
  | "cloud_groq"
  | "cloud_anthropic"
  | "local_openvino"
  | "local_llamacpp_sycl"
  | "local_ipex_llm";

type AITask =
  | "classify_log"
  | "suggest_pounce"
  | "summarize_card"
  | "generate_briefing"
  | "create_resume_packet"
  | "detect_scope_creep"
  | "weekly_review";
```

## Sensitivity levels

Every future AI call should check sensitivity.

```text
S0 - safe / boring
Cloud AI allowed if enabled.

S1 - personal but okay
Cloud AI allowed if enabled.

S2 - sensitive
Local AI preferred.

S3 - never send to AI
Rules-only or manual only.
```

Examples:

```text
Text RPG implementation note -> S0/S1
EV Tracker project note -> S1
Career application details -> S1/S2
Money/vice logs -> S2
Therapy/reflection notes -> S3 default
```

## Phases

### v0.1 - no AI

```text
rules-only behavior
local seed data
no provider integration
AI provider interface can be documented but not implemented
```

### v0.2 - stronger rules

```text
rule-based classification
computed warmth
computed briefings
dormant detection
use-before-improve locks
weekly review stub
```

### v0.3 - cloud AI optional

```text
classification
summaries
pounce suggestions
scope creep detection
resume packet drafts
weekly review drafts
```

### v0.4 - local A770 gateway

Desktop service:

```text
life-ai-gateway
  /health
  /classify-log
  /summarize-card
  /suggest-pounce
  /generate-briefing
```

Providers to experiment with later:

```text
OpenVINO
llama.cpp SYCL
IPEX-LLM
other Intel-compatible runtime
```

### v1.0 - operator layer

```text
background jobs
approval queue
drafts
integrations
GitHub
calendar
career repo
spending
fitness
local/cloud routing
```

## AI rule

The system can prepare. The user approves.

Do not allow AI to automatically:

```text
send messages
submit applications
spend money
execute trades
delete cards
make commitments
change important files
```

## Final recommendation

The A770 is enough to justify designing for local AI later, but not enough to justify blocking v0.1 on local model setup.

Best path:

```text
1. Build the cross-platform app.
2. Make rules-only Life Harness useful.
3. Add AI provider abstraction early in docs/core.
4. Add sensitivity levels early.
5. Use cloud AI only for non-sensitive high-value tasks later.
6. Add A770 local gateway later for private lightweight operator tasks.
```
