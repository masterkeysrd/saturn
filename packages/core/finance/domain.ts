export function decodeBase64Utf8(base64: string | undefined | null): string {
  if (!base64) return ""
  try {
    const binString = atob(base64)
    const bytes = Uint8Array.from(binString, (m: string) => m.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    if (decoded && decoded.trim().length > 0) {
      return decoded
    }
  } catch {
    // If not base64 encoded text, return the raw string directly
  }
  return base64
}

export function extractDomainFromUrlOrName(input?: string): string {
  if (!input || !input.trim()) return ""
  let clean = input.trim().toLowerCase()
  if (clean.includes("://")) {
    clean = clean.split("://")[1]
  }
  const pathIdx = clean.search(/[/?#]/)
  if (pathIdx !== -1) {
    clean = clean.substring(0, pathIdx)
  }
  if (clean.startsWith("www.")) {
    clean = clean.substring(4)
  }
  if (clean.includes(".") && !clean.includes(" ")) {
    return clean
  }
  return ""
}

export function getInstitutionLogoUrl(domain?: string, name?: string): string {
  const resolvedDomain =
    extractDomainFromUrlOrName(domain) || extractDomainFromUrlOrName(name)
  if (resolvedDomain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolvedDomain)}&sz=64`
  }
  return ""
}

export interface ScheduledItemLike {
  sourceType?: string
  sourceId?: string
  type?: string
  recurringTransaction?: {
    name?: string
  } | null
  metadata?: {
    name?: string
    description?: string
    vendorName?: string
  } | null
}

export interface RecurringTemplateLike {
  id?: string
  name?: string
}

export function getScheduledDisplayName(
  st: ScheduledItemLike,
  recurringTemplates: RecurringTemplateLike[] = []
): string {
  if (st.sourceType === "RECURRENT_TRANSACTION") {
    const matchedTemplate = recurringTemplates.find((e) => e.id === st.sourceId)
    return (
      matchedTemplate?.name ||
      st.recurringTransaction?.name ||
      st.metadata?.vendorName ||
      st.metadata?.description ||
      st.metadata?.name ||
      "Scheduled Obligation"
    )
  }
  if (st.sourceType === "SOURCE_TYPE_UNSPECIFIED" || !st.sourceType) {
    if (st.metadata?.vendorName) return st.metadata.vendorName
    if (st.metadata?.description) return st.metadata.description
    if (st.metadata?.name) return st.metadata.name
  }
  return (
    st.metadata?.description ||
    st.metadata?.name ||
    (st.type === "INCOME" ? "Scheduled Inflow" : "Scheduled Outflow")
  )
}

export type LimitPropagationValue =
  "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY" | "LIMIT_PROPAGATION_CURRENT_PERIOD"

export interface LimitPropagationOption {
  label: string
  value: LimitPropagationValue
  description?: string
}

export const LIMIT_PROPAGATION_OPTIONS: LimitPropagationOption[] = [
  {
    value: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
    label: "Future Periods Only",
    description: "Applies to the current period and all future periods.",
  },
  {
    value: "LIMIT_PROPAGATION_CURRENT_PERIOD",
    label: "Current Period Only",
    description:
      "Applies limit modification only to the current active period.",
  },
]

export const PROPAGATION_OPTIONS = LIMIT_PROPAGATION_OPTIONS
