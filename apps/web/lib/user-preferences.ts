import { normalizeUserLocale } from "@saturn/i18n"
import type { HourCycle, WeekStartsOn } from "@saturn/hooks"

export const USER_PREFS_STORAGE_KEY = "saturn_user_preferences"
export const USER_PREFS_UPDATED_EVENT = "saturn:user-preferences-updated"

export type WebCalendarView = "day" | "week" | "month" | "agenda"
export type MobileCalendarView =
  "agenda" | "day" | "three_day" | "week" | "month"

export interface CachedUserPreferences {
  regional: {
    locale: string
    hourCycle: HourCycle
    weekStartsOn: WeekStartsOn
  }
  mail: {
    autoLoadRemoteContent: boolean
  }
  calendar: {
    webView: WebCalendarView
    mobileView: MobileCalendarView
  }
}

export interface UserPreferencesPatch {
  regional?: Partial<{
    locale: string
    hourCycle: string
    weekStartsOn: number
  }>
  mail?: Partial<{
    autoLoadRemoteContent: boolean
  }>
  calendar?: Partial<{
    webView: string
    mobileView: string
  }>
}

function normalizeWebCalendarView(view?: string | null): WebCalendarView {
  if (
    view === "day" ||
    view === "week" ||
    view === "month" ||
    view === "agenda"
  ) {
    return view
  }
  return "month"
}

function normalizeMobileCalendarView(view?: string | null): MobileCalendarView {
  if (
    view === "agenda" ||
    view === "day" ||
    view === "three_day" ||
    view === "week" ||
    view === "month"
  ) {
    return view
  }
  return "agenda"
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
    regional?: {
      locale?: string | null
      hourCycle?: string | null
      weekStartsOn?: number | null
    } | null
    mail?: {
      autoLoadRemoteContent?: boolean | null
    } | null
    calendar?: {
      webView?: string | null
      mobileView?: string | null
    } | null
  } | null,
  fallbackLocale?: string
): CachedUserPreferences {
  return {
    regional: {
      locale: normalizeUserLocale(
        input?.regional?.locale || fallbackLocale || getDefaultBrowserLocale()
      ),
      hourCycle: input?.regional?.hourCycle === "h23" ? "h23" : "h12",
      weekStartsOn: input?.regional?.weekStartsOn === 1 ? 1 : 0,
    },
    mail: {
      autoLoadRemoteContent: Boolean(input?.mail?.autoLoadRemoteContent),
    },
    calendar: {
      webView: normalizeWebCalendarView(input?.calendar?.webView),
      mobileView: normalizeMobileCalendarView(input?.calendar?.mobileView),
    },
  }
}

export function getCachedUserPreferences(): CachedUserPreferences {
  try {
    const raw = localStorage.getItem(USER_PREFS_STORAGE_KEY)
    if (!raw) {
      return normalizeCachedUserPreferences(null)
    }
    const parsed = JSON.parse(raw) as UserPreferencesPatch
    return normalizeCachedUserPreferences(parsed)
  } catch {
    return normalizeCachedUserPreferences(null)
  }
}

export function setCachedUserPreferences(
  patch: UserPreferencesPatch,
  options?: { emit?: boolean }
): CachedUserPreferences {
  const current = getCachedUserPreferences()
  const next = normalizeCachedUserPreferences(
    {
      regional: {
        locale: patch.regional?.locale ?? current.regional.locale,
        hourCycle: patch.regional?.hourCycle ?? current.regional.hourCycle,
        weekStartsOn:
          patch.regional?.weekStartsOn ?? current.regional.weekStartsOn,
      },
      mail: {
        autoLoadRemoteContent:
          patch.mail?.autoLoadRemoteContent ??
          current.mail.autoLoadRemoteContent,
      },
      calendar: {
        webView: patch.calendar?.webView ?? current.calendar.webView,
        mobileView: patch.calendar?.mobileView ?? current.calendar.mobileView,
      },
    },
    current.regional.locale
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
