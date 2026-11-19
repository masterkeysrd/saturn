import enEnumsJson from "./enums/en.json"
import esEnumsJson from "./enums/es.json"
import { resolveUILanguage, type UILanguage } from "./locales"
import { translate, type TranslationKey } from "./translate"

export type EnumCatalog = typeof enEnumsJson
export type EnumDomain = keyof EnumCatalog
export type EnumGroup<D extends EnumDomain> = keyof EnumCatalog[D]

type EnumCatalogShape<T> = {
  [D in keyof T]: {
    [G in keyof T[D]]: Record<keyof T[D][G], string>
  }
}

const checkedEnEnums: EnumCatalogShape<EnumCatalog> = enEnumsJson
const checkedEsEnums: EnumCatalogShape<EnumCatalog> = esEnumsJson

export const enEnums: EnumCatalogShape<EnumCatalog> = checkedEnEnums
export const esEnums: EnumCatalogShape<EnumCatalog> = checkedEsEnums

const ENUM_CATALOGS_BY_LANGUAGE: Record<
  UILanguage,
  EnumCatalogShape<EnumCatalog>
> = {
  en: enEnums,
  es: esEnums,
}

interface EnumNormalizationRule {
  stripPrefix?: RegExp
  defaultValue?: string
}

const ENUM_NORMALIZATION_RULES: Partial<
  Record<`${string}.${string}`, EnumNormalizationRule>
> = {
  "finance.interval": {
    stripPrefix: /^(?:RECURRENCE_)?INTERVAL_/,
    defaultValue: "MONTHLY",
  },
  "finance.status": {
    stripPrefix: /^(?:RECURRING_(?:EXPENSE|TRANSACTION)_)?STATUS_/,
    defaultValue: "ACTIVE",
  },
  "finance.transactionType": {
    stripPrefix: /^TRANSACTION_TYPE_/,
  },
  "finance.accountType": {
    stripPrefix: /^ACCOUNT_TYPE_/,
  },
  "space.role": {
    stripPrefix: /^(?:SPACE_)?ROLE_/,
  },
  "workflow.runStatus": {
    stripPrefix: /^(?:FLOW_RUN_|WORKFLOW_RUN_|RUN_)?STATUS_/,
  },
}

function normalizeEnumValue(
  domain: string,
  enumGroup: string,
  rawValue: string | undefined | null
): string {
  const rule = ENUM_NORMALIZATION_RULES[`${domain}.${enumGroup}`]
  let normalized = rawValue?.trim().toUpperCase() ?? ""
  if (normalized && rule?.stripPrefix) {
    normalized = normalized.replace(rule.stripPrefix, "")
  }
  if ((!normalized || normalized === "UNSPECIFIED") && rule?.defaultValue) {
    return rule.defaultValue
  }
  return normalized
}

export function getLocalizedEnumLabel<
  D extends EnumDomain,
  G extends EnumGroup<D>,
>(
  domain: D,
  enumGroup: G,
  rawValue: string | undefined | null,
  locale?: string | null
): string {
  const lang = resolveUILanguage(locale)
  const dict = ENUM_CATALOGS_BY_LANGUAGE[lang][domain][enumGroup] as Record<
    string,
    string
  >
  const key = normalizeEnumValue(String(domain), String(enumGroup), rawValue)
  if (!key) return ""
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key]
  }
  const humanized = key.replace(/_/g, " ").toLowerCase()
  return humanized.charAt(0).toUpperCase() + humanized.slice(1)
}

export function getLocalizedIntervalLabel(
  interval: string | undefined | null,
  locale?: string | null
): string {
  return getLocalizedEnumLabel("finance", "interval", interval, locale)
}

export function getLocalizedStatusLabel(
  status: string | undefined | null,
  locale?: string | null
): string {
  return getLocalizedEnumLabel("finance", "status", status, locale)
}

export function getLocalizedSpaceRoleLabel(
  role: string | undefined | null,
  locale?: string | null
): string {
  return getLocalizedEnumLabel("space", "role", role, locale)
}

export function getLocalizedWorkflowRunStatusLabel(
  status: string | undefined | null,
  locale?: string | null
): string {
  return getLocalizedEnumLabel("workflow", "runStatus", status, locale)
}

export type I18nDashboardWidgetId =
  | "ai_quick_ask"
  | "net_worth"
  | "budget_pace"
  | "upcoming_bills"
  | "today_schedule"
  | "priority_mail"
  | "workflow_runs"

export interface LocalizedDashboardWidgetMeta<
  TId extends string = I18nDashboardWidgetId,
> {
  id: TId
  title: string
  description: string
  empty: string
}

export function getLocalizedDashboardWidgetMeta<
  TId extends I18nDashboardWidgetId,
>(id: TId, locale?: string | null): LocalizedDashboardWidgetMeta<TId> {
  return {
    id,
    title: translate(locale, `dashboard.widget.${id}.title` as TranslationKey),
    description: translate(
      locale,
      `dashboard.widget.${id}.description` as TranslationKey
    ),
    empty: translate(locale, `dashboard.widget.${id}.empty` as TranslationKey),
  }
}

export interface LocalizedDashboardPresetMeta {
  id: string
  label: string
  description: string
}

const PRESET_KEY_PREFIX: Record<string, string> = {
  default: "dashboard.preset.default",
  finance: "dashboard.preset.finance",
  comms: "dashboard.preset.comms",
  automation: "dashboard.preset.automation",
  balanced: "preset.balanced",
  finance_first: "preset.finance_first",
  daily_ops: "preset.daily_ops",
  minimal: "preset.minimal",
}

export function getLocalizedDashboardPresetMeta(
  id: string,
  locale?: string | null
): LocalizedDashboardPresetMeta {
  const keyPrefix = PRESET_KEY_PREFIX[id] ?? "dashboard.preset.default"
  return {
    id,
    label: translate(locale, `${keyPrefix}.label` as TranslationKey),
    description: translate(
      locale,
      `${keyPrefix}.description` as TranslationKey
    ),
  }
}
