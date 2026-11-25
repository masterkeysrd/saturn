import { useState } from "react"
import { Share, Text, TouchableOpacity, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import {
  getStreamPhaseLabel,
  splitThinkingFromText,
  type ThreadStreamPhase,
} from "@saturn/core"
import type { ThreadMessage } from "@saturn/api/saturn/platform/ai/v1/ai"
import type { StreamingAssistantDraft } from "@saturn/hooks/ai"
import { useI18n } from "@saturn/hooks"
import {
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Share2,
} from "lucide-react-native"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import { MarkdownText } from "./markdown-text"
import {
  MobileToolCallCard,
  type MobileToolResultEntry,
} from "./mobile-tool-call-card"
import { StreamingDots } from "./streaming-dots"

export type ToolResultEntry = MobileToolResultEntry

interface ChatMessageBubbleProps {
  message?: ThreadMessage
  streamingDraft?: StreamingAssistantDraft
  isStreaming?: boolean
  streamPhase?: ThreadStreamPhase
  activeToolName?: string
  toolResultsByCallId?: Map<string, ToolResultEntry>
}

export function ChatMessageBubble({
  message,
  streamingDraft,
  isStreaming = false,
  streamPhase = "idle",
  activeToolName,
  toolResultsByCallId,
}: ChatMessageBubbleProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (streamingDraft) {
    const phaseLabel =
      (streamPhase === "connecting"
        ? t("ai.streamPhase.starting")
        : streamPhase === "thinking"
          ? streamingDraft.toolCalls.length > 0
            ? t("ai.streamPhase.reviewing")
            : t("ai.conversation.thinking")
          : streamPhase === "generating"
            ? t("ai.streamPhase.generating")
            : streamPhase === "awaiting_approval"
              ? t("ai.streamPhase.waitingApproval")
              : "") ||
      getStreamPhaseLabel(streamPhase, {
        activeToolName,
        hasCompletedTools: streamingDraft.toolCalls.length > 0,
      }) ||
      t("ai.streamPhase.runningTool")
    const streamExtracted = splitThinkingFromText(streamingDraft.text)
    const trimmedThinking = [
      streamingDraft.thinking.trim(),
      streamExtracted.thinking,
    ]
      .filter(Boolean)
      .join("\n\n")
    const trimmedText = streamExtracted.text.trimStart()
    const hasText = trimmedText.trim().length > 0
    const runningTools = streamingDraft.toolCalls.filter(
      (tc) => tc.status === "running"
    )
    const isActivelyStreamingThoughts =
      isStreaming &&
      Boolean(trimmedThinking) &&
      (streamPhase === "thinking" || streamExtracted.hasUnclosedThink) &&
      streamingDraft.toolCalls.length === 0 &&
      !hasText
    const shouldShowStatusRow =
      isStreaming &&
      !isActivelyStreamingThoughts &&
      runningTools.length === 0 &&
      !(streamPhase === "generating" && hasText) &&
      streamPhase !== "awaiting_approval"
    const allCompleted =
      streamingDraft.toolCalls.length > 1 &&
      runningTools.length === 0 &&
      hasText

    return (
      <View style={styles.assistantTurn}>
        {trimmedThinking ? (
          <TouchableOpacity
            style={styles.pill}
            onPress={() => {
              haptics.selection()
              setThinkingOpen(!thinkingOpen)
            }}
          >
            <Brain
              size={12}
              color={
                isActivelyStreamingThoughts ? colors.primary : colors.textMuted
              }
            />
            <Text style={styles.pillText}>
              {isActivelyStreamingThoughts
                ? t("ai.conversation.thinking")
                : t("ai.chatMobile.thoughtProcess")}
            </Text>
            {isActivelyStreamingThoughts ? <StreamingDots /> : null}
            {thinkingOpen ? (
              <ChevronDown size={12} color={colors.textMuted} />
            ) : (
              <ChevronRight size={12} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        ) : null}

        {thinkingOpen && trimmedThinking ? (
          <Text style={styles.thinkingBody}>{trimmedThinking}</Text>
        ) : null}

        {streamingDraft.toolCalls.length > 0 && (
          <View style={styles.toolsWrap}>
            {allCompleted && !groupOpen ? (
              <TouchableOpacity
                style={styles.pill}
                onPress={() => {
                  haptics.selection()
                  setGroupOpen(true)
                }}
              >
                <CheckCircle2 size={12} color={colors.success} />
                <Text style={styles.pillText}>
                  {t("ai.chatMobile.chatStepsCompleted", {
                    count: streamingDraft.toolCalls.length,
                  })}
                </Text>
                <ChevronRight size={12} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              streamingDraft.toolCalls.map((tc) => (
                <MobileToolCallCard
                  key={tc.toolCallId}
                  toolCall={{
                    callId: tc.toolCallId,
                    toolName: tc.toolName,
                    arguments: tc.arguments,
                  }}
                  resultEntry={
                    tc.result !== undefined || tc.isError
                      ? { result: tc.result, isError: tc.isError }
                      : toolResultsByCallId?.get(tc.toolCallId)
                  }
                  isRunning={tc.status === "running"}
                  durationMs={tc.durationMs}
                />
              ))
            )}
          </View>
        )}

        {hasText ? <MarkdownText text={trimmedText} /> : null}

        {shouldShowStatusRow && (
          <View style={styles.statusRow} accessibilityRole="text">
            <StreamingDots />
            <Text style={styles.statusText}>{phaseLabel}</Text>
          </View>
        )}
      </View>
    )
  }

  if (!message) return null
  const isUser = message.role === "user"
  const blocks = message.blocks ?? []

  const attachments = blocks.filter(
    (b) => b.type === "attachment" && b.attachment
  )

  const explicitThinkingText = blocks
    .filter((b) => b.type === "thinking" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const rawTextBody = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const extractedFinal = isUser
    ? { thinking: "", text: rawTextBody }
    : splitThinkingFromText(rawTextBody)

  const thinkingText = [explicitThinkingText, extractedFinal.thinking]
    .filter(Boolean)
    .join("\n\n")

  const textBody = extractedFinal.text

  const toolBlocks = blocks.filter((b) => b.type === "tool_call")

  if (isUser) {
    return (
      <View style={styles.userBubble}>
        {attachments.length > 0 && (
          <View style={styles.attachmentsRow}>
            {attachments.map((b, i) => (
              <View key={i} style={styles.userAttachmentChip}>
                <FileText size={11} color={colors.primaryForeground} />
                <Text style={styles.userAttachmentText} numberOfLines={1}>
                  {b.attachment?.filename}
                </Text>
              </View>
            ))}
          </View>
        )}
        {textBody ? (
          <Text style={styles.userText} selectable>
            {textBody}
          </Text>
        ) : null}
      </View>
    )
  }

  const hasToolErrors = toolBlocks.some((tc) => {
    const res = tc.toolCallId
      ? toolResultsByCallId?.get(tc.toolCallId)
      : undefined
    return Boolean(res?.isError)
  })
  const collapseGroupByDefault = toolBlocks.length > 1 && !hasToolErrors
  const showToolsExpanded = !collapseGroupByDefault || groupOpen

  const handleCopyResponse = async () => {
    if (!textBody) return
    haptics.selection()
    await Clipboard.setStringAsync(textBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const handleShareResponse = async () => {
    if (!textBody) return
    haptics.light()
    await Share.share({ message: textBody }).catch(() => undefined)
  }

  return (
    <View style={styles.assistantTurn}>
      {thinkingText ? (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => {
            haptics.selection()
            setThinkingOpen(!thinkingOpen)
          }}
        >
          <Brain size={12} color={colors.textMuted} />
          <Text style={styles.pillText}>
            {t("ai.chatMobile.thoughtProcess")}
          </Text>
          {thinkingOpen ? (
            <ChevronDown size={12} color={colors.textMuted} />
          ) : (
            <ChevronRight size={12} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      ) : null}

      {thinkingOpen && thinkingText ? (
        <Text style={styles.thinkingBody}>{thinkingText}</Text>
      ) : null}

      {toolBlocks.length > 0 && (
        <View style={styles.toolsWrap}>
          {collapseGroupByDefault && (
            <TouchableOpacity
              style={styles.pill}
              onPress={() => {
                haptics.selection()
                setGroupOpen(!groupOpen)
              }}
            >
              <CheckCircle2 size={12} color={colors.success} />
              <Text style={styles.pillText}>
                {t("ai.chatMobile.chatStepsCount", {
                  count: toolBlocks.length,
                })}
              </Text>
              {groupOpen ? (
                <ChevronDown size={12} color={colors.textMuted} />
              ) : (
                <ChevronRight size={12} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          )}

          {showToolsExpanded &&
            toolBlocks.map((tc, i) => {
              const callId = tc.toolCallId ?? `tc_${i}`
              const res = tc.toolCallId
                ? toolResultsByCallId?.get(tc.toolCallId)
                : undefined
              return (
                <MobileToolCallCard
                  key={callId}
                  toolCall={{
                    callId,
                    toolName: tc.toolName ?? "tool",
                    arguments: tc.arguments,
                  }}
                  resultEntry={res}
                />
              )
            })}
        </View>
      )}

      {textBody ? <MarkdownText text={textBody} /> : null}

      {textBody ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleCopyResponse()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={t("ai.chatMobile.copyAria")}
          >
            {copied ? (
              <Check size={13} color={colors.success} />
            ) : (
              <Copy size={13} color={colors.textMuted} />
            )}
            <Text style={[styles.actionText, copied && styles.copiedText]}>
              {copied ? t("ai.chatMobile.copied") : t("ai.chatMobile.copy")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleShareResponse()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={t("ai.chatMobile.shareAria")}
          >
            <Share2 size={13} color={colors.textMuted} />
            <Text style={styles.actionText}>{t("ai.chatMobile.share")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  userBubble: {
    alignSelf: "flex-end" as const,
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 5,
    maxWidth: "85%" as const,
  },
  assistantTurn: {
    alignSelf: "stretch" as const,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 6,
  },
  userText: {
    fontSize: 15,
    lineHeight: 21,
    color: t.colors.primaryForeground,
  },
  attachmentsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 4,
  },
  userAttachmentChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: t.isDark
      ? "rgba(9, 13, 22, 0.16)"
      : "rgba(255, 255, 255, 0.2)",
    borderRadius: t.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: "100%" as const,
  },
  userAttachmentText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
    flexShrink: 1,
  },
  pill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    alignSelf: "flex-start" as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  pillText: {
    fontSize: 12,
    color: t.colors.textPrimary,
    fontWeight: "600" as const,
    flexShrink: 1,
  },
  toolsWrap: {
    flexDirection: "column" as const,
    gap: 6,
  },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
  },
  statusText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  thinkingBody: {
    fontSize: 12,
    lineHeight: 17,
    color: t.colors.textSecondary,
    borderLeftWidth: 2,
    borderLeftColor: t.colors.border,
    paddingLeft: 8,
  },
  actionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 14,
    paddingTop: 2,
  },
  actionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  copiedText: {
    color: t.colors.success,
  },
})
