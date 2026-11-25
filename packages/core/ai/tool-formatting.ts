import { formatCents, getCurrencySymbol } from "../finance/formatting"
import type { DateInput } from "../timezone"

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

const BASIC_HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#039;": "'",
  "&apos;": "'",
}

function isAsciiAlphaNum(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57)
  )
}

function isAsciiWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f"
}

function findRawElementCloseEnd(
  lower: string,
  fromIndex: number,
  tagName: string
): number {
  const closePrefix = `</${tagName}`
  let pos = fromIndex
  while (pos < lower.length) {
    const idx = lower.indexOf(closePrefix, pos)
    if (idx === -1) return lower.length
    const afterName = idx + closePrefix.length
    if (afterName >= lower.length) return lower.length
    const nextCh = lower[afterName]
    if (nextCh === ">") return afterName + 1
    if (isAsciiWhitespace(nextCh) || nextCh === "/") {
      const gt = lower.indexOf(">", afterName + 1)
      return gt === -1 ? lower.length : gt + 1
    }
    pos = afterName
  }
  return lower.length
}

function decodeBasicHtmlEntities(text: string): string {
  if (!text.includes("&")) return text
  const out: string[] = []
  let pos = 0
  while (pos < text.length) {
    const amp = text.indexOf("&", pos)
    if (amp === -1) {
      out.push(text.slice(pos))
      break
    }
    if (amp > pos) {
      out.push(text.slice(pos, amp))
    }
    const semi = text.indexOf(";", amp + 1)
    if (semi !== -1 && semi - amp <= 10) {
      const entity = text.slice(amp, semi + 1).toLowerCase()
      const mapped = BASIC_HTML_ENTITIES[entity]
      if (mapped !== undefined) {
        out.push(mapped)
        pos = semi + 1
        continue
      }
    }
    out.push("&")
    pos = amp + 1
  }
  return out.join("")
}

export function stripHtmlTags(html: string): string {
  if (!html) return ""

  const lower = html.toLowerCase()
  const parts: string[] = []
  let pos = 0

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      parts.push(html.slice(pos))
      break
    }
    if (lt > pos) {
      parts.push(html.slice(pos, lt))
    }

    if (html.startsWith("<!--", lt)) {
      const commentEnd = html.indexOf("-->", lt + 4)
      pos = commentEnd === -1 ? html.length : commentEnd + 3
      continue
    }

    let scan = lt + 1
    let isClosing = false
    if (scan < html.length && html[scan] === "/") {
      isClosing = true
      scan++
    }

    const nameStart = scan
    while (scan < html.length && isAsciiAlphaNum(html.charCodeAt(scan))) {
      scan++
    }
    const tagName = lower.slice(nameStart, scan)
    const hasDelimiter =
      scan < html.length &&
      (isAsciiWhitespace(html[scan]) ||
        html[scan] === "/" ||
        html[scan] === ">")

    const gt = html.indexOf(">", lt + 1)
    if (gt === -1) {
      pos = html.length
      continue
    }

    if (
      !isClosing &&
      hasDelimiter &&
      (tagName === "script" || tagName === "style")
    ) {
      parts.push(" ")
      pos = findRawElementCloseEnd(lower, gt + 1, tagName)
      continue
    }

    if (!isClosing && hasDelimiter && tagName === "br") {
      parts.push("\n")
    } else if (
      isClosing &&
      hasDelimiter &&
      (tagName === "p" ||
        tagName === "div" ||
        tagName === "li" ||
        tagName === "tr" ||
        (tagName.length === 2 &&
          tagName[0] === "h" &&
          tagName[1] >= "1" &&
          tagName[1] <= "6"))
    ) {
      parts.push("\n")
    }

    pos = gt + 1
  }

  const decoded = decodeBasicHtmlEntities(parts.join(""))
  const lines = decoded.split("\n")
  const normalizedLines: string[] = []
  let emptyRun = 0
  for (const line of lines) {
    let end = line.length
    while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) {
      end--
    }
    const trimmedLine = end === line.length ? line : line.slice(0, end)
    if (trimmedLine === "") {
      emptyRun++
      if (emptyRun <= 1) {
        normalizedLines.push("")
      }
    } else {
      emptyRun = 0
      normalizedLines.push(trimmedLine)
    }
  }
  return normalizedLines.join("\n").trim()
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

const OPEN_THINK_SHORT = "<think>"
const OPEN_THINK_LONG = "<thinking>"
const CLOSE_THINK_SHORT = "</think>"
const CLOSE_THINK_LONG = "</thinking>"

function findEarliestTag(
  lower: string,
  fromIndex: number,
  shortTag: string,
  longTag: string
): { index: number; length: number } | null {
  const shortIdx = lower.indexOf(shortTag, fromIndex)
  const longIdx = lower.indexOf(longTag, fromIndex)
  if (shortIdx === -1 && longIdx === -1) return null
  if (shortIdx !== -1 && (longIdx === -1 || shortIdx <= longIdx)) {
    return { index: shortIdx, length: shortTag.length }
  }
  return { index: longIdx, length: longTag.length }
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
  if (!lower.includes(OPEN_THINK_SHORT) && !lower.includes(OPEN_THINK_LONG)) {
    return { thinking: "", text: rawText, hasUnclosedThink: false }
  }

  const thinkingParts: string[] = []
  const visibleChunks: string[] = []
  let cursor = 0
  let hasUnclosedThink = false

  while (cursor < rawText.length) {
    const open = findEarliestTag(
      lower,
      cursor,
      OPEN_THINK_SHORT,
      OPEN_THINK_LONG
    )
    if (!open) {
      visibleChunks.push(rawText.slice(cursor))
      break
    }

    if (open.index > cursor) {
      visibleChunks.push(rawText.slice(cursor, open.index))
    }

    const contentStart = open.index + open.length
    const close = findEarliestTag(
      lower,
      contentStart,
      CLOSE_THINK_SHORT,
      CLOSE_THINK_LONG
    )
    if (!close) {
      hasUnclosedThink = true
      const partial = rawText.slice(contentStart).trim()
      if (partial) {
        thinkingParts.push(partial)
      }
      break
    }

    const inner = rawText.slice(contentStart, close.index).trim()
    if (inner) {
      thinkingParts.push(inner)
    }
    cursor = close.index + close.length
  }

  return {
    thinking: thinkingParts.join("\n\n").trim(),
    text: visibleChunks.join("").trimStart(),
    hasUnclosedThink,
  }
}

export interface TzFormatter {
  format(date: DateInput, options?: Intl.DateTimeFormatOptions): string
}

export interface FormattedFieldEntry {
  key: string
  label: string
  displayValue: string
  isMono?: boolean
}

export interface BooleanFieldLabels {
  yes: string
  no: string
}

export function formatToolDateValue(
  value: string,
  tz: TzFormatter,
  options?: Intl.DateTimeFormatOptions
): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (isDateOnlyLike(trimmed)) {
    return tz.format(trimmed, {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...options,
    })
  }
  if (isIsoTimestampLike(trimmed)) {
    return tz.format(trimmed, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...options,
    })
  }
  return trimmed
}

export function formatToolTimeRange(
  tz: TzFormatter,
  opts: {
    isAllDay?: boolean
    startTime?: string
    endTime?: string
    startDate?: string
    endDate?: string
  }
): string | undefined {
  if (opts.isAllDay || (opts.startDate && !opts.startTime)) {
    if (!opts.startDate) return undefined
    const start = formatToolDateValue(opts.startDate, tz)
    if (opts.endDate && opts.endDate !== opts.startDate) {
      const end = formatToolDateValue(opts.endDate, tz)
      return `${start} → ${end}`
    }
    return start
  }

  if (opts.startTime) {
    const startFormatted = tz.format(opts.startTime, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    if (opts.endTime) {
      const sameDay = opts.startTime.slice(0, 10) === opts.endTime.slice(0, 10)
      const endFormatted = tz.format(
        opts.endTime,
        sameDay
          ? { hour: "numeric", minute: "2-digit" }
          : {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }
      )
      return `${startFormatted} → ${endFormatted}`
    }
    return startFormatted
  }

  return undefined
}

export function formatFieldValue(
  key: string,
  value: unknown,
  tz: TzFormatter,
  siblingRecord?: Record<string, unknown>,
  booleanLabels?: BooleanFieldLabels
): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean")
    return value ? (booleanLabels?.yes ?? "Yes") : (booleanLabels?.no ?? "No")
  if (typeof value === "number") {
    if (isCentsFieldKey(key)) {
      const currency =
        typeof siblingRecord?.currency === "string"
          ? siblingRecord.currency
          : undefined
      return formatCurrencyCents(value, currency)
    }
    return value.toLocaleString()
  }
  if (typeof value === "string") {
    if (isDateOnlyLike(value) || isIsoTimestampLike(value)) {
      return formatToolDateValue(value, tz)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : JSON.stringify(item)
      )
      .join(", ")
  }
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => !isEmptyToolParam(v))
      .map(
        ([k, v]) =>
          `${humanizeFieldLabel(k)}: ${formatFieldValue(
            k,
            v,
            tz,
            value,
            booleanLabels
          )}`
      )
      .join(" · ")
  }
  return String(value)
}

export function buildReadableFieldEntries(
  record: Record<string, unknown>,
  tz: TzFormatter,
  excludeKeys: Set<string> = new Set(),
  booleanLabels?: BooleanFieldLabels
): FormattedFieldEntry[] {
  const entries: FormattedFieldEntry[] = []
  for (const [key, value] of Object.entries(record)) {
    if (excludeKeys.has(key) || isEmptyToolParam(value)) continue
    const labelKey = isCentsFieldKey(key) ? stripCentsSuffix(key) : key
    const label = humanizeFieldLabel(labelKey)
    const displayValue = formatFieldValue(key, value, tz, record, booleanLabels)
    const isId = /(?:^|_)id$/i.test(key) || /Id$/.test(key)
    entries.push({
      key,
      label,
      displayValue,
      isMono: isId,
    })
  }
  return entries
}
