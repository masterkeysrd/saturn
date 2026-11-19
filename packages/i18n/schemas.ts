import { resolveUILanguage, type UILanguage } from "./locales"
import schemaEn from "./schemas/en.json"
import schemaEs from "./schemas/es.json"

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

export type SchemaTranslationKey = LeafPaths<typeof schemaEn>

const checkedEsSchemaLocale: MatchingLocaleTree<typeof schemaEn> = schemaEs

interface SchemaLocaleTree {
  [key: string]: string | SchemaLocaleTree
}

function flattenSchemaMessages(
  tree: SchemaLocaleTree,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      out[path] = value
    } else {
      flattenSchemaMessages(value, path, out)
    }
  }
  return out
}

export const enSchemaMessages: Record<SchemaTranslationKey, string> =
  flattenSchemaMessages(schemaEn) as Record<SchemaTranslationKey, string>

export const esSchemaMessages: Record<SchemaTranslationKey, string> =
  flattenSchemaMessages(checkedEsSchemaLocale) as Record<
    SchemaTranslationKey,
    string
  >

const SCHEMA_CATALOGS: Record<
  UILanguage,
  Record<SchemaTranslationKey, string>
> = {
  en: enSchemaMessages,
  es: esSchemaMessages,
}

export function translateSchemaKey(
  locale: string | null | undefined,
  key: SchemaTranslationKey,
  params?: Record<string, string | number>
): string {
  const lang = resolveUILanguage(locale)
  const template =
    SCHEMA_CATALOGS[lang][key] ?? enSchemaMessages[key] ?? String(key)
  if (!params) return template

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name])
    }
    return match
  })
}
