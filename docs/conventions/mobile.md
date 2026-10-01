# Mobile App Conventions (`apps/mobile`)

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, 60fps performance, and native feel across iOS and Android.

---

## 1. Expo & React Native Tooling

1. **Package Installation**:
   - ALWAYS use `npx expo install <package>` instead of `npm/yarn/bun add` to ensure SDK-compatible versions.
   - Run `npx expo install --fix` if dependency version mismatches occur.
2. **Never Edit Native Folders Directly**:
   - `ios/` and `android/` directories are generated via Continuous Native Generation (CNG).
   - Configure native permissions, icons, and build settings exclusively in `app.json` and Expo config plugins.
3. **Docs Verification**:
   - Expo APIs change frequently between SDK versions. Refer to `https://docs.expo.dev/llms.txt` for SDK-accurate guidance.

---

## 2. Navigation & File Structure

1. **Expo Router**:
   - Screen files live strictly inside `apps/mobile/app/`.
   - Layouts and stack navigators live in `_layout.tsx` files.
   - Non-route components, hooks, and helpers must stay outside `app/` (under `components/`, `lib/`, `hooks/`).
2. **Router Imports**:
   - Use `useRouter`, `useLocalSearchParams`, and `Stack` from `expo-router`.
   - Add haptic feedback before screen transitions: `haptics.light(); router.push(...)`.

---

## 3. UI, Theming & Performance

1. **Theme Tokens**:
   - Use `theme.colors` from `@/lib/theme` rather than hardcoded hex values to support dark mode consistently.
   - For budget cards and category accents, use `getNativeBudgetColors` from `@/lib/theme`.
2. **Haptic Feedback**:
   - Trigger haptics via `@/lib/haptics` (`haptics.light()`, `haptics.success()`, `haptics.selection()`) on user interactions, button taps, and sheet dismissals.
3. **Typography**:
   - Use standard typography components: `MonoAmount`, `Caption` from `@/components/ui/typography`.
4. **Lists & Grouping**:
   - Use `groupTransactionsByDate(transactions, tz.timezone)` for date-grouped section lists.

---

## 4. Mobile Testing Conventions

- **Tooling**: **Jest** + **`jest-expo`** + **`@testing-library/react-native`**.
- **What to Test**:
  - **Data Sectioning**: Grouping algorithms (e.g. `groupTransactionsByDate(transactions, tz.timezone)`).
  - **Interaction Feedback**: Assert haptic feedback functions (`haptics.light()`, `haptics.selection()`) are triggered on touch events.
  - **Mobile Hooks**: Route parameters, space context, and theme token mapping.
  - **Input Components**: Number pads, currency amount inputs, and category sheets.
- **Anti-Patterns**:
  - Do **not** test generated files in `ios/` or `android/` (CNG-managed).
  - Do **not** unit-test low-level native animations or Reanimated frame-by-frame physics.
- **Detailed Guide**: See [Testing Conventions & Guide](testing.md).
