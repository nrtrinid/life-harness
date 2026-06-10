# Changelog

All notable changes to Life Harness / Momentum Board are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning tracks the app package (`package.json`) and feature-slice milestones (`v0.2` … `v0.11` in docs).

## How to update this file

When you ship a user-visible slice or merge a meaningful batch:

1. Add bullets under **`[Unreleased]`** while work is in progress.
2. On a milestone cut (or when you tag `v0.1.x`), move items into a dated version section.
3. Group by **Added**, **Changed**, **Fixed**, **Deprecated**, **Removed** — skip empty sections.
4. Link slice docs when they exist (`docs/job-scout-*-v0.*.md`, `docs/ask-harness-v0.1.md`, etc.).

## [Unreleased]

### Added

- Documentation index [`docs/README.md`](docs/README.md), [`docs/ask-harness-v0.1.md`](docs/ask-harness-v0.1.md), [`docs/career-hub-v0.1.md`](docs/career-hub-v0.1.md), [`docs/local-ai-agent-guide.md`](docs/local-ai-agent-guide.md)
- Repo meta docs: [`CHANGELOG.md`](CHANGELOG.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- Local AI planning docs under [`docs/plans/`](docs/plans/) (model slots, context packets, deep synthesis, evals)
- Gateway prototype expansions (in progress): model slots, context packet builder, deep synthesis jobs, critic pass, expanded eval suites — see [`services/ai-gateway/README.md`](services/ai-gateway/README.md)

### Changed

- Documentation freshness pass: foundational docs (`00`–`11`) aligned with current implementation; historical banners on stale artifacts
- Ask nav label standardized to **Ask** in docs (page header may still say "Ask Harness Dev")

## [0.1.0] — 2026-06

First dogfood-ready prototype: rules-only core loop plus career slice, Job Scout, optional local AI bridge.

### Added — Core board (tickets 001–010)

- Expo app: Today, Board, Progress, Log, Card Detail, Review
- While You Were Away briefing, Pounce, Minimum Viable Day, Salvage Mode
- Quick Capture rule-based parser, Proof Shelf, Momentum Warmth, active limit (3)
- Seed data and core TypeScript model

### Added — Career Command Board

- Career-first seed and application cards ([`docs/career-command-board-v0.1.md`](docs/career-command-board-v0.1.md))
- Career hub with pipeline chips and Fit Finder ([`docs/career-hub-v0.1.md`](docs/career-hub-v0.1.md))
- Grouped navigation: Primary / Career Tools / System
- Primary action block on Today (`computePrimaryAction`)

### Added — Job Scout (v0.2–v0.11)

- Resume bank, candidate queue, manual intake (v0.2)
- Approved-source fetching (v0.3)
- Local `job-scout-runner` service on port 8122 (v0.4)
- Web JSON snapshot persistence (v0.5)
- Run due / run all batch sources (v0.6)
- Source Setup screen with adapter detect (v0.7)
- GovernmentJobs adapter (v0.8)
- Workday adapter, endpoint capture, pagination & health (v0.9–v0.11)

### Added — Optional local AI bridge

- `services/ai-gateway`: mock + OpenVINO providers, transcript analysis
- Ask Harness sandbox → Chat Harness conversational endpoint
- Ask screen (board context export), Raw Lab sandbox
- Thread intelligence: `conversation_history`, `thread_state`, verifier
- Conversation summary memory and Memory Bank ([`docs/memory-bank-v0.1.md`](docs/memory-bank-v0.1.md))
- Reasoning depth (`fast` / `deliberate` / `deep`) on Chat Harness

### Changed

- UX-first nav redesign: career tools grouped; Ask in Primary nav
- Raw Lab prompt tuning and hedging-repair pass on OpenVINO path

### Fixed

- Dev CORS for Ask Harness web client
- Workday pagination and source health reporting

## Earlier / pre-0.1.0

- Phase 0 AI gateway scaffold, evaluation harness, A770 OpenVINO smoke path — see [`docs/local-a770-plan.md`](docs/local-a770-plan.md)
