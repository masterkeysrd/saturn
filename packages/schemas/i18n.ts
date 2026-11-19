import * as z from "zod"
import {
  normalizeUserLocale,
  resolveUILanguage,
  translateSchemaKey,
  type SchemaTranslationKey,
} from "@saturn/i18n"

let activeSchemaLocale = "en-US"

export function schemaMessage(
  key: SchemaTranslationKey,
  params?: Record<string, string | number>,
  locale?: string | null
): string {
  return translateSchemaKey(locale ?? activeSchemaLocale, key, params)
}

export function schemaError(
  key: SchemaTranslationKey,
  params?: Record<string, string | number>
): () => string {
  return () => translateSchemaKey(activeSchemaLocale, key, params)
}

export function configureZodLocale(locale?: string | null): void {
  activeSchemaLocale = normalizeUserLocale(locale)
  z.config(
    resolveUILanguage(activeSchemaLocale) === "es"
      ? z.locales.es()
      : z.locales.en()
  )
}

export function getActiveZodLocale(): string {
  return activeSchemaLocale
}
