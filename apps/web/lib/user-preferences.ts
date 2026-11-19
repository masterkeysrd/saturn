import { normalizeUserLocale } from "@saturn/i18n"
import type { HourCycle, WeekStartsOn } from "@saturn/hooks"

export const USER_PREFS_STORAGE_KEY = "saturn_user_preferences"
export const USER_PREFS_UPDATED_EVENT = "saturn:user-preferences-updated"

export interface CachedUserPreferences {
  locale: string
  hourCycle: HourCycle
  weekStartsOn: WeekStartsOn
}

export function getDefaultBrowserLocale(): string {
  try {
    if (typeof navigator !== "undefined" && navigator.language) {
      return normalizeUserLocale(navigator.language)
    }
  } catch {
    // ignore
  }
  return "en-US"
}

export function normalizeCachedUserPreferences(
  input?: {
    locale?: string | null
    hourCycle?: string | null
    weekStartsOn?: number | null
  } | null,
  fallbackLocale?: string
): CachedUserPreferences {
  return {
    locale: normalizeUserLocale(
      input?.locale || fallbackLocale || getDefaultBrowserLocale()
    ),
    hourCycle: input?.hourCycle === "h23" ? "h23" : "h12",
    weekStartsOn: input?.weekStartsOn === 1 ? 1 : 0,
  }
}

export function getCachedUserPreferences(): CachedUserPreferences {
  try {
    const raw = localStorage.getItem(USER_PREFS_STORAGE_KEY)
    if (!raw) {
      return normalizeCachedUserPreferences(null)
    }
    const parsed = JSON.parse(raw) as Partial<CachedUserPreferences>
    return normalizeCachedUserPreferences(parsed)
  } catch {
    return normalizeCachedUserPreferences(null)
  }
}

export function setCachedUserPreferences(
  patch: Partial<{
    locale: string
    hourCycle: string
    weekStartsOn: number
  }>,
  options?: { emit?: boolean }
): CachedUserPreferences {
  const current = getCachedUserPreferences()
  const next = normalizeCachedUserPreferences(
    {
      locale: patch.locale ?? current.locale,
      hourCycle: patch.hourCycle ?? current.hourCycle,
      weekStartsOn: patch.weekStartsOn ?? current.weekStartsOn,
    },
    current.locale
  )
  try {
    localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(next))
    if (options?.emit !== false && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<CachedUserPreferences>(USER_PREFS_UPDATED_EVENT, {
          detail: next,
        })
      )
    }
  } catch {
    // ignore storage errors in restricted environments
  }
  return next
}
