export interface SemanticColorPalette {
  background: string
  surface: string
  surfaceElevated: string
  surfaceSubtle: string
  surfaceHighlight: string
  border: string
  borderStrong: string
  borderFocus: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  primary: string
  primaryForeground: string
  primaryDark: string
  primarySubtle: string
  brandSecondary: string
  brandSecondarySubtle: string
  accent: string
  destructive: string
  destructiveSubtle: string
  destructiveBorder: string
  success: string
  successSubtle: string
  successBorder: string
  warning: string
  warningSubtle: string
  warningBorder: string
  info: string
  infoSubtle: string
  infoBorder: string
  tabBar: string
  tabBarBorder: string
  tabBarActive: string
  tabBarInactive: string
  syntaxKey: string
  syntaxString: string
  syntaxNumber: string
  syntaxBoolean: string
  syntaxNull: string
  syntaxPunctuation: string
}

export const lightColors: SemanticColorPalette = {
  background: "#f6f9fb",
  surface: "#ffffff",
  surfaceElevated: "#ffffff",
  surfaceSubtle: "#edf3f7",
  surfaceHighlight: "#e5eef4",
  border: "rgba(15, 23, 42, 0.10)",
  borderStrong: "#cbd5e1",
  borderFocus: "#0c7e95",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  primary: "#0c7e95",
  primaryForeground: "#f8feff",
  primaryDark: "#096275",
  primarySubtle: "rgba(12, 126, 149, 0.10)",
  brandSecondary: "#5449e6",
  brandSecondarySubtle: "rgba(84, 73, 230, 0.10)",
  accent: "#5449e6",
  destructive: "#dc2626",
  destructiveSubtle: "rgba(220, 38, 38, 0.10)",
  destructiveBorder: "rgba(220, 38, 38, 0.28)",
  success: "#059669",
  successSubtle: "rgba(5, 150, 105, 0.10)",
  successBorder: "rgba(5, 150, 105, 0.28)",
  warning: "#d97706",
  warningSubtle: "rgba(217, 119, 6, 0.11)",
  warningBorder: "rgba(217, 119, 6, 0.28)",
  info: "#0284c7",
  infoSubtle: "rgba(2, 132, 199, 0.10)",
  infoBorder: "rgba(2, 132, 199, 0.28)",
  tabBar: "#ffffff",
  tabBarBorder: "#e2e8f0",
  tabBarActive: "#0c7e95",
  tabBarInactive: "#64748b",
  syntaxKey: "#0369a1",
  syntaxString: "#047857",
  syntaxNumber: "#b45309",
  syntaxBoolean: "#4f46e5",
  syntaxNull: "#64748b",
  syntaxPunctuation: "#64748b",
}

export const darkColors: SemanticColorPalette = {
  background: "#090d16",
  surface: "#111827",
  surfaceElevated: "#182235",
  surfaceSubtle: "#0d131f",
  surfaceHighlight: "#1e293b",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "#334155",
  borderFocus: "#4de2cf",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  primary: "#4de2cf",
  primaryForeground: "#09131c",
  primaryDark: "#2dd4bf",
  primarySubtle: "rgba(77, 226, 207, 0.12)",
  brandSecondary: "#818cf8",
  brandSecondarySubtle: "rgba(129, 140, 248, 0.14)",
  accent: "#818cf8",
  destructive: "#fb7185",
  destructiveSubtle: "rgba(251, 113, 133, 0.12)",
  destructiveBorder: "rgba(251, 113, 133, 0.30)",
  success: "#34d399",
  successSubtle: "rgba(52, 211, 153, 0.12)",
  successBorder: "rgba(52, 211, 153, 0.30)",
  warning: "#fbbf24",
  warningSubtle: "rgba(251, 191, 36, 0.12)",
  warningBorder: "rgba(251, 191, 36, 0.30)",
  info: "#38bdf8",
  infoSubtle: "rgba(56, 189, 248, 0.12)",
  infoBorder: "rgba(56, 189, 248, 0.30)",
  tabBar: "#0d131f",
  tabBarBorder: "rgba(255, 255, 255, 0.09)",
  tabBarActive: "#4de2cf",
  tabBarInactive: "#64748b",
  syntaxKey: "#7dd3fc",
  syntaxString: "#6ee7b7",
  syntaxNumber: "#fcd34d",
  syntaxBoolean: "#a5b4fc",
  syntaxNull: "#94a3b8",
  syntaxPunctuation: "#64748b",
}

export const CATEGORICAL_HUES = [
  "teal",
  "sky",
  "blue",
  "indigo",
  "violet",
  "plum",
  "pink",
  "coral",
  "orange",
  "amber",
  "lime",
  "emerald",
] as const

export type CategoricalHue = (typeof CATEGORICAL_HUES)[number]

export interface CategoricalTone {
  bg: string
  border: string
  text: string
  bar: string
}

export interface CategoricalColorToken {
  value: CategoricalHue
  label: string
  hex: string
  light: CategoricalTone
  dark: CategoricalTone
}

export const CATEGORICAL_PALETTE: readonly CategoricalColorToken[] = [
  {
    value: "teal",
    label: "Teal",
    hex: "#0d9488",
    light: {
      bg: "rgba(13, 148, 136, 0.10)",
      border: "rgba(13, 148, 136, 0.28)",
      text: "#0f766e",
      bar: "#0d9488",
    },
    dark: {
      bg: "rgba(45, 212, 191, 0.12)",
      border: "rgba(45, 212, 191, 0.30)",
      text: "#2dd4bf",
      bar: "#14b8a6",
    },
  },
  {
    value: "sky",
    label: "Sky",
    hex: "#0ea5e9",
    light: {
      bg: "rgba(14, 165, 233, 0.10)",
      border: "rgba(14, 165, 233, 0.28)",
      text: "#0369a1",
      bar: "#0ea5e9",
    },
    dark: {
      bg: "rgba(56, 189, 248, 0.12)",
      border: "rgba(56, 189, 248, 0.30)",
      text: "#38bdf8",
      bar: "#0ea5e9",
    },
  },
  {
    value: "blue",
    label: "Blue",
    hex: "#3b82f6",
    light: {
      bg: "rgba(59, 130, 246, 0.10)",
      border: "rgba(59, 130, 246, 0.28)",
      text: "#1d4ed8",
      bar: "#3b82f6",
    },
    dark: {
      bg: "rgba(96, 165, 250, 0.12)",
      border: "rgba(96, 165, 250, 0.30)",
      text: "#60a5fa",
      bar: "#3b82f6",
    },
  },
  {
    value: "indigo",
    label: "Indigo",
    hex: "#6366f1",
    light: {
      bg: "rgba(99, 102, 241, 0.10)",
      border: "rgba(99, 102, 241, 0.28)",
      text: "#4338ca",
      bar: "#6366f1",
    },
    dark: {
      bg: "rgba(129, 140, 248, 0.12)",
      border: "rgba(129, 140, 248, 0.30)",
      text: "#818cf8",
      bar: "#6366f1",
    },
  },
  {
    value: "violet",
    label: "Violet",
    hex: "#8b5cf6",
    light: {
      bg: "rgba(139, 92, 246, 0.10)",
      border: "rgba(139, 92, 246, 0.28)",
      text: "#6d28d9",
      bar: "#8b5cf6",
    },
    dark: {
      bg: "rgba(167, 139, 250, 0.12)",
      border: "rgba(167, 139, 250, 0.30)",
      text: "#a78bfa",
      bar: "#8b5cf6",
    },
  },
  {
    value: "plum",
    label: "Plum",
    hex: "#a855f7",
    light: {
      bg: "rgba(168, 85, 247, 0.10)",
      border: "rgba(168, 85, 247, 0.28)",
      text: "#7e22ce",
      bar: "#a855f7",
    },
    dark: {
      bg: "rgba(192, 132, 252, 0.12)",
      border: "rgba(192, 132, 252, 0.30)",
      text: "#c084fc",
      bar: "#a855f7",
    },
  },
  {
    value: "pink",
    label: "Pink",
    hex: "#ec4899",
    light: {
      bg: "rgba(236, 72, 153, 0.10)",
      border: "rgba(236, 72, 153, 0.28)",
      text: "#be185d",
      bar: "#ec4899",
    },
    dark: {
      bg: "rgba(244, 114, 182, 0.12)",
      border: "rgba(244, 114, 182, 0.30)",
      text: "#f472b6",
      bar: "#ec4899",
    },
  },
  {
    value: "coral",
    label: "Coral",
    hex: "#f43f5e",
    light: {
      bg: "rgba(244, 63, 94, 0.10)",
      border: "rgba(244, 63, 94, 0.28)",
      text: "#be123c",
      bar: "#f43f5e",
    },
    dark: {
      bg: "rgba(251, 113, 133, 0.12)",
      border: "rgba(251, 113, 133, 0.30)",
      text: "#fb7185",
      bar: "#f43f5e",
    },
  },
  {
    value: "orange",
    label: "Orange",
    hex: "#f97316",
    light: {
      bg: "rgba(249, 115, 22, 0.10)",
      border: "rgba(249, 115, 22, 0.28)",
      text: "#c2410c",
      bar: "#f97316",
    },
    dark: {
      bg: "rgba(251, 146, 60, 0.12)",
      border: "rgba(251, 146, 60, 0.30)",
      text: "#fb923c",
      bar: "#f97316",
    },
  },
  {
    value: "amber",
    label: "Amber",
    hex: "#f59e0b",
    light: {
      bg: "rgba(245, 158, 11, 0.11)",
      border: "rgba(245, 158, 11, 0.28)",
      text: "#b45309",
      bar: "#f59e0b",
    },
    dark: {
      bg: "rgba(251, 191, 36, 0.12)",
      border: "rgba(251, 191, 36, 0.30)",
      text: "#fbbf24",
      bar: "#f59e0b",
    },
  },
  {
    value: "lime",
    label: "Lime",
    hex: "#84cc16",
    light: {
      bg: "rgba(132, 204, 22, 0.11)",
      border: "rgba(132, 204, 22, 0.28)",
      text: "#4d7c0f",
      bar: "#84cc16",
    },
    dark: {
      bg: "rgba(163, 230, 53, 0.12)",
      border: "rgba(163, 230, 53, 0.30)",
      text: "#a3e635",
      bar: "#84cc16",
    },
  },
  {
    value: "emerald",
    label: "Emerald",
    hex: "#10b981",
    light: {
      bg: "rgba(16, 185, 129, 0.10)",
      border: "rgba(16, 185, 129, 0.28)",
      text: "#047857",
      bar: "#10b981",
    },
    dark: {
      bg: "rgba(52, 211, 153, 0.12)",
      border: "rgba(52, 211, 153, 0.30)",
      text: "#34d399",
      bar: "#10b981",
    },
  },
] as const

const LEGACY_COLOR_ALIASES: Record<string, CategoricalHue> = {
  rose: "coral",
}

export const CATEGORICAL_HEX_MAP: Record<CategoricalHue, string> & {
  rose: string
} = {
  teal: "#0d9488",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  plum: "#a855f7",
  pink: "#ec4899",
  coral: "#f43f5e",
  orange: "#f97316",
  amber: "#f59e0b",
  lime: "#84cc16",
  emerald: "#10b981",
  rose: "#f43f5e",
}

export function resolveCategoricalHue(color?: string | null): CategoricalHue {
  if (!color) return "indigo"
  const normalized = color.toLowerCase()
  const aliased = LEGACY_COLOR_ALIASES[normalized] ?? normalized
  const match = CATEGORICAL_PALETTE.find((item) => item.value === aliased)
  return match ? match.value : "indigo"
}

export function getCategoricalColor(
  color?: string | null
): CategoricalColorToken {
  const hue = resolveCategoricalHue(color)
  return (
    CATEGORICAL_PALETTE.find((item) => item.value === hue) ||
    CATEGORICAL_PALETTE[3]
  )
}
