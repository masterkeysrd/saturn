export type JsonSyntaxTokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "whitespace"
  | "plain"

export interface JsonSyntaxToken {
  type: JsonSyntaxTokenType
  value: string
}

const MAX_NESTED_JSON_DEPTH = 8
const DEFAULT_MAX_TOKENIZE_LENGTH = 65536

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function tryParseJsonObjectOrArray(raw: string): unknown {
  const trimmed = raw.trim()
  if (!(
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  )) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (
      Array.isArray(parsed) ||
      (typeof parsed === "object" && parsed !== null)
    ) {
      return parsed
    }
    return undefined
  } catch {
    return undefined
  }
}

function unwrapNestedJsonStringsValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_NESTED_JSON_DEPTH) {
    return value
  }

  if (typeof value === "string") {
    const parsed = tryParseJsonObjectOrArray(value)
    if (parsed !== undefined) {
      return unwrapNestedJsonStringsValue(parsed, depth + 1)
    }
    return value
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const unwrapped = unwrapNestedJsonStringsValue(item, depth + 1)
      if (unwrapped !== item) {
        changed = true
      }
      return unwrapped
    })
    return changed ? next : value
  }

  if (isPlainObject(value)) {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, propValue] of Object.entries(value)) {
      const unwrapped = unwrapNestedJsonStringsValue(propValue, depth + 1)
      if (unwrapped !== propValue) {
        changed = true
      }
      next[key] = unwrapped
    }
    return changed ? next : value
  }

  return value
}

export function prettifyJsonValue(
  input: unknown,
  options?: { unwrapNestedJsonStrings?: boolean }
): string {
  if (input === undefined) {
    return ""
  }

  let resolved: unknown = input
  if (typeof input === "string") {
    const parsed = tryParseJsonObjectOrArray(input)
    if (parsed === undefined) {
      return input
    }
    resolved = parsed
  }

  if (options?.unwrapNestedJsonStrings !== false) {
    resolved = unwrapNestedJsonStringsValue(resolved, 0)
  }

  try {
    return JSON.stringify(resolved, null, 2) ?? ""
  } catch {
    return String(resolved)
  }
}

function isWhitespaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13
}

function isHorizontalWhitespaceCode(code: number): boolean {
  return code === 32 || code === 9
}

function isDigitCode(code: number): boolean {
  return code >= 48 && code <= 57
}

function isWordCharCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 36
  )
}

function isPunctuationCode(code: number): boolean {
  return (
    code === 123 || // {
    code === 125 || // }
    code === 91 || // [
    code === 93 || // ]
    code === 58 || // :
    code === 44 // ,
  )
}

function scanJsonNumberEnd(input: string, start: number): number {
  const len = input.length
  let pos = start

  if (pos < len && input.charCodeAt(pos) === 45) {
    pos++
  }

  const intStart = pos
  while (pos < len && isDigitCode(input.charCodeAt(pos))) {
    pos++
  }
  if (pos === intStart) {
    return -1
  }

  if (pos < len && input.charCodeAt(pos) === 46) {
    pos++
    const fracStart = pos
    while (pos < len && isDigitCode(input.charCodeAt(pos))) {
      pos++
    }
    if (pos === fracStart) {
      return -1
    }
  }

  if (pos < len) {
    const expCode = input.charCodeAt(pos)
    if (expCode === 101 || expCode === 69) {
      pos++
      if (pos < len) {
        const signCode = input.charCodeAt(pos)
        if (signCode === 43 || signCode === 45) {
          pos++
        }
      }
      const expDigitsStart = pos
      while (pos < len && isDigitCode(input.charCodeAt(pos))) {
        pos++
      }
      if (pos === expDigitsStart) {
        return -1
      }
    }
  }

  if (
    pos < len &&
    (isWordCharCode(input.charCodeAt(pos)) || input.charCodeAt(pos) === 46)
  ) {
    return -1
  }

  return pos
}

function pushToken(
  tokens: JsonSyntaxToken[],
  type: JsonSyntaxTokenType,
  value: string
): void {
  if (type === "plain" && tokens.length > 0) {
    const prev = tokens[tokens.length - 1]
    if (prev.type === "plain") {
      prev.value += value
      return
    }
  }
  tokens.push({ type, value })
}

export function tokenizeJson(
  input: string,
  options?: { maxLength?: number }
): JsonSyntaxToken[] {
  if (!input) {
    return []
  }

  const maxLength = options?.maxLength ?? DEFAULT_MAX_TOKENIZE_LENGTH
  if (input.length > maxLength) {
    return [{ type: "plain", value: input }]
  }

  const tokens: JsonSyntaxToken[] = []
  const len = input.length
  let i = 0

  while (i < len) {
    const code = input.charCodeAt(i)

    if (isWhitespaceCode(code)) {
      let j = i + 1
      while (j < len && isWhitespaceCode(input.charCodeAt(j))) {
        j++
      }
      tokens.push({ type: "whitespace", value: input.slice(i, j) })
      i = j
      continue
    }

    if (code === 34) {
      let j = i + 1
      let closed = false
      while (j < len) {
        const c = input.charCodeAt(j)
        if (c === 92) {
          j = Math.min(j + 2, len)
        } else if (c === 34) {
          j++
          closed = true
          break
        } else {
          j++
        }
      }

      let tokenType: JsonSyntaxTokenType = "string"
      if (closed) {
        let k = j
        while (k < len && isHorizontalWhitespaceCode(input.charCodeAt(k))) {
          k++
        }
        if (k < len && input.charCodeAt(k) === 58) {
          tokenType = "key"
        }
      }

      tokens.push({ type: tokenType, value: input.slice(i, j) })
      i = j
      continue
    }

    if (isPunctuationCode(code)) {
      tokens.push({ type: "punctuation", value: input[i] })
      i++
      continue
    }

    const atWordStart = i === 0 || !isWordCharCode(input.charCodeAt(i - 1))
    if (atWordStart) {
      if (
        code === 116 &&
        input.startsWith("true", i) &&
        (i + 4 === len || !isWordCharCode(input.charCodeAt(i + 4)))
      ) {
        tokens.push({ type: "boolean", value: "true" })
        i += 4
        continue
      }

      if (
        code === 102 &&
        input.startsWith("false", i) &&
        (i + 5 === len || !isWordCharCode(input.charCodeAt(i + 5)))
      ) {
        tokens.push({ type: "boolean", value: "false" })
        i += 5
        continue
      }

      if (
        code === 110 &&
        input.startsWith("null", i) &&
        (i + 4 === len || !isWordCharCode(input.charCodeAt(i + 4)))
      ) {
        tokens.push({ type: "null", value: "null" })
        i += 4
        continue
      }

      if (code === 45 || isDigitCode(code)) {
        const numEnd = scanJsonNumberEnd(input, i)
        if (numEnd !== -1) {
          tokens.push({ type: "number", value: input.slice(i, numEnd) })
          i = numEnd
          continue
        }
      }
    }

    pushToken(tokens, "plain", input[i])
    i++
  }

  return tokens
}
