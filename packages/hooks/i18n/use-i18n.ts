import { useCallback, useContext, useMemo } from "react"
import {
  SUPPORTED_UI_LOCALES,
  normalizeUserLocale,
  resolveUILanguage,
  translate,
  type SupportedLocaleOption,
  type TranslationKey,
  type UILanguage,
} from "@saturn/i18n"
import { TimezoneContext } from "../timezone/use-timezone"

export interface UseI18nResult {
  locale: string
  language: UILanguage
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  supportedLocales: readonly SupportedLocaleOption[]
}

export function useI18n(): UseI18nResult {
  const context = useContext(TimezoneContext)
  const locale = normalizeUserLocale(context?.locale)
  const language = resolveUILanguage(locale)

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale]
  )

  return useMemo(
    () => ({
      locale,
      language,
      t,
      supportedLocales: SUPPORTED_UI_LOCALES,
    }),
    [locale, language, t]
  )
}
