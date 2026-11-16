import { useState } from "react"
import { Share, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import {
  describeToolCall,
  formatToolDuration,
  getStreamPhaseLabel,
  type ThreadStreamPhase,
  type ToolDomain,
} from "@saturn/core"
import type { ThreadMessage } from "@saturn/api/saturn/platform/ai/v1/ai"
import type { StreamingAssistantDraft } from "@saturn/hooks/ai"
import {
  Bot,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GitBranch,
  Mail,
  Plug,
  Share2,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { MarkdownText } from "./markdown-text"
import { StreamingDots } from "./streaming-dots"

export interface ToolResultEntry {
  result?: Record<string, unknown>
  isError?: boolean
}

interface ChatMessageBubbleProps {
  message?: ThreadMessage
  streamingDraft?: StreamingAssistantDraft
  isStreaming?: boolean
  streamPhase?: ThreadStreamPhase
  activeToolName?: string
  toolResultsByCallId?: Map<string, ToolResultEntry>
}

const DOMAIN_COLOR: Record<ToolDomain, string> = {
  finance: theme.colors.success,
  calendar: theme.colors.primary,
  mail: theme.colors.accent,
  workflows: theme.colors.warning,
  space: theme.colors.textSecondary,
  agent: theme.colors.accent,
  mcp: theme.colors.primary,
  general: theme.colors.textMuted,
}

function DomainIcon({
  domain,
  size = 12,
}: {
  domain: ToolDomain
  size?: number
}) {
  const color = DOMAIN_COLOR[domain] ?? theme.colors.textMuted
  switch (domain) {
    case "finance":
      return <Wallet size={size} color={color} />
    case "calendar":
      return <Calendar size={size} color={color} />
    case "mail":
      return <Mail size={size} color={color} />
    case "workflows":
      return <GitBranch size={size} color={color} />
    case "space":
      return <Building2 size={size} color={color} />
    case "agent":
      return <Bot size={size} color={color} />
    case "mcp":
      return <Plug size={size} color={color} />
    default:
      return <Wrench size={size} color={color} />
  }
}

export function ChatMessageBubble({
  message,
  streamingDraft,
  isStreaming = false,
  streamPhase = "idle",
  activeToolName,
  toolResultsByCallId,
}: ChatMessageBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [expandedToolIds, setExpandedToolIds] = useState<
    Record<string, boolean>
  >({})
  const [copied, setCopied] = useState(false)

  const toggleTool = (id: string) => {
    haptics.selection()
    setExpandedToolIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (streamingDraft) {
    const phaseLabel =
      getStreamPhaseLabel(streamPhase, {
        activeToolName,
        hasCompletedTools: streamingDraft.toolCalls.length > 0,
      }) || "Thinking…"
    const trimmedThinking = streamingDraft.thinking.trim()
    const trimmedText = streamingDraft.text.trimStart()
    const hasText = trimmedText.trim().length > 0
    const runningTools = streamingDraft.toolCalls.filter(
      (tc) => tc.status === "running"
    )
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
            <Brain size={12} color={theme.colors.primary} />
            <Text style={styles.pillText}>
              {streamPhase === "thinking" ? "Thinking…" : "Thought process"}
            </Text>
            {thinkingOpen ? (
              <ChevronDown size={12} color={theme.colors.textMuted} />
            ) : (
              <ChevronRight size={12} color={theme.colors.textMuted} />
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
                <CheckCircle2 size={12} color={theme.colors.success} />
                <Text style={styles.pillText}>
                  {streamingDraft.toolCalls.length} tool steps completed
                </Text>
                <ChevronRight size={12} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : (
              streamingDraft.toolCalls.map((tc) => {
                const desc = describeToolCall({
                  toolName: tc.toolName,
                  arguments: tc.arguments,
                  result: tc.result,
                })
                const durationText = formatToolDuration(tc.durationMs)
                const label =
                  tc.status === "running"
                    ? desc.activeLabel
                    : tc.status === "completed"
                      ? desc.completedLabel
                      : desc.label
                return (
                  <View
                    key={tc.toolCallId}
                    style={[
                      styles.toolPill,
                      tc.status === "running" && styles.toolPillActive,
                      tc.status === "error" && styles.toolPillError,
                    ]}
                  >
                    <DomainIcon domain={desc.domain} />
                    <Text style={styles.toolDomainText}>
                      {desc.domainLabel}
                    </Text>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {label}
                    </Text>
                    {desc.summary ? (
                      <Text style={styles.toolSummaryText} numberOfLines={1}>
                        · {desc.summary}
                      </Text>
                    ) : null}
                    {durationText ? (
                      <Text style={styles.pillMono}>{durationText}</Text>
                    ) : null}
                    {tc.status === "running" ? (
                      <StreamingDots />
                    ) : tc.status === "completed" ? (
                      <CheckCircle2 size={12} color={theme.colors.success} />
                    ) : (
                      <XCircle size={12} color={theme.colors.destructive} />
                    )}
                  </View>
                )
              })
            )}
          </View>
        )}

        {hasText ? <MarkdownText text={trimmedText} /> : null}

        {isStreaming && (
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

  const thinkingText = blocks
    .filter((b) => b.type === "thinking" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const textBody = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const toolBlocks = blocks.filter((b) => b.type === "tool_call")

  if (isUser) {
    return (
      <View style={styles.userBubble}>
        {attachments.length > 0 && (
          <View style={styles.attachmentsRow}>
            {attachments.map((b, i) => (
              <View key={i} style={styles.userAttachmentChip}>
                <FileText size={11} color={theme.colors.primaryForeground} />
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
          <Brain size={12} color={theme.colors.textMuted} />
          <Text style={styles.pillText}>Thought process</Text>
          {thinkingOpen ? (
            <ChevronDown size={12} color={theme.colors.textMuted} />
          ) : (
            <ChevronRight size={12} color={theme.colors.textMuted} />
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
              <CheckCircle2 size={12} color={theme.colors.success} />
              <Text style={styles.pillText}>
                {toolBlocks.length} tool steps
              </Text>
              {groupOpen ? (
                <ChevronDown size={12} color={theme.colors.textMuted} />
              ) : (
                <ChevronRight size={12} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
          )}

          {showToolsExpanded &&
            toolBlocks.map((tc, i) => {
              const callId = tc.toolCallId ?? `tc_${i}`
              const res = tc.toolCallId
                ? toolResultsByCallId?.get(tc.toolCallId)
                : undefined
              const desc = describeToolCall({
                toolName: tc.toolName ?? "tool",
                arguments: tc.arguments,
                result: res?.result,
              })
              const isExpanded = Boolean(expandedToolIds[callId])
              return (
                <View key={callId} style={styles.toolBlock}>
                  <TouchableOpacity
                    style={[
                      styles.toolPill,
                      res?.isError && styles.toolPillError,
                    ]}
                    onPress={() => toggleTool(callId)}
                  >
                    <DomainIcon domain={desc.domain} />
                    <Text style={styles.toolDomainText}>
                      {desc.domainLabel}
                    </Text>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {res && !res.isError ? desc.completedLabel : desc.label}
                    </Text>
                    {desc.summary ? (
                      <Text style={styles.toolSummaryText} numberOfLines={1}>
                        · {desc.summary}
                      </Text>
                    ) : null}
                    {res ? (
                      res.isError ? (
                        <XCircle size={12} color={theme.colors.destructive} />
                      ) : (
                        <CheckCircle2 size={12} color={theme.colors.success} />
                      )
                    ) : null}
                    {isExpanded ? (
                      <ChevronDown size={12} color={theme.colors.textMuted} />
                    ) : (
                      <ChevronRight size={12} color={theme.colors.textMuted} />
                    )}
                  </TouchableOpacity>

                  {isExpanded && (
                    <Text style={styles.thinkingBody}>
                      {tc.toolName}({JSON.stringify(tc.arguments ?? {})})
                    </Text>
                  )}
                </View>
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
            accessibilityLabel="Copy response"
          >
            {copied ? (
              <Check size={13} color={theme.colors.success} />
            ) : (
              <Copy size={13} color={theme.colors.textMuted} />
            )}
            <Text style={[styles.actionText, copied && styles.copiedText]}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleShareResponse()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Share response"
          >
            <Share2 size={13} color={theme.colors.textMuted} />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 5,
    maxWidth: "85%",
  },
  assistantTurn: {
    alignSelf: "stretch",
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 6,
  },
  userText: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.primaryForeground,
  },
  attachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  userAttachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(9, 13, 22, 0.16)",
    borderRadius: theme.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: "100%",
  },
  userAttachmentText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primaryForeground,
    flexShrink: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toolBlock: {
    gap: 3,
  },
  toolPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: "100%",
  },
  toolPillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  toolPillError: {
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  toolDomainText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  toolSummaryText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    flexShrink: 1,
  },
  pillText: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: "600",
    flexShrink: 1,
  },
  pillMono: {
    fontSize: 10,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
  },
  toolsWrap: {
    flexDirection: "column",
    gap: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statusText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  thinkingBody: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
    paddingLeft: 8,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  copiedText: {
    color: theme.colors.success,
  },
})
