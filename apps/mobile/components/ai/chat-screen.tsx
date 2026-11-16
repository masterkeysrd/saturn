import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type BottomSheet from "@gorhom/bottom-sheet"
import { useThreadStream } from "@saturn/hooks/ai"
import {
  useListAgentsQuery,
  useListModelsQuery,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { ChatMessageBubble, type ToolResultEntry } from "./chat-message-bubble"
import { ToolApprovalCard } from "./tool-approval-card"
import { ThreadSwitcherSheet } from "./thread-switcher-sheet"
import { AgentModelSheet } from "./agent-model-sheet"
import { Bot, History, List, Send, Sparkles, Square } from "lucide-react-native"

interface MobileChatScreenProps {
  threadId?: string | null
  initialPrompt?: string
}

export function MobileChatScreen({
  threadId = null,
  initialPrompt,
}: MobileChatScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const threadSheetRef = useRef<BottomSheet>(null)
  const agentModelSheetRef = useRef<BottomSheet>(null)
  const sentInitialPromptRef = useRef<string | null>(null)

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId)
  const [input, setInput] = useState("")
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>()
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>()

  useEffect(() => {
    setActiveThreadId(threadId)
  }, [threadId])

  const { data: agentsData } = useListAgentsQuery({})
  const { data: modelsData } = useListModelsQuery({ isEnabled: true })
  const agents = agentsData?.agents ?? []
  const models = modelsData?.models ?? []

  const {
    thread,
    messages,
    isStreaming,
    streamPhase,
    activeToolCall,
    streamingMessage,
    pendingApprovals,
    error,
    sendMessage,
    resolveApprovals,
    stop,
  } = useThreadStream({
    threadId: activeThreadId,
    onThreadCreated: (created) => {
      if (created.id) {
        setActiveThreadId(created.id)
      }
    },
  })

  const { visibleMessages, toolResultsByCallId } = useMemo(() => {
    const map = new Map<string, ToolResultEntry>()
    for (const msg of messages) {
      if (msg.role === "tool") {
        for (const b of msg.blocks ?? []) {
          if (b.type === "tool_result" && b.toolCallId) {
            map.set(b.toolCallId, {
              result: b.result,
              isError: b.isError,
            })
          }
        }
      }
    }
    return {
      visibleMessages: messages.filter((m) => m.role !== "tool"),
      toolResultsByCallId: map,
    }
  }, [messages])

  useEffect(() => {
    if (isStreaming || messages.length > 0) {
      scrollRef.current?.scrollToEnd({ animated: true })
    }
  }, [
    isStreaming,
    messages.length,
    streamingMessage?.text,
    streamingMessage?.toolCalls.length,
  ])

  const effectiveAgentId = selectedAgentId ?? thread?.agentId ?? agents[0]?.id
  const effectiveModelId = selectedModelId ?? thread?.modelId
  const activeAgent = agents.find((a) => a.id === effectiveAgentId)
  const activeModel = models.find((m) => m.id === effectiveModelId)

  useEffect(() => {
    const trimmed = initialPrompt?.trim()
    if (!trimmed || sentInitialPromptRef.current === trimmed) return
    sentInitialPromptRef.current = trimmed
    void sendMessage({
      content: trimmed,
      agentId: effectiveAgentId,
      modelId: effectiveModelId,
      contextHint: "mobile/ai",
    })
  }, [effectiveAgentId, effectiveModelId, initialPrompt, sendMessage])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    haptics.light()
    setInput("")
    await sendMessage({
      content: trimmed,
      agentId: effectiveAgentId,
      modelId: effectiveModelId,
      contextHint: "mobile/ai",
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.toolbarPill}
          onPress={() => {
            haptics.light()
            threadSheetRef.current?.expand()
          }}
        >
          <List size={14} color={theme.colors.textSecondary} />
          <Text style={styles.toolbarText} numberOfLines={1}>
            {thread?.title || "New Chat"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarPill}
          onPress={() => {
            haptics.light()
            agentModelSheetRef.current?.expand()
          }}
        >
          <Bot size={14} color={theme.colors.primary} />
          <Text style={styles.toolbarText} numberOfLines={1}>
            {activeAgent?.name || "Assistant"}
            {activeModel ? ` · ${activeModel.displayName}` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            haptics.light()
            router.push("/(app)/ai/agents" as never)
          }}
          accessibilityLabel="Manage AI Agents"
        >
          <History size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        contentInsetAdjustmentBehavior="never"
      >
        {messages.length === 0 && !streamingMessage && !isStreaming ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Sparkles size={24} color={theme.colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeAgent?.name || "Saturn Assistant"}
            </Text>
            <Text style={styles.emptySub}>
              Ask about your budgets, calendar, mail, or workflows. Mutating
              actions prompt for your approval before executing.
            </Text>
          </View>
        ) : (
          <>
            {visibleMessages.map((msg, i) => (
              <ChatMessageBubble
                key={msg.id ?? i}
                message={msg}
                toolResultsByCallId={toolResultsByCallId}
              />
            ))}

            {(streamingMessage || isStreaming) && (
              <ChatMessageBubble
                streamingDraft={
                  streamingMessage ?? { thinking: "", text: "", toolCalls: [] }
                }
                isStreaming={isStreaming}
                streamPhase={streamPhase}
                activeToolName={activeToolCall?.toolName}
              />
            )}

            {pendingApprovals.map((pa) => (
              <ToolApprovalCard
                key={pa.toolCallId}
                approval={pa}
                onApprove={(id) =>
                  void resolveApprovals([{ toolCallId: id, approved: true }])
                }
                onReject={(id) =>
                  void resolveApprovals([{ toolCallId: id, approved: false }])
                }
              />
            ))}

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>
                  {error.message || "AI execution failed"}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.composerWrap,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <View style={styles.composerRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Saturn AI..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          {isStreaming ? (
            <TouchableOpacity
              style={[styles.sendBtn, styles.stopBtn]}
              onPress={() => {
                haptics.medium()
                void stop()
              }}
              accessibilityLabel="Stop streaming"
            >
              <Square size={16} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={() => void handleSend()}
              disabled={!input.trim()}
              accessibilityLabel="Send message"
            >
              <Send size={16} color={theme.colors.primaryForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ThreadSwitcherSheet
        ref={threadSheetRef}
        activeThreadId={activeThreadId}
        onSelectThread={(nextId) => {
          setActiveThreadId(nextId)
          router.replace(
            (nextId ? `/(app)/ai/threads/${nextId}` : "/(app)/ai") as never
          )
        }}
        onClose={() => threadSheetRef.current?.close()}
      />

      <AgentModelSheet
        ref={agentModelSheetRef}
        selectedAgentId={effectiveAgentId}
        selectedModelId={effectiveModelId}
        onSelectAgent={setSelectedAgentId}
        onSelectModel={setSelectedModelId}
        onClose={() => agentModelSheetRef.current?.close()}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toolbarText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  iconBtn: {
    padding: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: theme.colors.textSecondary,
  },
  errorBanner: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: theme.colors.background,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 8,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    fontSize: 15,
    color: theme.colors.textPrimary,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  stopBtn: {
    backgroundColor: theme.colors.destructive,
  },
})
