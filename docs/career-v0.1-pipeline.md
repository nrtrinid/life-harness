# Career v0.1 Pipeline

Career v0.1 is a rules-only pipeline for turning one found role into one safer application artifact:

```text
source run -> candidates -> application card -> resume draft packet -> readiness check -> DOCX export
```

The pipeline is meant to create useful pressure without turning career work into automation theater. It helps answer:

```text
What did we find?
Is it worth reviewing?
What application card exists?
Is the selected resume evidence safe enough?
What is the next tiny resume patch?
Can I export and manually review the DOCX?
```

## Flow

1. Approved sources or pasted postings create Job Candidates.
2. Candidate review scores fit, shows gaps, and suggests Resume Bank modules.
3. Approving a candidate creates an Application Card in Inbox with the candidate link and a resume draft packet.
4. Resume Bank modules provide structured sections, headings, dates, bullets, skills, proof, and role fit tags.
5. Career Source Pack import can add modules, role recipes, claims cautions, and metrics-to-gather from local source material.
6. Resume Readiness / Hardening validates the Application Card deterministically.
7. DOCX export builds from the selected modules only when readiness is not blocked.

## Career Source Pack Privacy

Career Source Packs are local, user-provided source material. The app paste-imports the JSON into local state and does not upload it to a provider. Import validation rejects secret-like content and warns on likely contact details or PII-shaped fields so private source files stay private.

Keep real source packs outside the repo, such as in a local `resume_pack/` folder. Commit only fixtures or sanitized examples.

## Resume Draft Packets

Resume Draft Packets are snapshots of the application angle and selected Resume Bank module IDs at the moment a Job Candidate becomes an Application Card.

They store stable metadata:

- source candidate ID
- company and role title
- resume angle
- selected module IDs
- section coverage
- missing evidence notes
- one next tiny resume action

They do not duplicate generated resume prose inside the Application Card. The Resume Bank remains the source of truth for module content, and the user manually edits or approves that source material before export.

## Resume Readiness / Hardening

The readiness panel is deterministic validation only. It is a validator and guide, not a writer.

It checks:

- selected modules by section: Education, Skills, Projects, Additional Experience
- missing selected modules
- missing critical section coverage
- missing dates
- missing bullets or skills
- missing proof
- missing metrics
- claims cautions
- weak role fit when imported role recipe data supports it

Readiness status:

- `blocked`: no resume draft packet, no selected modules, or no selected modules available
- `needs_patch`: usable structure exists but one or more hardening warnings remain
- `ready_to_export`: no readiness warnings

Export rules:

- blocked cards cannot export DOCX
- structural gaps such as missing dates, bullets, or critical sections disable export
- proof, metrics, claims, and role-fit cautions keep the card patch-worthy but may still export for manual review

The next tiny resume action follows a stable priority:

```text
draft packet -> selected module -> section coverage -> date -> bullet/proof -> claims -> metrics -> export
```

## DOCX Export Gate

DOCX export is gated by structural readiness:

- no draft packet, no selected modules, or unavailable selected modules block export
- missing Education, Skills, or Projects coverage blocks export
- missing required dates, bullets, or skills blocks export
- proof, metrics, claims, and role-fit cautions can leave the resume in `needs_patch` while still allowing export for manual review

The boundary is:

```text
rules validate -> user edits/approves -> rules export -> user manually reviews/sends
```

## Non-goals

Career v0.1 does not add:

- AI rewriting
- automatic applications
- external job scraping beyond approved/manual source runs
- scraping expansion in this pass
- external account automation
- email integration
- calendar integration
- cloud sync
- Supabase
- auth
- new Raw Lab behavior
- app-side local model provider binding

All career workflow behavior remains local and deterministic unless an explicit future ticket changes that.
