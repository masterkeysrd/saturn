import { useState } from "react"
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
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
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Mail,
  Plug,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react-native"
import { theme } from "@/lib/theme"

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
  const [expandedToolIds, setExpandedToolIds] = useState<
    Record<string, boolean>
  >({})

  const toggleTool = (id: string) => {
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

    return (
      <View style={[styles.bubble, styles.assistantBubble]}>
        {trimmedThinking ? (
          <TouchableOpacity
            style={styles.pill}
            onPress={() => setThinkingOpen(!thinkingOpen)}
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
            {streamingDraft.toolCalls.map((tc) => {
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
                  <Text style={styles.toolDomainText}>{desc.domainLabel}</Text>
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
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                      style={styles.miniSpinner}
                    />
                  ) : tc.status === "completed" ? (
                    <CheckCircle2 size={12} color={theme.colors.success} />
                  ) : (
                    <XCircle size={12} color={theme.colors.destructive} />
                  )}
                </View>
              )
            })}
          </View>
        )}

        {trimmedText.trim() ? (
          <Text style={styles.assistantText}>{trimmedText}</Text>
        ) : null}

        {isStreaming && (
          <View style={styles.statusRow} accessibilityRole="text">
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={styles.miniSpinner}
            />
            <Text style={styles.statusText}>{phaseLabel}</Text>
          </View>
        )}
      </View>
    )
  }

  if (!message) return null
  const isUser = message.role === "user"
  const blocks = message.blocks ?? []

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

  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      {thinkingText ? (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => setThinkingOpen(!thinkingOpen)}
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
          {toolBlocks.map((tc, i) => {
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
                  <Text style={styles.toolDomainText}>{desc.domainLabel}</Text>
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

      {textBody ? (
        <Text style={isUser ? styles.userText : styles.assistantText}>
          {textBody}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: theme.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
    maxWidth: "92%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.primary,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  userText: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.primaryForeground,
  },
  assistantText: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.textPrimary,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
  },
  toolBlock: {
    gap: 3,
  },
  toolPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
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
    gap: 6,
  },
  miniSpinner: {
    transform: [{ scale: 0.72 }],
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
})
