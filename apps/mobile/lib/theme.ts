import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Appearance,
  Platform,
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  lightColors,
  darkColors,
  CATEGORICAL_HEX_MAP,
  getCategoricalColor,
  spacing,
  radii,
  type SemanticColorPalette,
} from "@saturn/tokens"

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedThemeMode = "light" | "dark"
export type CategoricalModeColors = ReturnType<
  typeof getCategoricalColor
>["dark"]

export const THEME_MODE_STORAGE_KEY = "saturn_mobile_theme_mode"

export const radius = {
  xs: radii.xs,
  sm: radii.sm,
  md: 10,
  lg: 14,
  xl: 20,
  full: radii.full,
} as const

export interface ShadowScale {
  sm: ViewStyle
  md: ViewStyle
  lg: ViewStyle
}

export const darkShadows: ShadowScale = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 8,
  },
}

export const lightShadows: ShadowScale = {
  sm: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
}

export const shadows = darkShadows

export const typography = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
} as const

export const budgetColorsMap = CATEGORICAL_HEX_MAP as Record<string, string>

/**
 * Returns native hex/rgba colors for a given budget color name in the active theme mode.
 */
export function getNativeBudgetColors(
  colorName: string,
  mode: ResolvedThemeMode = "dark"
): CategoricalModeColors {
  const token = getCategoricalColor(colorName)
  return mode === "light" ? token.light : token.dark
}

export interface SaturnMobileTheme {
  mode: ThemeMode
  resolvedMode: ResolvedThemeMode
  setMode: (mode: ThemeMode) => void
  colors: SemanticColorPalette
  spacing: typeof spacing
  radius: typeof radius
  shadows: ShadowScale
  budgetColors: Record<string, string>
  getBudgetColors: (colorName: string) => CategoricalModeColors
  typography: typeof typography
  isDark: boolean
}

/**
 * Backward-compatible static dark theme singleton for non-React fallbacks.
 */
export const theme: SaturnMobileTheme = {
  mode: "dark",
  resolvedMode: "dark",
  setMode: () => {},
  colors: darkColors,
  spacing,
  radius,
  shadows: darkShadows,
  budgetColors: budgetColorsMap,
  getBudgetColors: (colorName: string) =>
    getNativeBudgetColors(colorName, "dark"),
  typography,
  isDark: true,
}

const ThemeContext = createContext<SaturnMobileTheme | null>(null)

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function syncNativeAppearance(mode: ThemeMode) {
  try {
    if (typeof Appearance?.setColorScheme === "function") {
      Appearance.setColorScheme(mode === "system" ? "unspecified" : mode)
    }
  } catch {
    // Ignore in environments where native Appearance override is unsupported
  }
}

export function MobileThemeProvider({
  children,
  defaultMode = "system",
}: {
  children: ReactNode
  defaultMode?: ThemeMode
}) {
  const systemScheme = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>(defaultMode)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY)
      .then((stored) => {
        if (active && isThemeMode(stored)) {
          setModeState(stored)
          syncNativeAppearance(stored)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode)
    syncNativeAppearance(nextMode)
    AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode).catch(() => {})
  }, [])

  const resolvedMode: ResolvedThemeMode =
    mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode

  const value = useMemo<SaturnMobileTheme>(() => {
    const isDark = resolvedMode === "dark"
    return {
      mode,
      resolvedMode,
      setMode,
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      shadows: isDark ? darkShadows : lightShadows,
      budgetColors: budgetColorsMap,
      getBudgetColors: (colorName: string) =>
        getNativeBudgetColors(colorName, resolvedMode),
      typography,
      isDark,
    }
  }, [mode, resolvedMode, setMode])

  return React.createElement(ThemeContext.Provider, { value }, children)
}

export const ThemeProvider = MobileThemeProvider

export function useTheme(): SaturnMobileTheme {
  const ctx = useContext(ThemeContext)
  const systemScheme = useColorScheme()

  return useMemo<SaturnMobileTheme>(() => {
    if (ctx) return ctx
    const resolvedMode: ResolvedThemeMode =
      systemScheme === "light" ? "light" : "dark"
    const isDark = resolvedMode === "dark"
    return {
      mode: "system",
      resolvedMode,
      setMode: () => {},
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      shadows: isDark ? darkShadows : lightShadows,
      budgetColors: budgetColorsMap,
      getBudgetColors: (colorName: string) =>
        getNativeBudgetColors(colorName, resolvedMode),
      typography,
      isDark,
    }
  }, [ctx, systemScheme])
}

export type NamedStyles<T> = {
  [P in keyof T]: ViewStyle | TextStyle | ImageStyle
}

export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (t: SaturnMobileTheme) => T
): Readonly<T> {
  const currentTheme = useTheme()
  return useMemo(
    () => StyleSheet.create(factory(currentTheme)),
    [currentTheme, factory]
  )
}

export { lightColors, darkColors }

/**
 * Returns semantic color based on cashflow / balance amount
 */
export function getCashflowColor(
  amount: number,
  colors: SemanticColorPalette = theme.colors
): string {
  if (amount > 0) return colors.success
  if (amount < 0) return colors.destructive
  return colors.textMuted
}

const AVATAR_HUES = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#0d9488",
]

/**
 * Deterministically generates a color for an avatar given a string seed (name or ID)
 */
export function getAvatarColor(seed: string): string {
  if (!seed) return AVATAR_HUES[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_HUES.length
  return AVATAR_HUES[index]
}
