import { useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import {
  prettifyJsonValue,
  tokenizeJson,
  type JsonSyntaxTokenType,
} from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { Check, Copy } from "lucide-react-native"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"

export interface JsonCodeBlockProps {
  value: unknown
  maxHeight?: number
  copyable?: boolean
  unwrapNestedJsonStrings?: boolean
  testID?: string
}

function getTokenColor(
  type: JsonSyntaxTokenType,
  colors: SaturnMobileTheme["colors"]
): string {
  switch (type) {
    case "key":
      return colors.syntaxKey
    case "string":
      return colors.syntaxString
    case "number":
      return colors.syntaxNumber
    case "boolean":
      return colors.syntaxBoolean
    case "null":
      return colors.syntaxNull
    case "punctuation":
      return colors.syntaxPunctuation
    default:
      return colors.textSecondary
  }
}

export function JsonCodeBlock({
  value,
  maxHeight = 260,
  copyable = true,
  unwrapNestedJsonStrings = true,
  testID,
}: JsonCodeBlockProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const pretty = useMemo(
    () => prettifyJsonValue(value, { unwrapNestedJsonStrings }),
    [value, unwrapNestedJsonStrings]
  )

  const tokens = useMemo(() => tokenizeJson(pretty), [pretty])

  const handleCopy = async () => {
    if (!pretty) return
    haptics.selection()
    await Clipboard.setStringAsync(pretty)
    setCopied(true)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <View style={styles.container} testID={testID}>
      {copyable ? (
        <View style={styles.header}>
          <Text style={styles.langLabel}>json</Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => void handleCopy()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t("ai.code.copy")}
          >
            {copied ? (
              <Check size={12} color={colors.success} />
            ) : (
              <Copy size={12} color={colors.textMuted} />
            )}
            <Text style={[styles.copyText, copied && styles.copiedText]}>
              {copied ? t("ai.code.copied") : t("ai.code.copy")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        style={[styles.vScroll, { maxHeight }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
        >
          <Text style={styles.codeBody} selectable>
            {tokens.map((tok, idx) => (
              <Text
                key={idx}
                style={{ color: getTokenColor(tok.type, colors) }}
              >
                {tok.value}
              </Text>
            ))}
          </Text>
        </ScrollView>
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    overflow: "hidden" as const,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  langLabel: {
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
  vScroll: {
    width: "100%" as const,
  },
  codeBody: {
    fontFamily: t.typography.mono,
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
  },
})
