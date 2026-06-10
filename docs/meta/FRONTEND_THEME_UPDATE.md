# Frontend Theme Update: Field Ops

## Overview

Complete frontend pass implementing **Theme 2: Field Ops** design language with focus on HCI, readability, and flow.

## Design Language

### Visual Identity
- **Theme**: Field Ops — Command room / Mission board aesthetic
- **Palette**: Dark olive black + brass gold accents
- **Typography**: System fonts with condensed, military-inspired styling
- **Corners**: Square (3px border-radius) for tactical, no-nonsense feel
- **Spacing**: Consistent 4/8/12/16/20/24px scale

### Colors

```typescript
// Backgrounds
bgPrimary: "#0E100A"       // Deep olive black
bgSecondary: "#161910"     // Dark olive
bgTertiary: "#1C1F16"      // Medium olive
bgCard: "#161910"          // Card surface

// Borders
borderSubtle: "rgba(200,168,75,0.08)"
borderDefault: "rgba(200,168,75,0.15)"
borderStrong: "rgba(200,168,75,0.25)"
borderAccent: "#C8A84B"    // Brass

// Text
textPrimary: "#D4D8C8"     // Light warm gray
textSecondary: "rgba(212,216,200,0.85)"
textTertiary: "rgba(212,216,200,0.6)"
textMuted: "rgba(212,216,200,0.35)"
textLabel: "rgba(200,168,75,0.6)"

// Accents
accentPrimary: "#C8A84B"   // Brass gold
accentDanger: "#DC5032"    // Alert red
accentSuccess: "#7A9B6E"   // Olive green
```

## Key HCI Improvements

### 1. Visual Hierarchy
- **Section titles**: All caps with letter spacing, underlined with subtle border
- **Labels**: Consistent uppercase styling with brass color
- **Content**: Clear primary/secondary/tertiary text levels
- **Spacing**: Consistent vertical rhythm throughout

### 2. Readability
- **Line height**: Increased to 21-24px for body text
- **Contrast**: Improved text-to-background ratios
- **Typography scale**: Clear hierarchy from 11px to 38px
- **Letter spacing**: Added to uppercase labels for better legibility

### 3. Interaction Design
- **Buttons**: Clear primary (filled brass) vs secondary (outlined) distinction
- **States**: Active states use bold brass, disabled states use muted colors
- **Feedback**: Consistent notice/banner styling
- **Touch targets**: Minimum 44-48px height for all interactive elements

### 4. Information Architecture
- **Today Screen**: Reorganized as "Situation Report → Primary Objective → Field Order"
- **Board Screen**: Clear column-based layout with consistent card styling
- **Progress Screen**: Better empty states and consistent bullet points
- **Card Detail**: Improved section spacing and label hierarchy

## Component Updates

### Core Components
- ✅ **styles.ts**: Complete rewrite with design system tokens
- ✅ **Section**: Improved title styling with underline separator
- ✅ **QuickCapture**: Added label, better input styling
- ✅ **CardTile**: Updated warmth badge, improved spacing
- ✅ **ProofShelf**: Updated bullet style (▸)
- ✅ **MvdChecklist**: Better button text, updated checkboxes (○/▸)
- ✅ **SalvagePicker**: Consistent styling with MvdChecklist
- ✅ **ActiveLimitBanner**: Better border styling with left accent

### Screen Updates
- ✅ **Today (index.tsx)**: Military terminology, better empty states
- ✅ **Board (board.tsx)**: Improved intro text, consistent styling
- ✅ **Progress (progress.tsx)**: Added empty states, updated bullet points
- ✅ **Log (log.tsx)**: Better empty state, updated separators
- ✅ **Card Detail ([id].tsx)**: Improved spacing, better label hierarchy

## Typography Scale

```typescript
displayLarge: 38    // Big numbers
displayMedium: 28   // Reserved
headingLarge: 22    // Page titles
headingMedium: 18   // Section titles (styled as labels)
headingSmall: 16    // Card titles
bodyLarge: 15       // Primary text
bodyMedium: 14      // Secondary text
bodySmall: 13       // Help text
labelLarge: 13      // Button text
labelMedium: 12     // Section labels
labelSmall: 11      // Tags, meta info
```

## Spacing Scale

```typescript
xs: 4px   // Tight spacing
sm: 8px   // Small gaps
md: 12px  // Default spacing
lg: 16px  // Page padding
xl: 20px  // Large gaps
xxl: 24px // Section gaps
```

## Language Updates

Terminology aligned with Field Ops theme:

| Before | After |
|--------|-------|
| While You Were Away | Situation Report |
| Today's Pounce | Primary Objective / Field Order |
| Active Cards | Active Operations |
| Recovery | Recovery Systems |
| Raw history | Raw mission log |
| POUNCE | Execute Pounce |
| LOG | Log Action |
| MVD DONE | MVD Complete |

## Bullet Point Consistency

All list items now use **▸** (triangle) instead of **-** (dash) for military/tactical feel:
- Situation report items
- Progress lists
- Proof shelf entries
- Card detail lists
- Salvage options

## Empty States

Added consistent empty states to all lists:
- "No activity to report yet."
- "No active cards. Capture something to get started."
- "No entries logged yet."
- "No proof linked yet."
- "No recent wins recorded yet."

## Accessibility

- Maintained minimum touch target sizes (44-48px)
- Improved color contrast ratios
- Clear focus states via border styling
- Semantic HTML structure preserved
- Text remains selectable and readable

## Testing Recommendations

1. **Visual**: Verify all screens match Field Ops aesthetic
2. **Interaction**: Test all buttons, inputs, and pressable areas
3. **Typography**: Check readability at different sizes
4. **Empty states**: Verify all empty state messages appear correctly
5. **Flow**: Navigate through all screens to verify consistency

## Next Steps (Optional)

For future refinement:
- Custom font loading (Barlow Condensed for even more Field Ops feel)
- Warmth color coding (cards shift color based on temperature)
- Animation on state transitions
- Progress bar animations
- Card flip animations for state changes

## Files Modified

- `src/components/styles.ts` - Complete rewrite with design system
- `src/components/QuickCapture.tsx` - Added label, improved UX
- `src/components/ProofShelf.tsx` - Updated bullet style
- `src/components/MvdChecklist.tsx` - Better button text and checks
- `src/components/SalvagePicker.tsx` - Consistent styling
- `app/index.tsx` - Military terminology, empty states
- `app/board.tsx` - Improved intro
- `app/progress.tsx` - Added empty states
- `app/log.tsx` - Better empty state
- `app/card/[id].tsx` - Improved hierarchy and spacing

## Design Philosophy

This theme reflects the Life Harness philosophy:
- **No judgment, just signal** - Clear status without emotional language
- **Scout/operator energy** - Professional, tactical, supportive
- **Alive system** - Information that breathes and responds
- **Low friction** - Fast capture, clear next actions
- **Recoverable** - Salvage and MVD feel like tactical recovery, not failure

---

**Theme**: Field Ops  
**Status**: Complete  
**Date**: 2026-06-09
