import type { TranslationKey } from "@saturn/i18n"
import type { APIKeyScope } from "@saturn/schemas"

export const SCOPE_GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  spaces: "settings.apiKeys.groupSpaces",
  finance: "settings.apiKeys.groupFinance",
  calendar: "settings.apiKeys.groupCalendar",
  mail: "settings.apiKeys.groupMail",
  ai: "settings.apiKeys.groupAi",
  workflows: "settings.apiKeys.groupWorkflows",
}

export const SCOPE_LABEL_KEYS: Record<APIKeyScope, TranslationKey> = {
  "spaces:read": "settings.apiKeys.scopeSpacesRead",
  "finance:read": "settings.apiKeys.scopeFinanceRead",
  "finance:write": "settings.apiKeys.scopeFinanceWrite",
  "calendar:read": "settings.apiKeys.scopeCalendarRead",
  "calendar:write": "settings.apiKeys.scopeCalendarWrite",
  "mail:read": "settings.apiKeys.scopeMailRead",
  "mail:write": "settings.apiKeys.scopeMailWrite",
  "ai:read": "settings.apiKeys.scopeAiRead",
  "ai:execute": "settings.apiKeys.scopeAiExecute",
  "ai:write": "settings.apiKeys.scopeAiWrite",
  "workflows:read": "settings.apiKeys.scopeWorkflowsRead",
  "workflows:execute": "settings.apiKeys.scopeWorkflowsExecute",
  "workflows:write": "settings.apiKeys.scopeWorkflowsWrite",
}

export const SCOPE_DESC_KEYS: Record<APIKeyScope, TranslationKey> = {
  "spaces:read": "settings.apiKeys.scopeDescSpacesRead",
  "finance:read": "settings.apiKeys.scopeDescFinanceRead",
  "finance:write": "settings.apiKeys.scopeDescFinanceWrite",
  "calendar:read": "settings.apiKeys.scopeDescCalendarRead",
  "calendar:write": "settings.apiKeys.scopeDescCalendarWrite",
  "mail:read": "settings.apiKeys.scopeDescMailRead",
  "mail:write": "settings.apiKeys.scopeDescMailWrite",
  "ai:read": "settings.apiKeys.scopeDescAiRead",
  "ai:execute": "settings.apiKeys.scopeDescAiExecute",
  "ai:write": "settings.apiKeys.scopeDescAiWrite",
  "workflows:read": "settings.apiKeys.scopeDescWorkflowsRead",
  "workflows:execute": "settings.apiKeys.scopeDescWorkflowsExecute",
  "workflows:write": "settings.apiKeys.scopeDescWorkflowsWrite",
}

export function getScopeGroupLabel(
  t: (key: TranslationKey) => string,
  groupId: string
): string {
  const key = SCOPE_GROUP_LABEL_KEYS[groupId]
  return key ? t(key) : groupId
}

export function getScopeLabel(
  t: (key: TranslationKey) => string,
  scope: string
): string {
  const key = SCOPE_LABEL_KEYS[scope as APIKeyScope]
  return key ? t(key) : scope
}

export function getScopeDescription(
  t: (key: TranslationKey) => string,
  scope: string
): string | null {
  const key = SCOPE_DESC_KEYS[scope as APIKeyScope]
  return key ? t(key) : null
}
