# Design Tokens Reference

Quick reference for the Field Ops design system.

## Color Tokens

### Background Colors
```typescript
colors.bgPrimary      // #0E100A - Screen background
colors.bgSecondary    // #161910 - Section/card background
colors.bgTertiary     // #1C1F16 - Panel backgrounds
colors.bgCard         // #161910 - Card surface
```

### Border Colors
```typescript
colors.borderSubtle   // rgba(200,168,75,0.08) - Very light borders
colors.borderDefault  // rgba(200,168,75,0.15) - Standard borders
colors.borderStrong   // rgba(200,168,75,0.25) - Emphasized borders
colors.borderAccent   // #C8A84B - Brass accent borders
```

### Text Colors
```typescript
colors.textPrimary     // #D4D8C8 - Primary content
colors.textSecondary   // rgba(212,216,200,0.85) - Secondary content
colors.textTertiary    // rgba(212,216,200,0.6) - Less important text
colors.textMuted       // rgba(212,216,200,0.35) - Subtle hints
colors.textLabel       // rgba(200,168,75,0.6) - Labels and headers
```

### Accent Colors
```typescript
colors.accentPrimary   // #C8A84B - Brass gold (primary actions)
colors.accentDanger    // #DC5032 - Alert red
colors.accentSuccess   // #7A9B6E - Olive green (success states)
colors.accentWarm      // rgba(200,168,75,0.3) - Warm overlay
```

### Status Colors
```typescript
colors.statusHot       // #C8A84B - Hot/active projects
colors.statusWarm      // #9B8755 - Warm projects
colors.statusCool      // #7A7E68 - Cool projects
colors.statusCold      // #5A5D52 - Cold projects
```

### Input Colors
```typescript
colors.inputBg          // #0E100A - Input background
colors.inputBorder      // rgba(200,168,75,0.12) - Input border
colors.inputText        // #D4D8C8 - Input text
colors.inputPlaceholder // rgba(212,216,200,0.3) - Placeholder
```

## Typography Scale

```typescript
typography.displayLarge    // 38px - Big numbers, hero content
typography.displayMedium   // 28px - Reserved for future use
typography.headingLarge    // 22px - Page titles
typography.headingMedium   // 18px - Major sections
typography.headingSmall    // 16px - Card titles
typography.bodyLarge       // 15px - Primary body text
typography.bodyMedium      // 14px - Standard body text
typography.bodySmall       // 13px - Small body text, help text
typography.labelLarge      // 13px - Large button labels
typography.labelMedium     // 12px - Standard labels, tags
typography.labelSmall      // 11px - Small labels, meta info
```

## Spacing Scale

```typescript
spacing.xs    // 4px  - Tight spacing, list item padding
spacing.sm    // 8px  - Small gaps, button groups
spacing.md    // 12px - Default component padding
spacing.lg    // 16px - Page padding, larger gaps
spacing.xl    // 20px - Section gaps
spacing.xxl   // 24px - Major section spacing
```

## Usage Examples

### Creating a Section
```typescript
<View style={[styles.section, styles.sectionXp]}>
  <Text style={styles.sectionTitle}>Weekly XP</Text>
  <Text style={styles.bodyText}>Content here</Text>
</View>
```

### Primary Button
```typescript
<Pressable style={styles.primaryAction}>
  <Text style={styles.primaryActionText}>Execute</Text>
</Pressable>
```

### Secondary Button
```typescript
<Pressable style={styles.secondaryAction}>
  <Text style={styles.secondaryActionText}>Cancel</Text>
</Pressable>
```

### Small Action Button
```typescript
<Pressable style={styles.smallButton}>
  <Text style={styles.smallButtonText}>Edit</Text>
</Pressable>
```

### List Items
```typescript
<Text style={styles.listItem}>▸ Item text here</Text>
```

### Labels
```typescript
<Text style={styles.label}>Label Text</Text>
```

### Help Text
```typescript
<Text style={styles.helpText}>Helpful hint or description</Text>
```

### Card Structure
```typescript
<View style={styles.cardTile}>
  <View style={styles.cardHeader}>
    <Text style={styles.cardTitle}>Title</Text>
    <Text style={styles.cardWarmth}>HOT</Text>
  </View>
  <Text style={styles.cardMeta}>Metadata</Text>
  <ProgressBar value={72} />
</View>
```

### Progress Bar
```typescript
<View style={styles.progressWrap}>
  <View style={styles.progressTrack}>
    <View style={[styles.progressFill, { width: '72%' }]} />
  </View>
  <Text style={styles.progressText}>72%</Text>
</View>
```

### Notice/Banner
```typescript
<View style={[styles.noticeBase, styles.noticeSuccess]}>
  <Text style={[styles.noticeText, styles.noticeSuccessText]}>
    Success message
  </Text>
</View>
```

### Input Field
```typescript
<TextInput
  style={styles.captureInput}
  placeholder="placeholder text..."
  placeholderTextColor={colors.inputPlaceholder}
/>
```

### Empty State
```typescript
<Text style={styles.emptyText}>
  No items yet. Start by capturing something.
</Text>
```

## Common Patterns

### Section with Accent
```typescript
// XP section with left brass border
<View style={[styles.section, styles.sectionXp]}>
  ...
</View>

// Warmth section with left warmth border
<View style={[styles.section, styles.sectionWarmth]}>
  ...
</View>

// Proof section with left success border
<View style={[styles.section, styles.sectionProof]}>
  ...
</View>
```

### Dual Panel Layout
```typescript
<View style={styles.splitRow}>
  <View style={styles.splitPanel}>
    <Text style={styles.label}>Left Panel</Text>
    <Text style={styles.bodyText}>Content</Text>
  </View>
  <View style={styles.splitPanel}>
    <Text style={styles.label}>Right Panel</Text>
    <Text style={styles.bodyText}>Content</Text>
  </View>
</View>
```

### Card Actions
```typescript
// Full width actions
<View style={styles.cardActions}>
  <Pressable style={styles.primaryAction}>...</Pressable>
  <Pressable style={styles.secondaryAction}>...</Pressable>
</View>

// Compact inline actions
<View style={styles.cardActionsCompact}>
  <View style={styles.cardActionsRow}>
    <Pressable style={styles.smallButton}>...</Pressable>
    <Pressable style={styles.smallButton}>...</Pressable>
  </View>
</View>
```

## Typography Guidelines

### When to Use Each Level

| Style | Use For |
|-------|---------|
| displayLarge | XP numbers, streak counts, major metrics |
| headingLarge | Screen titles (rare, usually use labels instead) |
| headingMedium | Major section dividers (styled as labels) |
| headingSmall | Card titles, important headings |
| bodyLarge | Primary reading content, intro text |
| bodyMedium | Standard body text, list items |
| bodySmall | Help text, metadata, hints |
| labelLarge | Button labels |
| labelMedium | Section labels, field labels |
| labelSmall | Tags, badges, small labels |

### Text Transform Guidelines
- **Section titles**: UPPERCASE with letter-spacing
- **Button labels**: UPPERCASE with letter-spacing
- **Field labels**: UPPERCASE with letter-spacing
- **Body text**: Normal case
- **Card titles**: Normal case

### Letter Spacing Guidelines
- Labels (12px): 1.6–1.8 spacing
- Buttons (13px): 1.2–1.4 spacing
- Body text: 0 spacing
- Display numbers: -1 spacing (tighter)

## Border Radius Guidelines

Field Ops uses **square corners** (3px) throughout for tactical feel:
- Sections: 3px
- Cards: 3px
- Buttons: 3px
- Inputs: 3px
- Progress bars: 0px (perfectly square)

Exception: Warmth badges use 2px for subtle softening.

## Opacity Guidelines

For consistency, use these opacity levels:
- 0.85: Secondary text
- 0.6: Tertiary text, labels
- 0.35: Muted text, hints
- 0.25: Placeholder text, very subtle elements
- 0.15: Default borders
- 0.12: Input borders
- 0.1: Subtle backgrounds (notices)
- 0.08: Very subtle borders
- 0.05: Ultra-subtle elements

## Border Width Guidelines

- Standard borders: 1px
- Emphasized left borders: 3px (sections, proof items)
- Progress tracks: 4px height, no border

## Bullet Points

Use **▸** (U+25B8 Black Right-Pointing Small Triangle) for all list items:
```typescript
<Text style={styles.listItem}>▸ List item content</Text>
```

Other characters used:
- **○** (U+25CB White Circle) for unchecked items
- **·** (U+00B7 Middle Dot) for inline separators

## Animation Notes

Current implementation: No animations (v0.1 constraint)

Future considerations:
- Progress bar fills: 300ms ease
- Card state transitions: 200ms ease
- Notice fade in/out: 200ms
- Section expand/collapse: 250ms ease-in-out

## Importing Tokens

```typescript
import { styles, colors, typography, spacing } from './styles';

// Use style object
<View style={styles.section}>

// Use color tokens for dynamic styling
<View style={{ backgroundColor: colors.bgPrimary }}>

// Use spacing tokens
<View style={{ marginTop: spacing.md }}>

// Use typography tokens
<Text style={{ fontSize: typography.bodyLarge }}>
```

## Notes

- All tokens are exported from `src/components/styles.ts`
- Color values use hex for solids, rgba for transparency
- Typography uses system fonts (no custom fonts in v0.1)
- Spacing follows 4px base grid
- Border radius is minimal (3px) for tactical aesthetic

---

**Design System**: Field Ops v1.0  
**Last Updated**: 2026-06-09
