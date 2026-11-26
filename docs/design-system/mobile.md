# Saturn Mobile Design System (`apps/mobile`)

Visual, spatial, and native component specification for Saturn's Expo / React Native mobile application (iOS & Android). See [Orbital Precision Foundations](./README.md) for shared brand tokens, color semantics, and typography, and [Mobile App Conventions](../conventions/mobile.md) for Expo Router and CNG tooling.

---

## 1. Reactive Theme Architecture

Mobile themes are powered by `ThemeProvider`, `useTheme()`, and `useThemedStyles()` in `apps/mobile/lib/theme.ts`, reading directly from `@saturn/tokens` so Light, Dark, and System mode changes propagate immediately across every mounted screen.

```tsx
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export function SummaryTile() {
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
  // ...
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.lg,
    padding: 16,
    gap: 10,
  },
})
```

### Surface Elevation & Shadow Pairing

| Layer | Token | Light Mode | Dark Mode | Shadow | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Canvas** | `colors.background` | `#f6f9fb` | `#090d16` | None | Screen canvas and native header background |
| **Primary Card** | `colors.surface` | `#ffffff` | `#111827` | `t.shadows.sm` | `<Card>`, action tiles, active segmented pills |
| **Floating Surface** | `colors.surfaceElevated` | `#ffffff` | `#182235` | `t.shadows.md` | Sheets, popovers, overflow menus |
| **Recessed Well** | `colors.surfaceSubtle` | `#edf3f7` | `#0d131f` | None | Segmented tracks, progress tracks, chart strips, inputs |
| **Selected / Press** | `colors.surfaceHighlight` | `#e5eef4` | `#1e293b` | None | Secondary icon wells, pressed highlights |

- **Light Mode Contrast**: Primary cards and action buttons sit on crisp `#ffffff` (`colors.surface`) over the `#f6f9fb` cool-porcelain canvas, separated by `1px` `colors.border` hairlines and whisper-soft `lightShadows`.
- **Categorical Hues**: Resolve budget and category themes via `getNativeBudgetColors(colorName, resolvedMode)`, returning mode-calibrated `{ bg, border, text, bar }` values.

---

## 2. Screen Anatomy & Thumb-Zone Ergonomics

Mobile screens prioritize immediate glanceability and one-handed thumb reach (`>= 44pt` touch targets) within a `~390×844pt` viewport.

### Detail Workspace Flow (`accounts/[id]`, `budgets/[id]`, `borrowing/[id]`)

```text
┌────────────────────────────────────┐
│ ←  Checking               [✨] [···] │  ← Native Stack Header (canvas bg)
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │  Hero Card (<CardAccountItem>  │ │  1. Identity & Primary Balance
│ │  or <Card> + Pace Progress)    │ │
│ └────────────────────────────────┘ │
│  [Transfer] [Adjust] [+Tx] [Edit]  │  2. Primary Actions (Above the Fold)
│ ┌────────────────────────────────┐ │
│ │  KPI Strip · Segmented Pills   │ │  3. Analytics & Interactive Chart
│ │  <DetailChart />               │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │  Notes / Statements Accordion  │ │  4. Secondary Reference Metadata
│ └────────────────────────────────┘ │
│ [🔍 Search activity              ] │  5. Search & Date-Grouped Ledger
│ TODAY                              │     (<DateSectionHeader> +
│ • Coffee Shop              -$4.50  │      <TransactionListItem>)
└────────────────────────────────────┘
```

### Bottom Sheet Detents (`@gorhom/bottom-sheet`)
Adaptive snap points keep underlying context visible while allowing seamless expansion:
- **Compact Empty State (`~34%`)**: Header, active entity chip, 2–3 starter suggestions, and prompt bar (`MobileCopilotSheet`).
- **Active Workspace (`~62%`)**: Mid-height conversation or triage overlay with swipe-down dismissal.
- **Full Screen (`100%`)**: Edge-to-edge workspace with `insets.top` safe-area padding; swiping down snaps cleanly back to `62%`.

### Single-Surface Forms & Sticky Docks
- **Modal Forms (`app/modal/*.tsx`)**: Present fields inside one unified surface separated by `StyleSheet.hairlineWidth` dividers (`modal/manage-budget.tsx`) rather than stacked card-in-card boxes.
- **Sticky Bottom Docks**: Keep bottom action bars (e.g., `mail/[threadId].tsx`) at `minHeight: 44` with `paddingBottom: Math.max(insets.bottom, 10)`—using an icon-only `44×44` Reply button beside `flex: 1` Reply All and Forward pills so longer Spanish labels never clip.

---

## 3. Core Primitives (`apps/mobile/components/ui/`)

### Surfaces & Sheets
- **`<Card>`** (`card.tsx`): Standard `radius.lg` (`14px`) surface container with `1px` `colors.border`. Supports `elevated?: boolean` (`surfaceElevated` + `shadows.md`) and `onPress?: () => void` (wraps in `TouchableOpacity` with automatic `haptics.light()`). Subcomponents: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- **`<AppBottomSheet>` & `<BottomSheetHeader>`** (`bottom-sheet.tsx`): Themed `@gorhom/bottom-sheet` wrapper with drag handle, safe-area padding, backdrop, and standardized header row.
- **`<QuickCaptureSheet>` & `<QuickCaptureFab>`** (`quick-capture-sheet.tsx`): Fast capture floating trigger and multi-domain creation sheet.

### Actions & Menus
- **`<Button>`** (`button.tsx`): Rounded `radius.md` (`10px`) tactile button with integrated loading spinner and haptic feedback (`haptic="light|medium|heavy|none"`). Variants: `primary`, `secondary`, `destructive`, `ghost`, `outline`. Sizes: `sm`, `md`, `lg` (`>= 44pt` touch height for primary CTAs). Supports `leftIcon`, `rightIcon`, `loading`, and `fullWidth`.
- **`<ActionMenu>`** (`action-menu.tsx`): Cross-platform overflow action sheet (Android counterpart to iOS `SF Symbol` header menus).
- **`<ConfirmDialog>`** (`confirm-dialog.tsx`): Themed modal confirmation dialog for destructive actions.

### Typography & Data Display
- **`Typography`** (`typography.tsx`): Full semantic native text hierarchy—`Header1`, `Header2`, `Title`, `Subtitle`, `Body`, `Caption`, and `MonoAmount` (`fontVariant: ["tabular-nums"]`).
- **`<Badge>`** (`badge.tsx`): Full-pill (`radius.full`) status indicator with `numberOfLines={1}` truncation protection. Variants: `default`, `primary`, `success`, `destructive`, `warning`, `outline`; sizes `sm` and `md`; accepts `icon` and theme-token `bg` / `border` / `color` overrides.
- **`<Avatar>`** (`avatar.tsx`): Circular identity avatar (`name` initials fallback, `imageUri`, configurable `size`).
- **`<JsonCodeBlock>`** (`json-code-block.tsx`): Syntax-colored JSON renderer consuming `@saturn/tokens` `syntax*` colors with 1-tap clipboard copy (`expo-clipboard` + `haptics.selection()`).

### Forms & Inputs
- **`<TextInput>` & `<BaseTextInput>`** (`text-input.tsx`): React Hook Form-bound and standalone text inputs with themed borders, focus states (`colors.borderFocus`), labels, and validation errors.
- **`<HeroAmountInput>`** (`amount-input.tsx`): Large tabular numeric currency input with `sanitizeAmountString` normalization.
- **`<DatePickerSheet>`** (`date-picker-sheet.tsx`): Native bottom-sheet calendar picker with `toLocalISODate` and `formatDisplayDate` timezone helpers.
- **`<OTPInput>`** (`otp-input.tsx`): 6-digit MFA and verification code input with paste/autofill normalization (`normalizeOtpInput`).
- **`FormPrimitives`** (`form-primitives.tsx`): Fluent single-surface form rows—`FormRowInput`, `FormSwitchRow`, `FormPillGroup`, `FormDateRow`, `FormEffectiveDateSection`, `FormCheckboxRow`, and `FormColorPicker` (12-hue categorical selector).

### Security Modals & Feedback
- **`<ToastProvider>` & `useToast()`** (`toast.tsx`): Non-blocking status banners (`success`, `error`, `info`, `warning`).
- **`<Skeleton>`, `<SkeletonCard>`, `<SkeletonTransactionItem>`** (`skeleton-loader.tsx`): Animated loading placeholders matching card and ledger silhouettes.
- **`<EmptyState>`** (`empty-state.tsx`): Icon, title, description, and optional CTA for zero-data screens.
- **`<ChangePasswordModal>` & `<MfaStepUpModal>`** (`change-password-modal.tsx`, `mfa-stepup-modal.tsx`): Reusable security verification and credential update modals.

---

## 4. Composed Domain Patterns (`apps/mobile/components/`)

- **`<CardAccountItem />`**: Physical account/card presentation (`radius.xl`, institution identity, masked last-four, balance + signed base-currency conversion).
- **`<TransactionListItem />` & `<DateSectionHeader />`**: Grouped ledger rows with semantic type icons, signed `<MonoAmount>` (covering `EXPENSE`, `INCOME`, `TRANSFER_IN`, `TRANSFER_OUT`, `BALANCE_ADJUSTMENT`), and optional borrowing role badges.
- **`<SwipeableInboxCard />`**: Compact 2-zone triage card (~100px tall) combining Transaction Identity on top with inline Account/Budget assignment chips and 1-tap Approve below, backed by high-contrast white-on-emerald/crimson swipe actions.
- **`<DetailChart />` (`components/finance/detail-chart.tsx`)**:
  - Uses `react-native-svg` with `preserveAspectRatio="xMidYMid meet"` so circular point markers remain round across phone and tablet widths.
  - Maps touch `locationX` through the exact centered plot width (`plotWidth = Math.min(width, (viewBoxWidth * height) / viewBoxHeight)`) for smooth finger scrubbing with `haptics.selection()`.
  - Displays a `surfaceSubtle` inspection strip resting on the **latest observed point**, native `<Text>` min/max scale and start/end date labels, and VoiceOver/TalkBack `accessibilityRole="adjustable"` actions (`increment`, `decrement`, `activate`).
- **`<MobileToolCallCard />` & `<MobileCopilotSheet />`**: Structured domain tool cards (Finance, Calendar, Mail, Workflows) with `{ } Raw` `<JsonCodeBlock />` toggle, plus a global root Copilot sheet with a `2px` Orbital Teal → Celestial Iris streaming shimmer.

---

## 5. Platform Expression, Motion & Haptics

### iOS & Android Native Parity
- **iOS (`Platform.OS === "ios"`)**: Native `Stack.Screen` `unstable_headerRightItems` with SF Symbols (`ellipsis`, `sparkles`, `plus`, `archivebox`) and system pull-down menus.
- **Android**: Uniform `40–44pt` `<TouchableOpacity>` header icons paired with `<ActionMenu />` overflow sheets.
- **Copilot Integration**: Detail screens register `useMobileCopilotView({ viewId, title, activeEntity, suggestions })` so `<AIHeaderButton />` opens `<MobileCopilotSheet />` in-place with active entity context.

### Haptics Lexicon (`apps/mobile/lib/haptics.ts`)
| Feedback | Trigger |
| :--- | :--- |
| `haptics.selection()` | Segmented pills, period stepping, chart scrubbing, filter chips, pickers |
| `haptics.light()` | Row navigation, primary button taps, sheet triggers |
| `haptics.success()` | Completed mutations (saved, approved, resumed, reconciled) |
| `haptics.error()` | Validation or mutation failures |

### Motion Language
- **Sheet & Height Transitions**: Critically damped springs (`damping: 26, stiffness: 240`) with zero rubbery overshoot.
- **Streaming Feedback**: `2px` top-edge Orbital Teal → Celestial Iris shimmer bar and smooth cross-fade (`FadeInDown`/`FadeOutUp`) status transitions while AI Copilot runs.

---

## 6. Layout Mechanics & Reference Screens

### React Native Layout Notes
- **Vertical Flex Sizing**: In Yoga, `flex: 1` sets `flexBasis: 0` along the parent's main axis. Inside unbounded or auto-height columns (`SectionList` `ListHeaderComponent`, `ScrollView`, or auto-height row metadata columns), size children via intrinsic padding and `minHeight` rather than `flex: 1`.
- **Multilingual Wrapping Rows**: For wrapping horizontal action rows (`flexWrap: "wrap"`), pair `flexGrow: 1` with an explicit `flexBasis` (e.g., `120`), `minHeight: 42–44`, and `paddingVertical: 10` so multi-word Spanish labels expand cleanly.
- **Input Focus in `SectionList`**: Pass `ListHeaderComponent={renderHeader()}` (an element rather than an inline render callback) whenever the header contains a `<TextInput>` so focus persists across keystrokes.

### Interactive Workbench & Reference Screens
- **Live Design Gallery**: Open `settings/design-system` in development (`__DEV__`) to inspect `@saturn/tokens`, live Light/Dark/System switching, and core mobile primitives on device.
- **Canonical Reference Screens**:
  - Detail Workspaces: `apps/mobile/app/(app)/finance/accounts/[id].tsx`, `budgets/[id].tsx`, `borrowing/[id].tsx`
  - Lists & Triage: `apps/mobile/app/(app)/finance/budgets.tsx`, `finance/inbox.tsx`, `finance/transactions/index.tsx`
  - Fluent Modal Form: `apps/mobile/app/modal/manage-budget.tsx`
  - Mail Reader & Sticky Dock: `apps/mobile/app/(app)/mail/[threadId].tsx`
