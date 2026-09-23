import {
  BUDGET_COLORS,
  getBudgetColors as getCoreBudgetColors,
} from "@saturn/core"

/**
 * Visual Theme Tokens matching apps/web/index.css exactly.
 * Background: #090d16
 * Surface Card: #111827
 * Border: rgba(255, 255, 255, 0.1) or #1f2937
 * Primary / Accent: #38bdf8 (Cyan) / #6366f1 (Indigo)
 */

export const theme = {
  colors: {
    background: "#090d16",
    surface: "#111827",
    surfaceElevated: "#161e2e",
    surfaceSubtle: "#0d131f",
    surfaceHighlight: "#1e293b",
    border: "rgba(255, 255, 255, 0.1)",
    borderStrong: "#334155",
    borderFocus: "#38bdf8",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    primary: "#38bdf8",
    primaryForeground: "#090d16",
    primaryDark: "#0284c7",
    accent: "#6366f1",
    destructive: "#f43f5e",
    destructiveSubtle: "rgba(244, 63, 94, 0.12)",
    success: "#10b981",
    successSubtle: "rgba(16, 185, 129, 0.12)",
    warning: "#f59e0b",
    warningSubtle: "rgba(245, 158, 11, 0.12)",
    info: "#38bdf8",
    infoSubtle: "rgba(56, 189, 248, 0.12)",
    tabBar: "#090d16",
    tabBarBorder: "#1e293b",
    tabBarActive: "#38bdf8",
    tabBarInactive: "#64748b",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  radius: {
    xs: 4,
    sm: 6,
    md: 10, // 0.625rem matching web --radius
    lg: 14,
    xl: 20,
    full: 9999,
  },
  shadows: {
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
  },
  budgetColors: {
    indigo: "#6366f1",
    emerald: "#10b981",
    rose: "#f43f5e",
    amber: "#f59e0b",
    sky: "#0ea5e9",
    violet: "#8b5cf6",
  } as Record<string, string>,
} as const

const BUDGET_COLOR_MAP: Record<
  string,
  { bg: string; border: string; text: string; bar: string }
> = {
  indigo: {
    bg: "rgba(99, 102, 241, 0.12)",
    border: "rgba(99, 102, 241, 0.3)",
    text: "#818cf8",
    bar: "#6366f1",
  },
  emerald: {
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.3)",
    text: "#34d399",
    bar: "#10b981",
  },
  rose: {
    bg: "rgba(244, 63, 94, 0.12)",
    border: "rgba(244, 63, 94, 0.3)",
    text: "#fb7185",
    bar: "#f43f5e",
  },
  amber: {
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.3)",
    text: "#fbbf24",
    bar: "#f59e0b",
  },
  sky: {
    bg: "rgba(14, 165, 233, 0.12)",
    border: "rgba(14, 165, 233, 0.3)",
    text: "#38bdf8",
    bar: "#0ea5e9",
  },
  violet: {
    bg: "rgba(139, 92, 246, 0.12)",
    border: "rgba(139, 92, 246, 0.3)",
    text: "#a78bfa",
    bar: "#8b5cf6",
  },
}

/**
 * Returns native hex/rgba colors for a given budget color name
 */
export function getNativeBudgetColors(colorName: string) {
  return BUDGET_COLOR_MAP[colorName] || BUDGET_COLOR_MAP.indigo
}

/**
 * Returns semantic color based on cashflow / balance amount
 */
export function getCashflowColor(amount: number): string {
  if (amount > 0) return theme.colors.success
  if (amount < 0) return theme.colors.destructive
  return theme.colors.textMuted
}

const AVATAR_HUES = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#14b8a6", // teal
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
