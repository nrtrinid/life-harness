# Nick Trinidad Career Source Repo

Private Markdown source repo for building targeted resumes, project bullets, LinkedIn/GitHub profile copy, cover-letter fragments, and interview stories.

This is not meant to be submitted as-is. Treat this repo like resume source code: keep the complete material here, then compile a clean one-page PDF/DOCX for each job.

## Current positioning

Recent B.S. Computer Science graduate with a cybersecurity emphasis, U.S. Citizen eligible for security clearance, and hands-on experience building full-stack, security-aware, AI-assisted, data/analytics, and diagnostics-heavy software systems.

Strongest current story:

1. **EV Tracker** - live-market analytics, FastAPI/Next.js/Supabase, production deployment, API integration, auth, diagnostics, beta operations.
2. **The Charter / AI Simulation & Diagnostics Lab** - Python simulation, deterministic testing, Textual UI, Pydantic/YAML, AI/balance analysis, reproducible diagnostics.
3. **Network Security Lab** - pwn.college, binary exploitation, reverse engineering, packet analysis, web/network vulnerabilities.
4. **AuditWiseAI** - risk scoring, RBAC, audit logging, OpenAI-powered triage.

## How to use this repo

1. Pick a role target in `roles/`.
2. Copy the suggested summary, skills, project order, and bullets.
3. Paste into the existing DOCX resume template to preserve formatting.
4. Keep the submitted resume to one page unless a role explicitly wants a longer CV/project history.
5. Before sending, run the checklist in `notes/job_tailoring_checklist.md`.

## File map

```text
.
├── README.md
├── AGENTS.md
├── MASTER_RESUME.md
├── CHANGELOG.md
├── source_inventory.md
├── source_material/
│   ├── ev_tracker_detailed_source.md
│   ├── ev_tracker_chat_resume_angles.txt
│   └── the_charter_detailed_source.md
├── projects/
│   ├── ev_tracker.md
│   ├── the_charter_ai_lab.md
│   ├── network_security_lab.md
│   ├── auditwiseai.md
│   ├── javafx_secure_user_management.md
│   ├── c_phone_directory.md
│   └── cpp_modular_text_adventure.md
├── roles/
│   ├── general_swe.md
│   ├── full_stack_backend.md
│   ├── cyber_defense.md
│   ├── ai_tooling_simulation.md
│   ├── finance_backend_data.md
│   ├── systems_low_level.md
│   └── public_sector_it.md
├── resumes/
│   ├── general_updated_resume.md
│   ├── cyber_defense_resume.md
│   ├── ai_tooling_resume.md
│   └── finance_backend_resume.md
├── bullet_banks/
│   ├── summaries_and_skills.md
│   ├── project_bullets.md
│   └── experience_activities.md
└── notes/
    ├── claims_to_avoid.md
    ├── metrics_to_gather.md
    ├── job_tailoring_checklist.md
    └── interview_story_bank.md
```

## Privacy warning

Keep this repo **private**. It contains personal contact details, resume strategy, and employment materials. Do not commit API keys, `.env` files, private production URLs, Discord webhooks, Supabase service-role keys, or screenshots that reveal secrets.

## Private repo setup

```powershell
cd C:\Users\nicki\Projects\Personal\career-source
git init
git add .
git commit -m "Initial commit: career source materials"
gh repo create career-source --private --source=. --remote=origin --push
```

If you already created the empty private repo on GitHub, replace the last line with:

```powershell
git remote add origin https://github.com/<your-username>/career-source.git
git branch -M main
git push -u origin main
```

## Best default resume formula

```text
Header
Summary / Technical Profile: 2 lines max
Education: compact
Technical Skills: 4 compact lines
Projects: 3 main projects, 6-9 total bullets
Additional Experience & Activities: 1-2 compact bullets
```

Best general project order:

```text
1. EV Tracker
2. AI Simulation & Diagnostics Lab / The Charter
3. Network Security Lab
4. AuditWiseAI as a one-bullet optional fourth project when space allows
```
