import { resolveUILanguage, type UILanguage } from "./locales"
import enLocale from "./locales/en.json"
import esLocale from "./locales/es.json"

type LeafPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${LeafPaths<T[K]>}`
    }[keyof T & string]

type MatchingLocaleTree<T> = {
  [K in keyof T]: T[K] extends string ? string : MatchingLocaleTree<T[K]>
}

export type TranslationKey = LeafPaths<typeof enLocale>

const checkedEsLocale: MatchingLocaleTree<typeof enLocale> = esLocale

interface LocaleTree {
  [key: string]: string | LocaleTree
}

function flattenMessages(
  tree: LocaleTree,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      out[path] = value
    } else {
      flattenMessages(value, path, out)
    }
  }
  return out
}

export const enMessages: Record<TranslationKey, string> = flattenMessages(
  enLocale
) as Record<TranslationKey, string>

export const esMessages: Record<TranslationKey, string> = flattenMessages(
  checkedEsLocale
) as Record<TranslationKey, string>

const MESSAGE_CATALOGS: Record<UILanguage, Record<TranslationKey, string>> = {
  en: enMessages,
  es: esMessages,
}

export function getMessages(
  locale?: string | null
): Record<TranslationKey, string> {
  return MESSAGE_CATALOGS[resolveUILanguage(locale)]
}

export function translate(
  locale: string | null | undefined,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const lang = resolveUILanguage(locale)
  const template = MESSAGE_CATALOGS[lang][key] ?? enMessages[key] ?? key
  if (!params) return template

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name])
    }
    return match
  })
}
