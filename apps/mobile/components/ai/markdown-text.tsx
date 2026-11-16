import { useState } from "react"
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import * as Clipboard from "expo-clipboard"
import { Check, Copy } from "lucide-react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  parseMarkdownBlocks,
  type MarkdownBlock,
  type TableAlignment,
} from "./markdown-parser"

export type { MarkdownBlock }
export { parseMarkdownBlocks }

type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; label: string; url: string }

function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const regex =
    /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|\[[^\]\n]+?\]\([^)\s]+?\)|\*[^*\n]+?\*)/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: "text", text: text.slice(lastIdx, match.index) })
    }
    const raw = match[0]
    if (raw.startsWith("**") && raw.endsWith("**")) {
      tokens.push({ type: "bold", text: raw.slice(2, -2) })
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      tokens.push({ type: "code", text: raw.slice(1, -1) })
    } else if (raw.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw)
      if (linkMatch) {
        tokens.push({ type: "link", label: linkMatch[1], url: linkMatch[2] })
      } else {
        tokens.push({ type: "text", text: raw })
      }
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      tokens.push({ type: "italic", text: raw.slice(1, -1) })
    }
    lastIdx = match.index + raw.length
  }

  if (lastIdx < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIdx) })
  }
  return tokens
}

function InlineText({ text, baseStyle }: { text: string; baseStyle: object }) {
  const tokens = parseInlineTokens(text)
  return (
    <Text style={baseStyle} selectable>
      {tokens.map((tok, idx) => {
        switch (tok.type) {
          case "bold":
            return (
              <Text key={idx} style={styles.bold}>
                {tok.text}
              </Text>
            )
          case "italic":
            return (
              <Text key={idx} style={styles.italic}>
                {tok.text}
              </Text>
            )
          case "code":
            return (
              <Text key={idx} style={styles.inlineCode}>
                {tok.text}
              </Text>
            )
          case "link":
            return (
              <Text
                key={idx}
                style={styles.link}
                onPress={() => {
                  if (/^https?:\/\//i.test(tok.url)) {
                    void Linking.openURL(tok.url)
                  }
                }}
              >
                {tok.label}
              </Text>
            )
          default:
            return tok.text
        }
      })}
    </Text>
  )
}

function CodeBlockView({
  language,
  code,
}: {
  language?: string
  code: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    haptics.selection()
    await Clipboard.setStringAsync(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <View style={styles.codeCard}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{language || "code"}</Text>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => void handleCopy()}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Copy code block"
        >
          {copied ? (
            <Check size={12} color={theme.colors.success} />
          ) : (
            <Copy size={12} color={theme.colors.textMuted} />
          )}
          <Text style={[styles.copyText, copied && styles.copiedText]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.codeBody} selectable>
        {code}
      </Text>
    </View>
  )
}

function stripMarkdownSyntax(text: string): string {
  return text.replace(/(\*\*|\*|`|\[|\]\([^)]*\))/g, "")
}

function TableBlockView({
  headers,
  alignments,
  rows,
}: {
  headers: string[]
  alignments: TableAlignment[]
  rows: string[][]
}) {
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = stripMarkdownSyntax(h).length
    for (const row of rows) {
      const len = stripMarkdownSyntax(row[colIdx] ?? "").length
      if (len > maxLen) maxLen = len
    }
    return Math.min(200, Math.max(72, maxLen * 8 + 24))
  })
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0)
  const fitsCompactly = totalWidth <= 340

  const renderRows = () => (
    <View style={fitsCompactly ? styles.tableFullWidth : undefined}>
      <View style={[styles.tableRow, styles.tableHeaderRow]}>
        {headers.map((header, colIdx) => {
          const align = alignments[colIdx] ?? "left"
          return (
            <View
              key={colIdx}
              style={[
                styles.tableCell,
                fitsCompactly
                  ? { flex: colWidths[colIdx] }
                  : { width: colWidths[colIdx] },
                colIdx === 0 && styles.tableCellFirst,
                colIdx === headers.length - 1 && styles.tableCellLast,
              ]}
            >
              <InlineText
                text={header}
                baseStyle={[styles.tableHeaderText, { textAlign: align }]}
              />
            </View>
          )
        })}
      </View>
      {rows.map((row, rowIdx) => (
        <View
          key={rowIdx}
          style={[
            styles.tableRow,
            rowIdx % 2 === 1 && styles.tableRowAlt,
            rowIdx < rows.length - 1 && styles.tableRowBorder,
          ]}
        >
          {row.map((cell, colIdx) => {
            const align = alignments[colIdx] ?? "left"
            return (
              <View
                key={colIdx}
                style={[
                  styles.tableCell,
                  fitsCompactly
                    ? { flex: colWidths[colIdx] }
                    : { width: colWidths[colIdx] },
                  colIdx === 0 && styles.tableCellFirst,
                  colIdx === headers.length - 1 && styles.tableCellLast,
                ]}
              >
                <InlineText
                  text={cell}
                  baseStyle={[styles.tableCellText, { textAlign: align }]}
                />
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )

  if (fitsCompactly) {
    return <View style={styles.tableWrap}>{renderRows()}</View>
  }

  return (
    <View style={styles.tableWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        {renderRows()}
      </ScrollView>
    </View>
  )
}

export function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text)
  if (blocks.length === 0) return null

  return (
    <View style={styles.root}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading":
            return (
              <InlineText
                key={idx}
                text={block.text}
                baseStyle={
                  block.level === 1
                    ? styles.h1
                    : block.level === 2
                      ? styles.h2
                      : styles.h3
                }
              />
            )
          case "code":
            return (
              <CodeBlockView
                key={idx}
                language={block.language}
                code={block.code}
              />
            )
          case "table":
            return (
              <TableBlockView
                key={idx}
                headers={block.headers}
                alignments={block.alignments}
                rows={block.rows}
              />
            )
          case "hr":
            return <View key={idx} style={styles.hr} />
          case "blockquote":
            return (
              <View key={idx} style={styles.blockquote}>
                <InlineText text={block.text} baseStyle={styles.quoteText} />
              </View>
            )
          case "list":
            return (
              <View key={idx} style={styles.list}>
                {block.items.map((item, itemIdx) => (
                  <View key={itemIdx} style={styles.listRow}>
                    <Text style={styles.bullet}>
                      {block.ordered ? `${itemIdx + 1}.` : "•"}
                    </Text>
                    <View style={styles.listItemBody}>
                      <InlineText text={item} baseStyle={styles.body} />
                    </View>
                  </View>
                ))}
              </View>
            )
          default:
            return (
              <InlineText key={idx} text={block.text} baseStyle={styles.body} />
            )
        }
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textPrimary,
  },
  h1: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  h2: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  h3: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  bold: {
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    backgroundColor: theme.colors.surfaceHighlight,
    color: theme.colors.primary,
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: "underline",
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primary,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  list: {
    gap: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    color: theme.colors.textMuted,
    minWidth: 14,
  },
  listItemBody: {
    flex: 1,
  },
  codeCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  codeLang: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
    textTransform: "lowercase",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  copyText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  copiedText: {
    color: theme.colors.success,
  },
  codeBody: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
    padding: 10,
  },
  hr: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  tableWrap: {
    marginVertical: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  tableFullWidth: {
    width: "100%",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderRow: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderStrong,
  },
  tableRowAlt: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderStrong,
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
  },
  tableCellFirst: {
    paddingLeft: 12,
  },
  tableCellLast: {
    paddingRight: 12,
  },
  tableHeaderText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: theme.colors.textPrimary,
  },
  tableCellText: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textPrimary,
  },
})
