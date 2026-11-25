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
import { useI18n } from "@saturn/hooks"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import { JsonCodeBlock } from "../ui/json-code-block"
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
  const styles = useThemedStyles(createStyles)
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

function isJsonCode(language: string | undefined, code: string): boolean {
  const lang = language?.trim().toLowerCase()
  if (lang === "json" || lang === "jsonc") {
    return true
  }
  const trimmed = code.trim()
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return typeof parsed === "object" && parsed !== null
    } catch {
      return false
    }
  }
  return false
}

function CodeBlockView({
  language,
  code,
}: {
  language?: string
  code: string
}) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  if (isJsonCode(language, code)) {
    return <JsonCodeBlock value={code} />
  }

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
          accessibilityLabel={t("ai.chatMobile.copyCodeAria")}
        >
          {copied ? (
            <Check size={12} color={colors.success} />
          ) : (
            <Copy size={12} color={colors.textMuted} />
          )}
          <Text style={[styles.copyText, copied && styles.copiedText]}>
            {copied ? t("ai.chatMobile.copied") : t("ai.chatMobile.copy")}
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
  const styles = useThemedStyles(createStyles)
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
  const styles = useThemedStyles(createStyles)
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

const createStyles = (t: SaturnMobileTheme) => ({
  root: {
    gap: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: t.colors.textPrimary,
  },
  h1: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    marginTop: 4,
  },
  h2: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    marginTop: 2,
  },
  h3: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  bold: {
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  italic: {
    fontStyle: "italic" as const,
  },
  inlineCode: {
    fontFamily: t.typography.mono,
    fontSize: 13,
    backgroundColor: t.colors.surfaceHighlight,
    color: t.colors.primary,
  },
  link: {
    color: t.colors.primary,
    textDecorationLine: "underline" as const,
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: t.colors.primary,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    color: t.colors.textSecondary,
    fontStyle: "italic" as const,
  },
  list: {
    gap: 4,
  },
  listRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    minWidth: 14,
  },
  listItemBody: {
    flex: 1,
  },
  codeCard: {
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: "hidden" as const,
  },
  codeHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surfaceSubtle,
  },
  codeLang: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
    textTransform: "lowercase" as const,
  },
  copyBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  copyText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  copiedText: {
    color: t.colors.success,
  },
  codeBody: {
    fontFamily: t.typography.mono,
    fontSize: 12,
    lineHeight: 18,
    color: t.colors.textSecondary,
    padding: 10,
  },
  hr: {
    height: 1,
    backgroundColor: t.colors.border,
    marginVertical: 4,
  },
  tableWrap: {
    marginVertical: 4,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    overflow: "hidden" as const,
  },
  tableFullWidth: {
    width: "100%" as const,
  },
  tableRow: {
    flexDirection: "row" as const,
  },
  tableHeaderRow: {
    backgroundColor: t.colors.surfaceHighlight,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderStrong,
  },
  tableRowAlt: {
    backgroundColor: t.colors.surfaceElevated,
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.borderStrong,
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center" as const,
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
    fontWeight: "700" as const,
    letterSpacing: 0.2,
    color: t.colors.textPrimary,
  },
  tableCellText: {
    fontSize: 13,
    lineHeight: 19,
    color: t.colors.textPrimary,
  },
})
