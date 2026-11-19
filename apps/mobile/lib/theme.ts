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

const THEME_MODE_STORAGE_KEY = "saturn_mobile_theme_mode"

export const radius = {
  xs: radii.xs,
  sm: radii.sm,
  md: 10,
  lg: 14,
  xl: 20,
  full: radii.full,
} as const

export const shadows = {
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
} as const

export const typography = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
} as const

/**
 * Backward-compatible static dark theme singleton for screens not yet migrated to useTheme().
 */
export const theme = {
  colors: darkColors,
  spacing,
  radius,
  shadows,
  budgetColors: CATEGORICAL_HEX_MAP as Record<string, string>,
  typography,
} as const

export interface SaturnMobileTheme {
  mode: ThemeMode
  resolvedMode: ResolvedThemeMode
  setMode: (mode: ThemeMode) => void
  colors: SemanticColorPalette
  spacing: typeof spacing
  radius: typeof radius
  shadows: typeof shadows
  typography: typeof typography
  isDark: boolean
}

const ThemeContext = createContext<SaturnMobileTheme | null>(null)

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
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
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode)
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
      shadows,
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
      shadows,
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
 * Returns native hex/rgba colors for a given budget color name
 */
export function getNativeBudgetColors(
  colorName: string,
  mode: ResolvedThemeMode = "dark"
) {
  const token = getCategoricalColor(colorName)
  return mode === "light" ? token.light : token.dark
}

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
