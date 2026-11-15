export interface TemplateToken {
  type: "text" | "expr"
  raw: string
  expr?: string
  start: number
  end: number
}

export interface ParsedTemplateResult {
  tokens: TemplateToken[]
  hasUnclosed: boolean
  hasEmptyExpr: boolean
}

function findClosingBraces(input: string, fromIndex: number): number {
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = fromIndex; i < input.length; i++) {
    const ch = input[i]
    if (escaped) {
      escaped = false
      continue
    }
    if ((inSingle || inDouble) && ch === "\\") {
      escaped = true
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && ch === "}" && input[i + 1] === "}") {
      return i
    }
  }

  return -1
}

/**
 * Parses a template string into literal text and `{{ expr }}` tokens,
 * respecting single/double quoted string literals inside CEL expressions.
 */
export function parseTemplateTokens(input: string): ParsedTemplateResult {
  if (!input) {
    return { tokens: [], hasUnclosed: false, hasEmptyExpr: false }
  }

  const tokens: TemplateToken[] = []
  let pos = 0
  let hasUnclosed = false
  let hasEmptyExpr = false

  while (pos < input.length) {
    const openIdx = input.indexOf("{{", pos)
    if (openIdx === -1) {
      tokens.push({
        type: "text",
        raw: input.slice(pos),
        start: pos,
        end: input.length,
      })
      break
    }

    if (openIdx > pos) {
      tokens.push({
        type: "text",
        raw: input.slice(pos, openIdx),
        start: pos,
        end: openIdx,
      })
    }

    const closeIdx = findClosingBraces(input, openIdx + 2)
    if (closeIdx === -1) {
      hasUnclosed = true
      tokens.push({
        type: "text",
        raw: input.slice(openIdx),
        start: openIdx,
        end: input.length,
      })
      break
    }

    const expr = input.slice(openIdx + 2, closeIdx).trim()
    if (!expr) {
      hasEmptyExpr = true
    }

    tokens.push({
      type: "expr",
      raw: input.slice(openIdx, closeIdx + 2),
      expr,
      start: openIdx,
      end: closeIdx + 2,
    })

    pos = closeIdx + 2
  }

  return { tokens, hasUnclosed, hasEmptyExpr }
}

/**
 * Returns all trimmed CEL expression bodies inside `{{ ... }}` blocks.
 */
export function extractTemplateExpressions(input: string): string[] {
  const { tokens } = parseTemplateTokens(input)
  return tokens
    .filter(
      (t): t is TemplateToken & { expr: string } =>
        t.type === "expr" && Boolean(t.expr)
    )
    .map((t) => t.expr)
}

/**
 * Reports whether the trimmed string consists of exactly one `{{ expr }}` block.
 */
export function isSingleExpressionBlock(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  const { tokens, hasUnclosed, hasEmptyExpr } = parseTemplateTokens(trimmed)
  return (
    !hasUnclosed &&
    !hasEmptyExpr &&
    tokens.length === 1 &&
    tokens[0]?.type === "expr"
  )
}

/**
 * Inserts a CEL variable path into an input string at the given selection range.
 * If `rawMode` is true (e.g. CEL condition inputs) or the cursor is already inside
 * an open `{{ ... }}` block, inserts the bare variable path; otherwise wraps in `{{ ... }}`.
 */
export function insertVariableToken(
  current: string,
  variablePath: string,
  selection?: { start: number; end: number },
  rawMode = false
): { value: string; cursor: number } {
  const start = Math.max(
    0,
    Math.min(selection?.start ?? current.length, current.length)
  )
  const end = Math.max(start, Math.min(selection?.end ?? start, current.length))

  const before = current.slice(0, start)
  const after = current.slice(end)

  const insideOpenBlock =
    !rawMode &&
    (() => {
      const { tokens } = parseTemplateTokens(before)
      const lastOpen = before.lastIndexOf("{{")
      if (lastOpen === -1) return false
      const lastClose = before.lastIndexOf("}}")
      if (lastOpen > lastClose) return true
      return tokens.some(
        (t) => t.type === "expr" && t.start < start && t.end > start
      )
    })()

  const insertion =
    rawMode || insideOpenBlock ? variablePath : `{{ ${variablePath} }}`
  const value = `${before}${insertion}${after}`
  return {
    value,
    cursor: before.length + insertion.length,
  }
}

const VARIABLE_PATH_REGEX =
  /\b(?:input|trigger|steps|loop|sources|space|run)(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+/g

/**
 * Extracts all dotted Saturn namespace variable paths referenced in a CEL expression or template string.
 */
export function extractVariableReferences(input: string): string[] {
  const expressions = input.includes("{{")
    ? extractTemplateExpressions(input)
    : [input]
  const refs = new Set<string>()
  for (const expr of expressions) {
    const matches = expr.match(VARIABLE_PATH_REGEX)
    if (matches) {
      for (const m of matches) {
        refs.add(m)
      }
    }
  }
  return Array.from(refs)
}
