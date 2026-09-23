/**
 * Visual Theme Tokens matching apps/web/index.css exactly.
 * Background: #090d16
 * Card: #111827
 * Border: rgba(255, 255, 255, 0.1) or #1f2937
 * Primary / Accent: #38bdf8 (Cyan) / #6366f1 (Indigo)
 */

export const theme = {
  colors: {
    background: "#090d16",
    surface: "#111827",
    surfaceHighlight: "#1e293b",
    border: "rgba(255, 255, 255, 0.1)",
    borderStrong: "#334155",
    textPrimary: "#f8fafc",
    textMuted: "#94a3b8",
    textSecondary: "#cbd5e1",
    primary: "#38bdf8",
    primaryForeground: "#090d16",
    accent: "#6366f1",
    destructive: "#f43f5e",
    success: "#34d399",
    warning: "#fbbf24",
    tabBar: "#090d16",
    tabBarBorder: "#1e293b",
    tabBarActive: "#38bdf8",
    tabBarInactive: "#64748b",
  },
  budgetColors: {
    indigo: "#6366f1",
    emerald: "#10b981",
    rose: "#f43f5e",
    amber: "#f59e0b",
    sky: "#0ea5e9",
    violet: "#8b5cf6",
  } as Record<string, string>,
  radius: {
    sm: 6,
    md: 10, // 0.625rem matching web --radius
    lg: 14,
    full: 9999,
  },
  typography: {
    title: {
      fontSize: 24,
      fontWeight: "bold" as const,
      color: "#f8fafc",
    },
    subtitle: {
      fontSize: 14,
      color: "#94a3b8",
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: "#38bdf8",
    },
  },
} as const
