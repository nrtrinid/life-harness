# Requirements Document: UX-First Redesign

## Introduction

Life Harness / Momentum Board currently has strong product mechanics (active limits, warmth, proof shelf, recovery systems) but suffers from feature-first information architecture. The UX audit identified critical issues: Today screen lacks a single obvious next action, navigation is overloaded with 11 peer items, Quick Capture is buried, and the career workflow is fragmented across multiple screens.

This UX-first redesign shifts the application from feature discovery to user journey optimization. The goal is to restore the core product promise: "Open app → know what matters → take one small useful action → log proof → recover when stuck" all within 10 seconds on first open.

The redesign preserves all existing product mechanics (active limit, warmth, proof shelf, recovery systems) while reorganizing information architecture, visual hierarchy, and navigation to prioritize the momentum board mental model over career scout tooling.

## Glossary

- **Today_Screen**: The daily command surface that answers "what matters and what to do next"
- **Primary_Action**: The single most important user action recommended for the current session
- **Navigation_System**: The top-level wayfinding interface for accessing app screens
- **Quick_Capture**: The one-sentence input mechanism for logging actions and capturing ideas
- **Career_Hub**: A unified screen grouping all career-related flows (intake, queue, sources, resume bank)
- **Recovery_Systems**: Minimum Viable Day and Salvage Mode features that help users recover from setbacks
- **Briefing**: The While You Were Away section that surfaces state changes and recommendations
- **Pounce_Mission**: Today's primary recommended action, determined by rules or briefing logic
- **Information_Architecture**: The organization and structure of screens, navigation, and content hierarchy
- **Visual_Hierarchy**: The deliberate arrangement of UI elements to guide user attention toward primary actions
- **User_Journey**: A sequence of interactions a user performs to accomplish a goal

## Requirements

### Requirement 1: Single Obvious Next Action on Today Screen

**User Story:** As a user opening the app for the first time today, I want to immediately see one clear recommended action, so that I can start without reading multiple sections or choosing among competing options.

#### Acceptance Criteria

1. WHEN the user opens the Today screen, THE Today_Screen SHALL display a single Primary_Action above the fold on viewports ≥375px wide
2. THE Primary_Action SHALL include the recommended action text, one primary button, and the smallest start hint without requiring scrolling
3. THE Primary_Action SHALL be visually distinct from all secondary links through size, color, or position
4. WHEN the briefing logic generates a suggested pounce, THE Today_Screen SHALL display that suggestion as the Primary_Action headline
5. WHEN the user completes the Primary_Action, THE Today_Screen SHALL update to show the next recommended action or completion state

### Requirement 2: Consolidated Navigation Structure

**User Story:** As a user navigating the app, I want to see no more than 5 top-level navigation items, so that I can form a clear mental model and find features quickly.

#### Acceptance Criteria

1. THE Navigation_System SHALL display no more than 5 primary navigation items
2. THE Navigation_System SHALL include Today, Board, Career, and Progress as primary items
3. WHERE career-related features exist, THE Navigation_System SHALL group Intake, Paste, Queue, Resume Bank, Job Sources, and Source Setup under a single Career item
4. THE Navigation_System SHALL place Ask Harness Dev in a secondary menu or settings area, not in primary navigation
5. THE Navigation_System SHALL render all primary items without wrapping on viewports ≥390px wide

### Requirement 3: Quick Capture Prominence

**User Story:** As a user wanting to log an action or capture an idea, I want the capture input to be immediately accessible and visually prominent, so that I can complete the capture in under 5 seconds.

#### Acceptance Criteria

1. THE Quick_Capture SHALL be visible on the Today screen without scrolling on viewports ≥375px tall
2. THE Quick_Capture submit button SHALL use primary action styling, not secondary styling
3. THE Quick_Capture input label SHALL read "Capture" or "Quick Capture", not "Report"
4. WHEN the user submits a capture, THE Quick_Capture SHALL display a success notice stating the destination (e.g., "Added to Inbox: …" or "Logged Build win")
5. THE Quick_Capture SHALL provide inline examples or hints for parse patterns when the input is focused

### Requirement 4: Unified Career Pipeline View

**User Story:** As a user managing job search activities, I want to see all career stages (candidates, applications, follow-ups, sources) in one unified screen, so that I can understand my job search pipeline without navigating multiple disconnected screens.

#### Acceptance Criteria

1. THE Career_Hub SHALL display candidate queue, application cards (Active/Waiting), follow-up actions, and job sources in a single unified view
2. THE Career_Hub SHALL provide clear intake paths with explicit choice between "Quick apply card" and "Review in queue first"
3. WHEN the user accesses career features from navigation, THE Navigation_System SHALL route to the Career_Hub, not to separate Intake/Paste/Queue screens
4. THE Career_Hub SHALL link to Resume Bank and Source Setup as secondary actions within the hub
5. THE Career_Hub SHALL display the current state of each pipeline stage (e.g., "3 candidates pending review", "2 applications waiting for response")

### Requirement 5: Recovery Systems Discoverability

**User Story:** As a user who feels behind or stuck during the day, I want to access recovery options quickly from the briefing or early on Today, so that I can salvage momentum without scrolling to the bottom of the page.

#### Acceptance Criteria

1. WHEN the Briefing generates a salvage suggestion, THE Today_Screen SHALL display a Salvage chip or link in the Primary_Action area or immediately below the Briefing
2. THE Recovery_Systems section SHALL display the current Minimum Viable Day completion state (e.g., "0/4 done") without requiring expansion
3. WHEN the time is after 6 PM and Minimum Viable Day is incomplete, THE Today_Screen SHALL surface MVD prominently near the top of the screen
4. THE Salvage_Mode picker SHALL be reachable in one tap from the first screenful when salvage is recommended by briefing logic
5. WHILE the user is in recovery mode (MVD or Salvage active), THE Today_Screen SHALL de-emphasize secondary content to reduce overwhelm

### Requirement 6: Briefing and Pounce Mission Synchronization

**User Story:** As a user reading the briefing and pounce mission, I want them to present a single consistent recommendation, so that I do not receive conflicting "what to do" signals.

#### Acceptance Criteria

1. THE Briefing SHALL compute the recommended pounce mission using the same logic source as the displayed Pounce_Mission
2. WHEN the Briefing generates a suggested pounce, THE Pounce_Mission headline SHALL match the top briefing suggestion
3. THE Pounce_Mission smallest start text SHALL update dynamically when the Briefing suggestion changes
4. THE Today_Screen SHALL NOT display static seed data for Pounce_Mission when dynamic briefing logic produces a different recommendation
5. WHEN the user completes a pounce session, THE Briefing SHALL update on next Today screen load to reflect the completion

### Requirement 7: Progress Screen Prioritization

**User Story:** As a user checking my progress, I want to see proof of momentum and weekly wins first, so that I can feel progress before encountering operator dashboards or developer tools.

#### Acceptance Criteria

1. THE Progress screen SHALL display Proof Shelf as the first section
2. THE Progress screen SHALL display Weekly XP summary as the second section
3. THE Progress screen SHALL display career momentum stats (applications sent, follow-ups completed) before job scout source stats
4. THE Progress screen SHALL place export/import/reset and use-before-improve locks in a collapsed "Advanced / Local Data" section by default
5. THE Progress screen SHALL NOT front-load job scout foundation metrics (approved source fetching, runner status) in the first screenful

### Requirement 8: Pounce Completion Semantics Clarity

**User Story:** As a user tapping the Pounce button, I want to clearly understand whether I am starting the mission or marking it complete, so that I know what action is expected next.

#### Acceptance Criteria

1. THE Pounce button label SHALL read "Start Pounce" or similar initiation language, not just "Pounce"
2. WHEN the user taps the Pounce button, THE Today_Screen SHALL display an inline proof card or persistent notice showing the "Started career pounce" proof item
3. THE Today_Screen SHALL provide a separate "Log pounce complete" or "Done with pounce" action after pounce initiation
4. THE Pounce button help text SHALL explain that pouncing logs the start of the mission, not its completion
5. WHEN the user starts a pounce, THE Today_Screen SHALL suggest the next step (e.g., "Next: Open Candidate Queue" with deep link)

### Requirement 9: Log and Proof Distinction

**User Story:** As a user reviewing my history, I want to clearly understand the difference between the raw Log and the curated Proof Shelf, so that I know which view to trust for evidence of progress.

#### Acceptance Criteria

1. THE Progress screen SHALL include a one-sentence explanation distinguishing Proof (curated evidence) from Log (raw append-only history)
2. THE Navigation_System SHALL label the Log screen as "Debug / History" or similar developer-oriented language
3. THE Navigation_System SHALL NOT include Log as a primary navigation item for standard user mode
4. WHEN the user views the Proof Shelf, THE Progress screen SHALL provide a secondary link to the Log labeled "View raw history" in an advanced tools area
5. THE Log screen introduction copy SHALL explain that it is an audit trail, while Proof is the user-facing evidence view

### Requirement 10: Card Detail Progressive Disclosure

**User Story:** As a user opening a card to resume work, I want to see the most important re-entry information first, so that I can act without scrolling through many sections.

#### Acceptance Criteria

1. THE Card_Detail screen SHALL display Next Tiny Action and the "Resume" panel in the first screenful on viewports ≥667px tall
2. THE Card_Detail screen SHALL collapse Trigger Plan, Obstacle Plan, and Optimization Parking Lot sections by default
3. THE Card_Detail meta line SHALL display human-readable state labels (e.g., "Waiting" not "waiting")
4. THE Card_Detail screen SHALL provide a "Quick capture for this card" input near the top for logging progress without scrolling
5. THE Card_Detail screen SHALL group Do lane and Improve lane together in a single expanded "Work Lanes" section

### Requirement 11: Ephemeral Notice Duration for Proof Events

**User Story:** As a user completing a proof-generating action, I want to see visible evidence of the reward on screen long enough to recognize it, so that I feel motivated by the feedback.

#### Acceptance Criteria

1. WHEN a user action generates a proof item, THE Notice system SHALL display the notice for at least 6 seconds
2. WHEN a user action generates XP, THE Notice system SHALL include the XP amount and the proof suffix in the notice text
3. THE Today_Screen SHALL display a persistent "Last Win" chip or badge showing the most recent proof item until the next user action
4. WHEN the Proof Shelf receives a new item, THE Progress screen SHALL pulse or highlight the new item for 10 seconds on next view
5. THE Notice system SHALL remain visible until the user dismisses it or 10 seconds elapse, whichever comes first, for proof-generating actions

### Requirement 12: Job Sources Runner Prerequisite Visibility

**User Story:** As a user attempting to run job sources from Today or the Sources screen, I want to see a clear warning if the runner is unavailable, so that I understand why the action fails and how to fix it.

#### Acceptance Criteria

1. WHEN the job scout runner is unreachable, THE Today_Screen SHALL display a banner explaining the runner prerequisite before rendering "Run Due Job Sources" links
2. WHEN the job scout runner is unreachable, THE Job_Sources screen SHALL display an actionable prerequisite banner with a link to setup instructions
3. THE prerequisite banner SHALL provide the command to start the runner (e.g., "Run `npm run scout:runner` in a separate terminal")
4. THE Job_Sources screen SHALL check runner health on load and update the prerequisite banner status dynamically
5. WHEN the runner becomes available, THE prerequisite banner SHALL dismiss or update to show "Runner active"

### Requirement 13: Board Column Scroll Discoverability

**User Story:** As a user viewing the Board screen, I want to easily discover that I can scroll sideways to see Parked, Waiting, and Done columns, so that I do not miss hidden cards.

#### Acceptance Criteria

1. THE Board screen help text SHALL read "Scroll sideways to see more columns" not "Swipe sideways"
2. THE Board screen SHALL display a visible scroll hint (e.g., fade gradient, arrow, or partial column peek) indicating additional columns exist off-screen
3. WHEN the user reaches the rightmost visible column, THE Board screen SHALL show a visual indicator (e.g., end-of-scroll shadow or icon)
4. THE Board screen SHALL support horizontal scrolling via mouse wheel, trackpad, or touch gestures
5. THE Board screen SHALL scroll smoothly to the next column when the user taps a directional arrow or column tab, if tabs are implemented

### Requirement 14: Accessibility - Minimum Touch Targets and Screen Reader Support

**User Story:** As a user navigating with touch or assistive technology, I want all interactive elements to meet accessibility standards, so that I can use the app comfortably and effectively.

#### Acceptance Criteria

1. THE Navigation_System buttons SHALL provide a minimum touch target size of 44×44 CSS pixels
2. THE Primary_Action buttons on Today SHALL provide a minimum touch target size of 44×44 CSS pixels
3. THE Navigation_System items SHALL include `accessibilityLabel` properties describing their purpose
4. THE Today_Screen section headings SHALL use `accessibilityRole="header"` to announce structural hierarchy to screen readers
5. THE Quick_Capture input and submit button SHALL include `accessibilityHint` properties explaining their function

