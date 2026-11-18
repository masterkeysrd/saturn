import { formatCents, getCurrencySymbol } from "../finance/formatting"

export function isPlainRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function tryParseJSON(raw: string): unknown {
  const trimmed = raw.trim()
  if (!(
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  )) {
    return undefined
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

const MCP_ENVELOPE_KEYS = new Set([
  "content",
  "isError",
  "is_error",
  "meta",
  "_meta",
  "structuredContent",
])

function extractTextFromContentArray(content: unknown[]): string {
  const parts: string[] = []
  for (const item of content) {
    if (typeof item === "string") {
      if (item.trim()) parts.push(item)
      continue
    }
    if (isPlainRecord(item) && typeof item.text === "string") {
      if (item.type === undefined || item.type === "text") {
        if (item.text.trim()) parts.push(item.text)
      }
    }
  }
  return parts.join("\n").trim()
}

export function unwrapToolResult(
  result: unknown
): Record<string, unknown> | undefined {
  if (result === undefined || result === null) {
    return undefined
  }

  if (typeof result === "string") {
    const trimmed = result.trim()
    if (!trimmed) return undefined
    const parsed = tryParseJSON(trimmed)
    if (isPlainRecord(parsed)) {
      return unwrapToolResult(parsed)
    }
    if (Array.isArray(parsed)) {
      return { items: parsed }
    }
    return { text: trimmed }
  }

  if (Array.isArray(result)) {
    const text = extractTextFromContentArray(result)
    if (text) {
      const parsed = tryParseJSON(text)
      if (isPlainRecord(parsed)) {
        return unwrapToolResult(parsed)
      }
      if (Array.isArray(parsed)) {
        return { items: parsed }
      }
      return { text }
    }
    return { items: result }
  }

  if (!isPlainRecord(result)) {
    return { value: result }
  }

  if (isPlainRecord(result.structuredContent)) {
    return result.structuredContent
  }

  if (Array.isArray(result.content)) {
    const hasDomainKeys = Object.keys(result).some(
      (key) => !MCP_ENVELOPE_KEYS.has(key)
    )
    if (!hasDomainKeys) {
      const text = extractTextFromContentArray(result.content)
      if (text) {
        const parsed = tryParseJSON(text)
        if (isPlainRecord(parsed)) {
          return parsed
        }
        if (Array.isArray(parsed)) {
          return { items: parsed }
        }
        return { text }
      }
    }
  }

  return result
}

function extractErrorFromValue(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value === undefined || value === null) {
    return undefined
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = tryParseJSON(trimmed)
    if (parsed !== undefined) {
      return extractErrorFromValue(parsed, depth + 1) ?? trimmed
    }
    return trimmed
  }

  if (Array.isArray(value)) {
    const text = extractTextFromContentArray(value)
    if (!text) return undefined
    return extractErrorFromValue(text, depth + 1) ?? text
  }

  if (isPlainRecord(value)) {
    for (const key of [
      "error",
      "message",
      "detail",
      "error_message",
      "errorMessage",
      "reason",
    ]) {
      if (key in value && value[key] !== undefined && value[key] !== null) {
        const extracted = extractErrorFromValue(value[key], depth + 1)
        if (extracted) return extracted
      }
    }
    if (Array.isArray(value.content)) {
      const fromContent = extractErrorFromValue(value.content, depth + 1)
      if (fromContent) return fromContent
    }
    if (isPlainRecord(value.structuredContent)) {
      const fromStructured = extractErrorFromValue(
        value.structuredContent,
        depth + 1
      )
      if (fromStructured) return fromStructured
    }
    if (typeof value.text === "string" && value.text.trim()) {
      return extractErrorFromValue(value.text, depth + 1) ?? value.text.trim()
    }
  }

  return undefined
}

export function extractToolErrorMessage(
  result: unknown,
  fallbackErrorText?: string
): string | undefined {
  const fromFallback = extractErrorFromValue(fallbackErrorText)
  if (fromFallback) return fromFallback

  const fromResult = extractErrorFromValue(result)
  if (fromResult) return fromResult

  if (isPlainRecord(result) && Object.keys(result).length > 0) {
    return JSON.stringify(result)
  }

  return undefined
}

const ACRONYMS = new Set([
  "id",
  "url",
  "uri",
  "html",
  "json",
  "api",
  "mcp",
  "cc",
  "bcc",
  "ai",
  "utc",
  "iso",
])

export function humanizeFieldLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()

  if (!spaced) return key

  return spaced
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) {
        return lower.toUpperCase()
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(" ")
}

export function isCentsFieldKey(key: string): boolean {
  return /(?:_cents|Cents)$/.test(key)
}

export function stripCentsSuffix(key: string): string {
  return key.replace(/(?:_cents|Cents)$/, "")
}

export function formatCurrencyCents(cents: number, currency?: string): string {
  if (!Number.isFinite(cents)) return "0.00"
  const upper = currency?.trim().toUpperCase() || ""
  const isZeroDecimal = upper === "JPY" || upper === "KRW"
  const sign = cents < 0 ? "-" : ""
  const absMajor = isZeroDecimal
    ? Math.abs(cents)
    : Math.abs(formatCents(cents))
  const formattedNumber = absMajor.toLocaleString(undefined, {
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  })

  if (!upper) {
    return `${sign}${formattedNumber}`
  }

  const symbol = getCurrencySymbol(upper)
  if (symbol && symbol !== upper) {
    return `${sign}${symbol}${formattedNumber} ${upper}`
  }
  return `${sign}${formattedNumber} ${upper}`
}

export function isDateOnlyLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

export function isIsoTimestampLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(
    value.trim()
  )
}

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function isEmptyToolParam(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  if (isPlainRecord(value)) return Object.keys(value).length === 0
  return false
}

export interface SplitThinkingResult {
  thinking: string
  text: string
  hasUnclosedThink: boolean
}

/**
 * Extracts `<think>...</think>` or `<thinking>...</thinking>` blocks emitted inline
 * by reasoning models (such as Qwen3, DeepSeek-R1, OpenRouter, or local GGUF servers),
 * including in-progress unclosed `<think>` blocks during live SSE streaming.
 */
export function splitThinkingFromText(rawText: string): SplitThinkingResult {
  if (!rawText) {
    return { thinking: "", text: "", hasUnclosedThink: false }
  }

  const lower = rawText.toLowerCase()
  if (!lower.includes("<think>") && !lower.includes("<thinking>")) {
    return { thinking: "", text: rawText, hasUnclosedThink: false }
  }

  const thinkingParts: string[] = []
  let cleaned = rawText.replace(
    /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi,
    (_, inner: string) => {
      if (inner.trim()) {
        thinkingParts.push(inner.trim())
      }
      return ""
    }
  )

  let hasUnclosedThink = false
  const openMatch = /<think(?:ing)?>([\s\S]*)$/i.exec(cleaned)
  if (openMatch) {
    hasUnclosedThink = true
    const partial = openMatch[1]?.trim() ?? ""
    if (partial) {
      thinkingParts.push(partial)
    }
    cleaned = cleaned.slice(0, openMatch.index)
  }

  return {
    thinking: thinkingParts.join("\n\n").trim(),
    text: cleaned.trimStart(),
    hasUnclosedThink,
  }
}
