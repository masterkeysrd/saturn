import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react"
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type BottomSheet from "@gorhom/bottom-sheet"
import { useThreadStream, type StreamAttachmentInput } from "@saturn/hooks/ai"
import {
  useListAgentsQuery,
  useListModelsQuery,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { ChatMessageBubble, type ToolResultEntry } from "./chat-message-bubble"
import { ToolApprovalCard } from "./tool-approval-card"
import { ThreadSwitcherSheet } from "./thread-switcher-sheet"
import { AgentModelSheet } from "./agent-model-sheet"
import {
  ArrowDown,
  Bot,
  FileText,
  History,
  List,
  Paperclip,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react-native"

const STARTER_PROMPTS = [
  "Summarize my spending this month vs budget",
  "What events are on my calendar this week?",
  "Check unread emails for action items",
  "List active workflows and recent runs",
]

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 5

interface LocalAttachment extends StreamAttachmentInput {
  id: string
}

interface MobileChatScreenProps {
  threadId?: string | null
  initialPrompt?: string
}

export function MobileChatScreen({
  threadId = null,
  initialPrompt,
}: MobileChatScreenProps) {
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpaceId } = useSpace()
  const containerRef = useRef<ComponentRef<typeof View>>(null)
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const threadSheetRef = useRef<BottomSheet>(null)
  const agentModelSheetRef = useRef<BottomSheet>(null)
  const sentInitialPromptRef = useRef<string | null>(null)
  const unshrunkBottomRef = useRef<number>(0)
  const lastAndroidKbHeightRef = useRef<number>(0)
  const isNearBottomRef = useRef<boolean>(true)

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId)
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>()

  useEffect(() => {
    isNearBottomRef.current = isNearBottom
  }, [isNearBottom])
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>()
  const [verticalOffset, setVerticalOffset] = useState(
    Platform.OS === "ios" ? 96 : 0
  )
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [androidKeyboardPadding, setAndroidKeyboardPadding] = useState(0)

  const syncAndroidKeyboardPadding = useCallback(
    (kbHeight: number, y: number, h: number) => {
      const currentBottom = y + h
      const baselineBottom =
        unshrunkBottomRef.current > 0
          ? unshrunkBottomRef.current
          : currentBottom
      const alreadyShrunk = Math.max(0, baselineBottom - currentBottom)
      setAndroidKeyboardPadding(Math.max(0, kbHeight - alreadyShrunk))
    },
    []
  )

  const measureContainerOffset = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y, _w, h) => {
      if (y > 0) {
        setVerticalOffset((prev) => (Math.abs(prev - y) > 1 ? y : prev))
      }
      if (!Keyboard.isVisible() && h > 0) {
        unshrunkBottomRef.current = y + h
      } else if (
        Platform.OS === "android" &&
        lastAndroidKbHeightRef.current > 0 &&
        h > 0
      ) {
        syncAndroidKeyboardPadding(lastAndroidKbHeightRef.current, y, h)
      }
    })
  }, [syncAndroidKeyboardPadding])

  useEffect(() => {
    const timer = setTimeout(measureContainerOffset, 350)
    return () => clearTimeout(timer)
  }, [measureContainerOffset])

  const prevSpaceIdRef = useRef<string | null>(activeSpaceId)
  useEffect(() => {
    if (prevSpaceIdRef.current !== activeSpaceId) {
      prevSpaceIdRef.current = activeSpaceId
      setActiveThreadId(null)
      setSelectedAgentId(undefined)
      setSelectedModelId(undefined)
      setAttachments([])
      setInput("")
    }
  }, [activeSpaceId])

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true)
      if (Platform.OS === "android") {
        const kbHeight = e.endCoordinates.height
        lastAndroidKbHeightRef.current = kbHeight
        containerRef.current?.measureInWindow((_x, y, _w, h) => {
          syncAndroidKeyboardPadding(kbHeight, y, h)
        })
      }
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: true })
        })
      }
    })

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false)
      if (Platform.OS === "android") {
        lastAndroidKbHeightRef.current = 0
        setAndroidKeyboardPadding(0)
      }
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [syncAndroidKeyboardPadding])

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
    if (isNearBottom && (isStreaming || messages.length > 0)) {
      scrollRef.current?.scrollToEnd({ animated: true })
    }
  }, [
    isNearBottom,
    isStreaming,
    messages.length,
    streamingMessage?.text,
    streamingMessage?.toolCalls.length,
  ])

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height)
    setIsNearBottom(distanceFromBottom < 80)
  }

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

  const handlePickAttachments = async () => {
    if (isStreaming || attachments.length >= MAX_ATTACHMENTS) return
    haptics.selection()
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/csv",
          "text/plain",
          "image/png",
          "image/jpeg",
          "image/webp",
        ],
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets) return

      const next: LocalAttachment[] = []
      for (const asset of result.assets.slice(
        0,
        MAX_ATTACHMENTS - attachments.length
      )) {
        const sizeBytes = asset.size ?? 0
        if (sizeBytes > MAX_ATTACHMENT_BYTES) {
          Alert.alert(
            "File Too Large",
            `${asset.name} exceeds the 10 MB attachment limit.`
          )
          continue
        }
        const item: LocalAttachment = {
          id: `${asset.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: asset.name || "attachment",
          contentType: asset.mimeType || "application/octet-stream",
        }
        if (Platform.OS === "web" && asset.file) {
          item.file = asset.file
        } else if (asset.uri) {
          item.base64Data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          })
        }
        next.push(item)
      }
      if (next.length > 0) {
        setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS))
      }
    } catch {
      // Cancelled or unreadable attachment
    }
  }

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim()
    if ((!trimmed && attachments.length === 0) || isStreaming) return
    haptics.light()
    const currentAttachments = overrideText ? [] : attachments
    if (!overrideText) {
      setInput("")
      setAttachments([])
    }
    setIsNearBottom(true)
    await sendMessage({
      content: trimmed,
      attachments: currentAttachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        file: a.file,
        base64Data: a.base64Data,
      })),
      agentId: effectiveAgentId,
      modelId: effectiveModelId,
      contextHint: "mobile/ai",
    })
  }

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={measureContainerOffset}
    >
      <KeyboardAvoidingView
        style={[
          styles.container,
          Platform.OS === "android" &&
            androidKeyboardPadding > 0 && {
              paddingBottom: androidKeyboardPadding,
            },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={verticalOffset}
      >
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarPill}
            onPress={() => {
              haptics.light()
              threadSheetRef.current?.expand()
            }}
          >
            <List size={14} color={colors.textSecondary} />
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
            <Bot size={14} color={colors.primary} />
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
            <History size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.messagesWrap}>
          <ScrollView
            ref={scrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            contentInsetAdjustmentBehavior="never"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {messages.length === 0 && !streamingMessage && !isStreaming ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Sparkles size={24} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeAgent?.name || "Saturn Assistant"}
                </Text>
                <Text style={styles.emptySub}>
                  Ask about your budgets, calendar, mail, or workflows. Mutating
                  actions prompt for your approval before executing.
                </Text>
                <View style={styles.starterChips}>
                  {STARTER_PROMPTS.map((prompt) => (
                    <TouchableOpacity
                      key={prompt}
                      style={styles.starterChip}
                      activeOpacity={0.7}
                      onPress={() => void handleSend(prompt)}
                    >
                      <Text style={styles.starterChipText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
                      streamingMessage ?? {
                        thinking: "",
                        text: "",
                        toolCalls: [],
                      }
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
                      void resolveApprovals([
                        { toolCallId: id, approved: true },
                      ])
                    }
                    onReject={(id) =>
                      void resolveApprovals([
                        { toolCallId: id, approved: false },
                      ])
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

          {!isNearBottom && visibleMessages.length > 0 && (
            <TouchableOpacity
              style={styles.scrollBottomBtn}
              activeOpacity={0.8}
              onPress={() => {
                haptics.light()
                setIsNearBottom(true)
                scrollRef.current?.scrollToEnd({ animated: true })
              }}
              accessibilityLabel="Scroll to bottom"
            >
              <ArrowDown size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        <View
          style={[
            styles.composerWrap,
            {
              paddingBottom: keyboardVisible
                ? Platform.OS === "ios"
                  ? 18
                  : insets.bottom + 18
                : Math.max(insets.bottom, 12),
            },
          ]}
        >
          {attachments.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentsStrip}
            >
              {attachments.map((att) => (
                <View key={att.id} style={styles.attachmentChip}>
                  <FileText size={12} color={colors.primary} />
                  <Text style={styles.attachmentChipText} numberOfLines={1}>
                    {att.filename}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      haptics.selection()
                      setAttachments((prev) =>
                        prev.filter((item) => item.id !== att.id)
                      )
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityLabel={`Remove ${att.filename}`}
                  >
                    <X size={12} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.composerRow}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => void handlePickAttachments()}
              disabled={isStreaming || attachments.length >= MAX_ATTACHMENTS}
              accessibilityLabel="Attach file"
            >
              <Paperclip
                size={18}
                color={
                  isStreaming || attachments.length >= MAX_ATTACHMENTS
                    ? colors.textMuted
                    : colors.textSecondary
                }
              />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message Saturn AI..."
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
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
                <Square size={16} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  !input.trim() &&
                    attachments.length === 0 &&
                    styles.sendBtnDisabled,
                ]}
                onPress={() => void handleSend()}
                disabled={!input.trim() && attachments.length === 0}
                accessibilityLabel="Send message"
              >
                <Send size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

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
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  toolbar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  toolbarPill: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: t.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  toolbarText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  iconBtn: {
    padding: 8,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  messagesWrap: {
    flex: 1,
    position: "relative" as const,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
    flexGrow: 1,
  },
  scrollBottomBtn: {
    position: "absolute" as const,
    right: 14,
    bottom: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...t.shadows.sm,
  },
  starterChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginTop: 6,
  },
  starterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  starterChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  attachmentsStrip: {
    flexDirection: "row" as const,
    gap: 6,
    paddingBottom: 8,
  },
  attachmentChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: 180,
  },
  attachmentChipText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  attachBtn: {
    width: 34,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyState: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center" as const,
    color: t.colors.textSecondary,
  },
  errorBanner: {
    backgroundColor: t.colors.destructiveSubtle,
    borderRadius: t.radius.md,
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: t.colors.background,
  },
  composerRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 8,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 8,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    fontSize: 15,
    color: t.colors.textPrimary,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  stopBtn: {
    backgroundColor: t.colors.destructive,
  },
})
