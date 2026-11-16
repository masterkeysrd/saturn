export type TableAlignment = "left" | "center" | "right"

export type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "code"; language?: string; code: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | {
      type: "table"
      headers: string[]
      alignments: TableAlignment[]
      rows: string[][]
    }
  | { type: "hr" }

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes("-")) return false
  return TABLE_SEPARATOR_RE.test(trimmed)
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) {
    trimmed = trimmed.slice(0, -1)
  }

  const cells: string[] = []
  let current = ""
  for (let idx = 0; idx < trimmed.length; idx++) {
    const ch = trimmed[idx]
    if (ch === "\\" && trimmed[idx + 1] === "|") {
      current += "|"
      idx++
      continue
    }
    if (ch === "|") {
      cells.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

function isTableStart(lines: string[], idx: number): boolean {
  if (idx + 1 >= lines.length) return false
  const header = lines[idx].trim()
  const sep = lines[idx + 1].trim()
  return header.includes("|") && isTableSeparator(sep)
}

function parseTableAlignments(
  sepLine: string,
  colCount: number
): TableAlignment[] {
  const parts = splitTableRow(sepLine)
  return Array.from({ length: colCount }, (_, idx) => {
    const cell = (parts[idx] ?? "").trim()
    const left = cell.startsWith(":")
    const right = cell.endsWith(":")
    if (left && right) return "center"
    if (right) return "right"
    return "left"
  })
}

export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const input = raw.replace(/\r\n/g, "\n").trim()
  if (!input) return []

  const lines = input.split("\n")
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    // Fenced code block (supports unclosed fences while streaming)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || undefined
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i++
      }
      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      })
      continue
    }

    // GFM Table (header row + separator row + 0..N body rows)
    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i])
      const alignments = parseTableAlignments(lines[i + 1], headers.length)
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const rowLine = lines[i].trim()
        if (!rowLine || !rowLine.includes("|")) break
        const parsed = splitTableRow(rowLine)
        const normalized = headers.map((_, colIdx) => parsed[colIdx] ?? "")
        rows.push(normalized)
        i++
      }
      blocks.push({ type: "table", headers, alignments, rows })
      continue
    }

    // Horizontal rule
    if (HR_RE.test(trimmed)) {
      blocks.push({ type: "hr" })
      i++
      continue
    }

    // Heading (#, ##, ###)
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      })
      i++
      continue
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      })
      continue
    }

    // Unordered or ordered list
    const bulletMatch = /^[-*•]\s+(.+)$/.exec(trimmed)
    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed)
    if (bulletMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch)
      const items: string[] = []
      while (i < lines.length) {
        const cur = lines[i].trim()
        const m = ordered
          ? /^\d+\.\s+(.+)$/.exec(cur)
          : /^[-*•]\s+(.+)$/.exec(cur)
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    // Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = []
    while (i < lines.length) {
      const cur = lines[i]
      const curTrimmed = cur.trim()
      if (
        !curTrimmed ||
        curTrimmed.startsWith("```") ||
        curTrimmed.startsWith(">") ||
        HR_RE.test(curTrimmed) ||
        isTableStart(lines, i) ||
        /^#{1,3}\s+/.test(curTrimmed) ||
        /^[-*•]\s+/.test(curTrimmed) ||
        /^\d+\.\s+/.test(curTrimmed)
      ) {
        break
      }
      paraLines.push(cur)
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") })
    }
  }

  return blocks
}
