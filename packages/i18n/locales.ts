export type UILanguage = "en" | "es"

export interface SupportedLocaleOption {
  value: string
  language: UILanguage
  label: string
  englishLabel: string
}

export const SUPPORTED_UI_LOCALES: readonly SupportedLocaleOption[] = [
  {
    value: "en-US",
    language: "en",
    label: "English (US)",
    englishLabel: "English (US)",
  },
  {
    value: "es-ES",
    language: "es",
    label: "Español (España)",
    englishLabel: "Spanish (Spain)",
  },
  {
    value: "es-419",
    language: "es",
    label: "Español (Latinoamérica)",
    englishLabel: "Spanish (Latin America)",
  },
] as const

export function resolveUILanguage(locale?: string | null): UILanguage {
  if (!locale) return "en"
  const normalized = locale.trim().replace(/_/g, "-").toLowerCase()
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es"
  }
  return "en"
}

export function normalizeUserLocale(locale?: string | null): string {
  const candidate = locale?.trim().replace(/_/g, "-")
  if (!candidate) return "en-US"
  try {
    const supported = Intl.NumberFormat.supportedLocalesOf([candidate])
    if (supported.length > 0 && supported[0]) {
      return supported[0]
    }
    return "en-US"
  } catch {
    return "en-US"
  }
}
