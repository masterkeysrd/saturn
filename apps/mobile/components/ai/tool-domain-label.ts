import type { TranslationKey } from "@saturn/i18n"
import type { ToolDomain } from "@saturn/core"

const DOMAIN_LABEL_KEYS: Record<ToolDomain, TranslationKey> = {
  finance: "nav.finance",
  calendar: "nav.calendar",
  mail: "nav.mail",
  workflows: "nav.workflows",
  space: "settings.hub.navWorkspace",
  agent: "ai.domain.agent",
  mcp: "ai.domain.mcp",
  general: "ai.domain.tool",
}

export function getToolDomainLabelKey(domain: ToolDomain): TranslationKey {
  return DOMAIN_LABEL_KEYS[domain]
}
