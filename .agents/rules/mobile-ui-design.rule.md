---
apiVersion: warp/v1alpha1
kind: Rule
metadata:
  name: mobile-ui-design
  description: Enforce Saturn Mobile theme tokens, above-the-fold action hierarchy, and React Native Yoga layout safety
spec:
  priority: 20
  triggers:
    globs:
      - "apps/mobile/**/*.tsx"
      - "!apps/mobile/**/__tests__/**"
      - "!apps/mobile/**/*.test.tsx"
    keywords: [mobile, react-native, expo, screen, sheet, chart]
    useWhen: Creating, modifying, or reviewing Mobile UI screens and components under apps/mobile
---

Follow Saturn's Mobile visual and layout standards ([Mobile Conventions](docs/conventions/mobile.md) and [Design System Charter](docs/conventions/design-system.md)).

### 1. Reactive Theme Tokens & Surface Hierarchy
- Always style via `useTheme()` and `useThemedStyles()` consuming `@saturn/tokens` (`colors.surface`, `colors.surfaceSubtle`, `colors.border`, `t.radius.*`)—never hardcode hex or `rgba(...)` colors.
- Use `colors.surface` (crisp white in Light Mode, never `surfaceElevated`) for primary cards and action buttons so Light Mode surfaces lift cleanly off the canvas.

### 2. Above-the-Fold Ergonomics & Native Controls
- Place primary user actions (`Add`, `Transfer`, `Repay`, `Resume/Reopen`) **immediately beneath the hero `<Card>`**, above analytics charts and secondary reference cards (Notes, Statements).
- Wrap all interactive controls in `<TouchableOpacity>` or `<Pressable>` with `haptics.selection()` / `haptics.light()` and `>= 44px` hit targets—never use bare `<Text onPress>` for buttons or toggles.
- Build segmented controls with themed `<TouchableOpacity>` pill tracks (`surfaceSubtle` track, `surface` active pill) and present structured metadata in `<Card>` rows with `<MonoAmount>` and `<Badge>`—never `\n`-joined plain text dumps.

### 3. React Native Yoga Layout Safety
- **Never** apply `flex: 1` (which expands to `flexBasis: 0`) to children along the vertical axis of unbounded auto-height containers (`SectionList` `ListHeaderComponent`, `ScrollView`, or auto-height column `<View>`s)—Yoga collapses their height to `0px` on real devices even though unit-test DOM mocks hide it.
- For wrapping horizontal button rows (`flexWrap: "wrap"`), use `flexGrow: 1` with an explicit `flexBasis`, `minHeight`, and vertical padding so longer Spanish translations expand cleanly without clipping.
- Always pass `ListHeaderComponent={renderHeader()}` (invoked element, not an inline callback) when the header contains a `<TextInput>` so keyboard focus persists across keystrokes.

### 4. Mobile Charts (`react-native-svg`)
- Use `preserveAspectRatio="xMidYMid meet"` (never `"none"`) so circular markers stay round, and map touch `locationX` through the centered plot width (`plotWidth = Math.min(width, viewBoxWidth * height / viewBoxHeight)`).
- Default the inspected point to the **latest observed value** (never index `0`) and display min/max scale plus start/end date labels so users can read the chart without scrubbing.

### 5. Code Review Lens
When reviewing Mobile UI diffs, explicitly verify Yoga flex sizing in auto-height columns, reactive Light/Dark theme tokens, above-the-fold CTA placement, and `TextInput` focus stability.
