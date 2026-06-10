# Implementation Plan: UX-First Redesign

## Overview

This implementation plan transforms Life Harness from feature-first to journey-first information architecture while preserving all existing product mechanics. The redesign implements the core product promise: "Open app → know what matters → take one small useful action → log proof → recover when stuck" — all within 10 seconds on first open.

The implementation follows a 4-phase approach: (1) Helper Functions, (2) Components in Isolation, (3) Screen Refactoring, (4) Polish & Accessibility.

## Tasks

### Phase 1: Helper Functions and Data Models

- [x] 1.1 Create derived state computation helpers
  - Create `src/core/primaryAction.ts` with `computePrimaryAction()` function
  - Create `src/core/careerPipeline.ts` with `buildCareerPipelineState()` function
  - Create `src/core/recovery.ts` with `computeRecoveryVisibility()` function
  - Add new TypeScript types (`PrimaryAction`, `CareerPipelineState`, `RecoveryVisibility`) to `src/core/types.ts`
  - _Requirements: 1.1, 1.2, 4.1, 5.1, 6.1, 6.2_

- [ ]* 1.2 Write unit tests for helper functions
  - Write tests for `computePrimaryAction()` covering pounce actions, deep links, and fallback cases
  - Write tests for `buildCareerPipelineState()` covering candidate counting, application separation, follow-up identification
  - Write tests for `computeRecoveryVisibility()` covering salvage suggestions, MVD timing, and promotion logic
  - Target 100% branch coverage for all three helpers
  - _Requirements: 1.1, 4.1, 5.1, 6.1_

- [-] 1.3 Checkpoint - Verify helper functions
  - Run `npm run typecheck` to verify TypeScript compilation
  - Run `npm run test` to verify all tests pass
  - Ensure no UI changes are visible (helpers only)

### Phase 2: Components in Isolation

- [~] 2.1 Create PrimaryActionHero component
  - Create `src/components/PrimaryActionHero.tsx` with props: `actionText`, `buttonLabel`, `smallestStart`, `targetRoute`, `onPress`, `isPounceAction`, `disabled`
  - Implement brass left border (4px), primary button styling, 44×44 minimum touch target
  - Add `accessibilityLabel` and `accessibilityRole` for screen reader support
  - _Requirements: 1.1, 1.2, 1.3, 14.2, 14.3_

- [ ]* 2.2 Write component tests for PrimaryActionHero
  - Test rendering with various prop combinations
  - Test button press handling
  - Test disabled state behavior
  - Test accessibility properties
  - _Requirements: 1.1, 14.2_

- [~] 2.3 Create ConsolidatedNav component
  - Create `src/components/ConsolidatedNav.tsx` with 5 primary nav items: Today, Board, Career, Progress, More
  - Implement 44×44 minimum touch targets for all nav items
  - Add `accessibilityLabel`, `accessibilityRole="tab"`, and `accessibilityState.selected` for active route
  - Support horizontal layout without wrapping on viewports ≥390px
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 14.1, 14.3_

- [ ]* 2.4 Write component tests for ConsolidatedNav
  - Test rendering of 5 primary nav items
  - Test active route highlighting
  - Test minimum touch target sizes
  - Test accessibility labels and roles
  - _Requirements: 2.1, 14.1, 14.3_

- [~] 2.5 Create QuickCaptureBar component
  - Create `src/components/QuickCaptureBar.tsx` with primary action button styling
  - Change label from "Report" to "CAPTURE"
  - Add parse pattern hint expansion on focus (optional `showExamples` prop)
  - Support variant prop: `'sticky-top' | 'sticky-bottom' | 'inline-prominent'`
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ]* 2.6 Write component tests for QuickCaptureBar
  - Test CAPTURE label rendering
  - Test primary action button styling
  - Test onNotice callback on submit
  - Test parse pattern hints when showExamples is true
  - _Requirements: 3.1, 3.2, 3.5_

- [~] 2.7 Create CareerPipelineOverview component
  - Create `src/components/CareerPipelineOverview.tsx` displaying pipeline stages: candidates waiting, active applications, waiting applications, follow-ups due, due sources
  - Implement horizontal card layout with stage name, count, and status icon
  - Add brass accent border for stages with pending action
  - Make cards tappable to navigate to relevant Career Hub section
  - _Requirements: 4.1, 4.2, 4.5_

- [ ]* 2.8 Write component tests for CareerPipelineOverview
  - Test rendering of all pipeline stages
  - Test count display for each stage
  - Test navigation on card tap
  - Test empty state rendering
  - _Requirements: 4.1, 4.5_

- [~] 2.9 Create RecoveryPanel component
  - Create `src/components/RecoveryPanel.tsx` composing MVD checklist and Salvage picker
  - Implement conditional rendering based on `showSalvage` and `showMvd` props
  - Display MVD completion state (e.g., "2/4 done") without requiring expansion
  - Add brass warning border (3px left border)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 2.10 Write component tests for RecoveryPanel
  - Test conditional rendering based on showSalvage/showMvd
  - Test MVD progress display
  - Test salvage picker interaction
  - Test that panel returns null when both flags are false
  - _Requirements: 5.1, 5.5_

- [~] 2.11 Enhance Notice component with extended duration
  - Modify `src/components/Notice.tsx` to accept `duration` and `proofGenerated` props
  - Extend default 3s duration to 10s when `proofGenerated` is true
  - Add `persistent` prop to require manual dismiss
  - Add pulse animation when `proofGenerated` is true
  - _Requirements: 11.1, 11.2, 11.3, 11.5_

- [ ]* 2.12 Write component tests for Notice enhancements
  - Test duration override (3s default, 10s for proof)
  - Test persistent notice behavior
  - Test pulse animation trigger
  - Test dismiss button functionality
  - _Requirements: 11.1, 11.5_

- [~] 2.13 Create PounceCompletionFlow component
  - Create `src/components/PounceCompletionFlow.tsx` separating pounce start from completion
  - Implement two states: "Start Pounce" button (before start), "Log Mission Complete" button + proof card (after start)
  - Add next step hint with deep link after pounce start
  - Display inline proof card showing "Started career pounce" with timestamp after start
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 2.14 Write component tests for PounceCompletionFlow
  - Test "Start Pounce" button rendering before start
  - Test state transition after pounce start
  - Test "Log Mission Complete" button rendering after start
  - Test proof card display with timestamp
  - Test next step hint rendering
  - _Requirements: 8.1, 8.2, 8.5_

- [~] 2.15 Checkpoint - Verify components in isolation
  - Run `npm run typecheck` to verify TypeScript compilation
  - Run `npm run test` to verify all component tests pass
  - Ensure no existing screens are modified yet

### Phase 3: Screen Refactoring

- [~] 3.1 Refactor Today screen
  - Modify `app/index.tsx` to use ConsolidatedNav instead of Nav
  - Add PrimaryActionHero at top using `computePrimaryAction()` helper
  - Replace QuickCapture with QuickCaptureBar, position prominently after briefing
  - Add RecoveryPanel conditional render after PrimaryActionHero using `computeRecoveryVisibility()` helper
  - Collapse "Active Cards Summary" by default (add expand toggle)
  - Keep Proof Shelf preview at bottom
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 5.1, 5.2, 5.4_

- [ ]* 3.2 Write integration tests for Today screen
  - Test PrimaryActionHero renders above briefing
  - Test RecoveryPanel renders when salvage suggested
  - Test RecoveryPanel does not render at bottom when promoted
  - Test QuickCaptureBar prominence and visibility
  - _Requirements: 1.1, 3.1, 5.1_

- [~] 3.3 Update navigation and layout
  - Modify `app/_layout.tsx` to use ConsolidatedNav
  - Add new routes: `/career-hub` and `/more`
  - Keep all existing routes for backward compatibility
  - Update Nav.tsx or create ConsolidatedNav.tsx as primary navigation component
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [~] 3.4 Create Career Hub screen
  - Create new `app/career-hub.tsx` with unified career pipeline view
  - Integrate CareerPipelineOverview at top
  - Integrate candidate queue logic from `job-candidates.tsx` (candidates waiting section)
  - Display active and waiting applications (filtered cards with `careerApplication`)
  - Display follow-ups due section
  - Add links to Resume Bank and Job Sources (not embedded)
  - Implement section navigation via deep links (e.g., `/career-hub?section=candidates`)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 3.5 Write integration tests for Career Hub
  - Test pipeline overview renders all stages
  - Test navigation to candidates section
  - Test empty state rendering
  - Test active applications display
  - Test follow-ups display
  - _Requirements: 4.1, 4.5_

- [~] 3.6 Create More menu screen
  - Create new `app/more.tsx` with secondary navigation items
  - Add links to: Log, Ask Harness Dev, Memory Bank, Advanced Data Tools
  - Demote Log from primary nav to secondary menu
  - Add "Developer Tools" section for Ask Harness Dev
  - _Requirements: 2.2, 2.4, 9.2, 9.3_

- [~] 3.7 Refactor Progress screen
  - Modify `app/progress.tsx` to reorder sections: ProofShelf → WeeklyXP → CareerMomentum → Warmth
  - Add one-sentence explanation distinguishing Proof (curated evidence) from Log (raw history) at top
  - Move export/import/reset and use-before-improve locks into collapsed "Advanced / Local Data" accordion
  - Add secondary link to Log labeled "View raw history" in advanced tools area
  - Place job scout foundation metrics in Advanced section
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.4_

- [ ]* 3.8 Write integration tests for Progress screen
  - Test Proof Shelf appears first
  - Test Weekly XP appears second
  - Test Career Momentum appears before Warmth
  - Test Advanced section collapsed by default
  - Test Proof vs Log distinction explanation
  - _Requirements: 7.1, 7.2, 9.1_

- [~] 3.9 Refactor Card Detail screen
  - Modify `app/card/[id].tsx` to promote "Resume" panel to top
  - Display Next Tiny Action in first screenful
  - Add inline QuickCaptureBar for card-specific capture near top
  - Collapse Trigger Plan, Obstacle Plan, and Optimization Parking Lot sections by default
  - Group Do lane and Improve lane together in single "Work Lanes" section
  - Use human-readable state labels (e.g., "Waiting" not "waiting")
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 3.10 Write integration tests for Card Detail
  - Test Resume panel appears in first screenful
  - Test planning sections collapsed by default
  - Test card-specific quick capture rendering
  - Test Work Lanes section grouping
  - Test human-readable state labels
  - _Requirements: 10.1, 10.2, 10.4_

- [~] 3.11 Synchronize briefing and pounce mission
  - Modify `src/core/briefing.ts` to update `dailyState.pounceMission` and `dailyState.smallestStart` in `startSession()`
  - Ensure PrimaryActionHero always derives from briefing logic via `computePrimaryAction()`
  - Verify fallback to seed data when briefing computation fails
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 3.12 Write integration tests for briefing synchronization
  - Test dailyState.pounceMission updates from briefing on session start
  - Test PrimaryActionHero matches briefing suggestion
  - Test fallback to seed data when briefing is empty
  - Test pounce mission consistency across briefing and hero
  - _Requirements: 6.1, 6.2, 6.4_

- [~] 3.13 Checkpoint - Verify screen refactoring
  - Run `npm run typecheck` to verify TypeScript compilation
  - Run `npm run test` to verify all tests pass
  - Test each screen individually: Today, Career Hub, Progress, Card Detail
  - Verify all existing functionality still works (capture, pounce, state changes)

### Phase 4: Polish and Accessibility

- [~] 4.1 Audit and fix touch target sizes
  - Verify all ConsolidatedNav buttons meet 44×44 minimum
  - Verify PrimaryActionHero button meets 44×44 minimum
  - Verify QuickCaptureBar submit button meets 44×44 minimum
  - Verify Career Hub pipeline cards meet minimum touch targets
  - Fix any interactive elements below 44×44
  - _Requirements: 14.1, 14.2_

- [ ]* 4.2 Write accessibility compliance tests
  - Test ConsolidatedNav touch targets ≥44×44
  - Test PrimaryActionHero button touch target ≥44×44
  - Test all interactive elements have accessibilityLabel
  - Test section headings use accessibilityRole="header"
  - Test QuickCaptureBar has accessibilityHint
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [~] 4.3 Add and verify accessibility labels
  - Add `accessibilityLabel` to all Pressable components missing labels
  - Add `accessibilityRole="header"` to Today screen section headings
  - Add `accessibilityHint` to QuickCaptureBar input and submit button
  - Add `accessibilityState.selected` to active nav items
  - _Requirements: 14.3, 14.4, 14.5_

- [~] 4.4 Add Board scroll hint
  - Modify `app/board.tsx` to add visible scroll hint (fade gradient or partial column peek)
  - Update help text from "Swipe sideways" to "Scroll sideways to see more columns"
  - Add visual indicator when user reaches rightmost column (end-of-scroll shadow)
  - Ensure horizontal scrolling works via mouse wheel, trackpad, and touch
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [ ]* 4.5 Write tests for Board scroll discoverability
  - Test scroll hint visibility
  - Test help text reads "Scroll sideways"
  - Test end-of-scroll indicator
  - Test horizontal scroll support
  - _Requirements: 13.1, 13.2, 13.3_

- [~] 4.6 Implement pounce completion semantics
  - Update pounce button to read "Start Pounce" instead of just "Pounce"
  - Display inline proof card showing "Started career pounce" after pounce initiation
  - Add separate "Log Mission Complete" button after pounce start
  - Add help text explaining pouncing logs start, not completion
  - Suggest next step after pounce start (e.g., "Next: Open Candidate Queue" with deep link)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 4.7 Write tests for pounce completion flow
  - Test "Start Pounce" button label
  - Test inline proof card display after start
  - Test separate completion button rendering
  - Test help text display
  - Test next step suggestion
  - _Requirements: 8.1, 8.2, 8.5_

- [~] 4.8 Implement extended notice duration for proof events
  - Update action handlers to pass `duration: 10000` when proof generated
  - Update notices to include XP amount and proof suffix
  - Add "Last Win" chip on Today screen showing most recent proof item
  - Add pulse/highlight effect on Proof Shelf when new item added
  - Ensure notice remains visible until dismissed or 10s elapses
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ]* 4.9 Write tests for notice duration
  - Test notice duration extends to 10s for proof-generating actions
  - Test XP amount included in notice text
  - Test "Last Win" chip persistence
  - Test Proof Shelf pulse on new item
  - Test manual dismiss functionality
  - _Requirements: 11.1, 11.2, 11.5_

- [~] 4.10 Add job sources runner prerequisite visibility
  - Add runner health check on Career Hub and Job Sources screen mount
  - Display banner when runner unreachable: "Job Scout Runner is offline. Start runner: `npm run scout:runner`"
  - Disable "Run Sources" buttons when runner is down
  - Add link to setup instructions in banner
  - Update banner to "Runner active" when runner becomes available
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]* 4.11 Write tests for runner prerequisite banner
  - Test banner display when runner unreachable
  - Test banner includes setup command
  - Test "Run Sources" buttons disabled when runner down
  - Test banner dismisses when runner available
  - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [~] 4.12 Manual testing with assistive technology
  - Test with iOS VoiceOver: verify nav labels, section headers, button descriptions
  - Test with Android TalkBack: verify nav labels, section headers, button descriptions
  - Test Today screen workflow: open → hear primary action → navigate to capture
  - Test Career Hub workflow: open → hear pipeline overview → navigate to candidates
  - Document any accessibility issues found
  - _Requirements: 14.3, 14.4, 14.5_

- [~] 4.13 Visual polish and refinements
  - Verify brass accent borders on PrimaryActionHero (4px left border)
  - Verify primary button styling (brass background, white text, uppercase)
  - Verify section spacing (12px gaps)
  - Verify touch target spacing (no overlapping tap areas)
  - Verify Progress screen section order: Proof → XP → Career → Warmth → Advanced
  - _Requirements: 1.3, 7.1, 7.2_

- [~] 4.14 Final checkpoint - End-to-end testing
  - Test complete Today screen workflow: open → see primary action → start pounce → log completion → see proof
  - Test complete Career Hub workflow: open → review pipeline → approve candidate → create card
  - Test recovery flow: trigger salvage → see early recovery panel → complete salvage
  - Run full test suite: `npm run test`
  - Run typecheck: `npm run typecheck`
  - Test on iOS simulator (iPhone 14, 390×844)
  - Test on Android emulator (Pixel 5, 393×851)
  - Verify no regressions in existing flows

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at phase boundaries
- Phase 1 and Phase 2 have no UI changes visible to users (foundation only)
- Phase 3 implements all visible UX changes
- Phase 4 focuses on accessibility, polish, and edge cases
- All existing product mechanics (active limit, warmth, proof shelf, recovery systems) are preserved
- No changes to data models or persistence format
- Implementation follows existing TypeScript/React Native patterns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.7", "2.9", "2.11", "2.13"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.6", "2.8", "2.10", "2.12", "2.14", "2.15"] },
    { "id": 4, "tasks": ["3.1", "3.3", "3.6"] },
    { "id": 5, "tasks": ["3.2", "3.4"] },
    { "id": 6, "tasks": ["3.5", "3.7", "3.9", "3.11"] },
    { "id": 7, "tasks": ["3.8", "3.10", "3.12", "3.13"] },
    { "id": 8, "tasks": ["4.1", "4.3", "4.4", "4.6", "4.8", "4.10", "4.13"] },
    { "id": 9, "tasks": ["4.2", "4.5", "4.7", "4.9", "4.11", "4.12"] },
    { "id": 10, "tasks": ["4.14"] }
  ]
}
```
