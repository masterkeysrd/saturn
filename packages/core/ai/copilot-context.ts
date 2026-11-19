export type CopilotEntityKind =
  | "transaction"
  | "budget"
  | "account"
  | "statement"
  | "mail_thread"
  | "calendar_event"
  | "workflow"

export interface CopilotEntityRef {
  key: string
  kind: CopilotEntityKind
  id: string
  label: string
  summary?: Record<string, string | number | boolean>
}

export interface CopilotViewRegistration {
  viewId: string
  title: string
  activeEntity?: CopilotEntityRef
  suggestions?: string[]
}

const VALID_COPILOT_ENTITY_KINDS = new Set<string>([
  "transaction",
  "budget",
  "account",
  "statement",
  "mail_thread",
  "calendar_event",
  "workflow",
])

const OPEN_TAG = "<attached_context>"
const CLOSE_TAG = "</attached_context>"

export function buildCopilotEntityKey(
  kind: CopilotEntityKind,
  id: string
): string {
  return `${kind}:${id}`
}

export function isValidCopilotEntityKind(
  kind: unknown
): kind is CopilotEntityKind {
  return typeof kind === "string" && VALID_COPILOT_ENTITY_KINDS.has(kind)
}

function sanitizeSummary(
  raw: unknown
): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined
  }
  const out: Record<string, string | number | boolean> = {}
  let hasEntries = false
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof v === "string" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      typeof v === "boolean"
    ) {
      out[k] = v
      hasEntries = true
    }
  }
  return hasEntries ? out : undefined
}

function normalizeCopilotEntityRef(raw: unknown): CopilotEntityRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null
  }
  const obj = raw as Record<string, unknown>
  if (!isValidCopilotEntityKind(obj.kind)) {
    return null
  }
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) {
    return null
  }
  if (typeof obj.label !== "string" || obj.label.trim().length === 0) {
    return null
  }
  const key =
    typeof obj.key === "string" && obj.key.trim().length > 0
      ? obj.key
      : buildCopilotEntityKey(obj.kind, obj.id)
  const summary = sanitizeSummary(obj.summary)

  return summary
    ? { key, kind: obj.kind, id: obj.id, label: obj.label, summary }
    : { key, kind: obj.kind, id: obj.id, label: obj.label }
}

export function deduplicateCopilotEntityRefs(
  refs: CopilotEntityRef[]
): CopilotEntityRef[] {
  if (refs.length <= 1) return refs.slice()
  const seen = new Set<string>()
  const result: CopilotEntityRef[] = []
  for (const ref of refs) {
    const key = ref.key || buildCopilotEntityKey(ref.kind, ref.id)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(ref.key === key ? ref : { ...ref, key })
    }
  }
  return result
}

export function formatCopilotPromptWithContext(
  prompt: string,
  refs: CopilotEntityRef[]
): string {
  if (refs.length === 0) {
    return prompt
  }
  const deduped = deduplicateCopilotEntityRefs(refs)
  return `${OPEN_TAG}\n${JSON.stringify(deduped)}\n${CLOSE_TAG}\n\n${prompt}`
}

export function parseCopilotMessageContext(text: string): {
  refs: CopilotEntityRef[]
  cleanText: string
} {
  if (!text || !text.startsWith(OPEN_TAG)) {
    return { refs: [], cleanText: text }
  }

  const closeIdx = text.indexOf(CLOSE_TAG, OPEN_TAG.length)
  if (closeIdx === -1) {
    return { refs: [], cleanText: text }
  }

  const jsonSlice = text.slice(OPEN_TAG.length, closeIdx).trim()
  if (!jsonSlice) {
    return { refs: [], cleanText: text }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonSlice)
  } catch {
    return { refs: [], cleanText: text }
  }

  if (!Array.isArray(parsed)) {
    return { refs: [], cleanText: text }
  }

  const refs: CopilotEntityRef[] = []
  for (const item of parsed) {
    const normalized = normalizeCopilotEntityRef(item)
    if (normalized) {
      refs.push(normalized)
    }
  }

  if (refs.length === 0) {
    return { refs: [], cleanText: text }
  }

  let bodyStart = closeIdx + CLOSE_TAG.length
  while (
    bodyStart < text.length &&
    (text[bodyStart] === "\r" || text[bodyStart] === "\n")
  ) {
    bodyStart += 1
  }

  return {
    refs: deduplicateCopilotEntityRefs(refs),
    cleanText: text.slice(bodyStart),
  }
}
