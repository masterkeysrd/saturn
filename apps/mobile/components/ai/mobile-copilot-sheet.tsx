import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react"
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  useBottomSheetInternal,
  type BottomSheetBackdropProps,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet"
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { useListAgentsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useCopilot, useThreadStream } from "@saturn/hooks/ai"
import { useI18n } from "@saturn/hooks"
import {
  deduplicateCopilotEntityRefs,
  formatCopilotPromptWithContext,
  splitThinkingFromText,
  type CopilotEntityKind,
} from "@saturn/core"
import {
  Calendar,
  GitBranch,
  HandCoins,
  Landmark,
  Mail,
  Maximize2,
  PiggyBank,
  Plus,
  ReceiptText,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react-native"
import { useMobileCopilotSheet } from "../../lib/copilot-sheet-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import { ChatMessageBubble, type ToolResultEntry } from "./chat-message-bubble"
import { ToolApprovalCard } from "./tool-approval-card"

function EntityKindIcon({
  kind,
  color,
}: {
  kind: CopilotEntityKind
  color: string
}) {
  switch (kind) {
    case "mail_thread":
      return <Mail size={12} color={color} />
    case "budget":
      return <PiggyBank size={12} color={color} />
    case "transaction":
      return <ReceiptText size={12} color={color} />
    case "borrowing":
      return <HandCoins size={12} color={color} />
    case "account":
    case "statement":
      return <Landmark size={12} color={color} />
    case "calendar_event":
      return <Calendar size={12} color={color} />
    case "workflow":
      return <GitBranch size={12} color={color} />
    default: {
      kind satisfies never
      return null
    }
  }
}

function OrbitalStreamingShimmer() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const progress = useSharedValue(0)
  const [trackWidth, setTrackWidth] = useState(0)

  useEffect(() => {
    progress.value = 0
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [progress])

  const barStyle = useAnimatedStyle(() => {
    const width = trackWidth > 0 ? trackWidth : 320
    const indicatorWidth = Math.max(88, width * 0.42)
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [-indicatorWidth * 0.35, width - indicatorWidth * 0.65]
    )
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [colors.primary, colors.brandSecondary, colors.primary]
    )
    return {
      width: indicatorWidth,
      transform: [{ translateX }],
      backgroundColor,
    }
  })

  return (
    <View
      testID="copilot-streaming-shimmer"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={styles.shimmerTrack}
    >
      <Animated.View style={[styles.shimmerBar, barStyle]} />
    </View>
  )
}

function AssistantSkeletonBars() {
  const styles = useThemedStyles(createStyles)
  const opacity = useSharedValue(0.35)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 650 }),
        withTiming(0.35, { duration: 650 })
      ),
      -1,
      false
    )
    return () => {
      cancelAnimation(opacity)
    }
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      testID="copilot-streaming-skeleton"
      style={[styles.skeletonWrap, animatedStyle]}
    >
      <View style={[styles.skeletonBar, styles.skeletonBarWide]} />
      <View style={[styles.skeletonBar, styles.skeletonBarNarrow]} />
    </Animated.View>
  )
}

function CopilotSheetViewport({
  isFullScreen,
  hasConversation,
  topInset,
  children,
}: {
  isFullScreen: boolean
  hasConversation: boolean
  topInset: number
  children: ReactNode
}) {
  const styles = useThemedStyles(createStyles)
  const internal = useBottomSheetInternal(true)
  const animatedPosition = internal?.animatedPosition
  const animatedLayoutState = internal?.animatedLayoutState
  const animatedKeyboardState = internal?.animatedKeyboardState
  const animatedDetentsState = internal?.animatedDetentsState
  const fallbackHeight = hasConversation ? 496 : 284

  const animatedViewportStyle = useAnimatedStyle(() => {
    if (!animatedPosition || !animatedLayoutState || !animatedKeyboardState) {
      return {}
    }

    const layout = animatedLayoutState.value
    if (layout.containerHeight <= 0) {
      return { height: fallbackHeight }
    }

    const position = animatedPosition.value
    const keyboard = animatedKeyboardState.value
    const keyboardOffset =
      keyboard.status === 1 && keyboard.heightWithinContainer > 0
        ? keyboard.heightWithinContainer
        : 0

    const detents = animatedDetentsState?.value?.detents
    const lowestDetentPosition =
      detents && detents.length > 0 ? detents[0] : undefined

    const effectivePosition =
      keyboardOffset === 0 &&
      lowestDetentPosition !== undefined &&
      position > lowestDetentPosition
        ? lowestDetentPosition
        : position

    const visibleSheetHeight = Math.max(
      0,
      layout.containerHeight - effectivePosition - keyboardOffset
    )
    const handleOffset = layout.handleHeight > 0 ? layout.handleHeight : 0
    const contentHeight = Math.max(0, visibleSheetHeight - handleOffset)
    const safeTopPadding = Math.max(
      0,
      topInset - Math.max(0, effectivePosition)
    )

    return {
      height: contentHeight,
      paddingTop: safeTopPadding,
    }
  })

  return (
    <Animated.View
      testID="copilot-sheet-root"
      style={[
        internal ? styles.sheetViewport : styles.sheetViewportFallback,
        !internal && isFullScreen && { paddingTop: topInset },
        animatedViewportStyle,
      ]}
    >
      {children}
    </Animated.View>
  )
}

export function MobileCopilotSheet() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

  const { isOpen, pendingPrompt, closeCopilotSheet, consumePendingPrompt } =
    useMobileCopilotSheet()

  const {
    threadId,
    setThreadId,
    activeView,
    isAmbientDismissed,
    dismissAmbient,
    pinnedItems,
    detachItem,
    clearPinnedItems,
  } = useCopilot()

  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null)
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null)
  const [input, setInput] = useState("")
  const [currentSnapIndex, setCurrentSnapIndex] = useState(-1)

  const isKeyboardVisibleRef = useRef(false)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [baseContainerHeight, setBaseContainerHeight] = useState<
    number | undefined
  >(undefined)

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const showSub = Keyboard.addListener(showEvent, () => {
      isKeyboardVisibleRef.current = true
      setIsKeyboardVisible(true)
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      isKeyboardVisibleRef.current = false
      setIsKeyboardVisible(false)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const handleWrapperLayout = useCallback((event: LayoutChangeEvent) => {
    if (Platform.OS !== "android" || isKeyboardVisibleRef.current) return
    const nextHeight = event.nativeEvent.layout.height
    if (nextHeight > 0) {
      setBaseContainerHeight((prev) =>
        prev === undefined || Math.abs(prev - nextHeight) > 1
          ? nextHeight
          : prev
      )
    }
  }, [])

  const { data: agentsData } = useListAgentsQuery({}, { enabled: isOpen })
  const defaultAgentId = agentsData?.agents?.[0]?.id

  const {
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
    threadId,
    onThreadCreated: (created) => {
      if (created.id) {
        setThreadId(created.id)
      }
    },
  })

  const hasConversation =
    messages.length > 0 ||
    Boolean(streamingMessage) ||
    isStreaming ||
    pendingApprovals.length > 0

  const snapPoints = useMemo(
    () => (hasConversation ? ["62%", "100%"] : ["36%", "96%"]),
    [hasConversation]
  )

  const animationConfigs = useMemo(
    () => ({
      damping: 26,
      stiffness: 240,
      overshootClamping: true,
    }),
    []
  )

  const isFullScreen = hasConversation && currentSnapIndex === 1

  const prevIsOpenRef = useRef(isOpen)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      haptics.light()
      sheetRef.current?.snapToIndex(0)
    } else if (!isOpen && prevIsOpenRef.current) {
      sheetRef.current?.close()
    }
    prevIsOpenRef.current = isOpen
  }, [isOpen])

  const prevHasConversationRef = useRef(hasConversation)
  useEffect(() => {
    if (!isOpen) {
      prevHasConversationRef.current = hasConversation
      return
    }
    if (!prevHasConversationRef.current && hasConversation) {
      requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(0)
      })
    }
    prevHasConversationRef.current = hasConversation
  }, [hasConversation, isOpen])

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
    if (isOpen && (isStreaming || messages.length > 0)) {
      scrollRef.current?.scrollToEnd?.({ animated: true })
    }
  }, [
    isOpen,
    isStreaming,
    messages.length,
    streamingMessage?.text,
    streamingMessage?.toolCalls.length,
  ])

  const ambientEntity = useMemo(
    () =>
      activeView?.activeEntity && !isAmbientDismissed
        ? activeView.activeEntity
        : null,
    [activeView?.activeEntity, isAmbientDismissed]
  )

  const contextRefs = useMemo(
    () =>
      deduplicateCopilotEntityRefs([
        ...(ambientEntity ? [ambientEntity] : []),
        ...pinnedItems,
      ]),
    [ambientEntity, pinnedItems]
  )

  const additionalPinnedItems = useMemo(
    () =>
      ambientEntity
        ? pinnedItems.filter((item) => item.key !== ambientEntity.key)
        : pinnedItems,
    [ambientEntity, pinnedItems]
  )

  const starterSuggestions = useMemo(() => {
    if (activeView?.suggestions && activeView.suggestions.length > 0) {
      return activeView.suggestions.slice(0, 3)
    }
    return [
      t("ai.copilotSheet.suggestOverview"),
      t("ai.copilotSheet.suggestFinance"),
      t("ai.copilotSheet.suggestCalendar"),
    ]
  }, [activeView, t])

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const content = (overrideText ?? input).trim()
      if (!content || isStreaming) return
      haptics.light()

      const serializedContent = formatCopilotPromptWithContext(
        content,
        contextRefs
      )

      if (!overrideText) {
        setInput("")
      }
      if (pinnedItems.length > 0) {
        clearPinnedItems()
      }

      await sendMessage({
        content: serializedContent,
        agentId: defaultAgentId,
        contextHint: activeView?.viewId ?? "mobile/copilot-sheet",
      })
    },
    [
      activeView?.viewId,
      clearPinnedItems,
      contextRefs,
      defaultAgentId,
      input,
      isStreaming,
      pinnedItems.length,
      sendMessage,
    ]
  )

  const handledPromptIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isOpen || !pendingPrompt) return
    if (handledPromptIdRef.current === pendingPrompt.id) return
    handledPromptIdRef.current = pendingPrompt.id

    const nextText = pendingPrompt.text
    const shouldAutoSend = Boolean(pendingPrompt.autoSend)
    consumePendingPrompt()

    if (shouldAutoSend) {
      void handleSend(nextText)
    } else {
      setInput(nextText)
    }
  }, [consumePendingPrompt, handleSend, isOpen, pendingPrompt])

  const handleNewChat = () => {
    haptics.selection()
    if (isStreaming) {
      void stop()
    }
    setThreadId(null)
    setInput("")
  }

  const handleOpenFullScreen = () => {
    haptics.light()
    const target = threadId ? `/(app)/ai/threads/${threadId}` : "/(app)/ai"
    closeCopilotSheet()
    router.push(target as never)
  }

  const handleClose = () => {
    haptics.light()
    closeCopilotSheet()
  }

  const isShimmerActive =
    streamPhase !== "idle" && streamPhase !== "awaiting_approval"

  const hasAssistantText = Boolean(
    splitThinkingFromText(streamingMessage?.text ?? "").text.trim()
  )

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.35}
        pressBehavior="close"
      />
    ),
    []
  )

  const handleSheetChange = useCallback(
    (index: number) => {
      setCurrentSnapIndex(index)
      if (index === -1 && isOpen) {
        closeCopilotSheet()
      }
    },
    [closeCopilotSheet, isOpen]
  )

  const sheetElement = (
    <BottomSheet
      ref={sheetRef}
      index={isOpen ? 0 : -1}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      animationConfigs={animationConfigs}
      enablePanDownToClose
      android_keyboardInputMode="adjustPan"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="none"
      backdropComponent={renderBackdrop}
      backgroundStyle={[
        styles.sheetBackground,
        isFullScreen && styles.sheetBackgroundFullscreen,
      ]}
      handleIndicatorStyle={styles.handleIndicator}
      onChange={handleSheetChange}
    >
      <CopilotSheetViewport
        isFullScreen={isFullScreen}
        hasConversation={hasConversation}
        topInset={insets.top}
      >
        {isShimmerActive ? <OrbitalStreamingShimmer /> : null}

        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerIconBadge}>
              <Sparkles size={14} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t("ai.copilotSheet.title")}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              testID="copilot-new-chat"
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              onPress={handleNewChat}
              accessibilityRole="button"
              accessibilityLabel={t("ai.copilotSheet.newChat")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Plus size={15} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              testID="copilot-open-fullscreen-route"
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              onPress={handleOpenFullScreen}
              accessibilityRole="button"
              accessibilityLabel={t("ai.copilotSheet.openFullScreen")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Maximize2 size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              testID="copilot-close-sheet"
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t("ai.copilotSheet.close")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <X size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {(ambientEntity || additionalPinnedItems.length > 0) && (
          <ScrollView
            horizontal
            style={styles.horizontalScroll}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.contextStrip}
          >
            {ambientEntity ? (
              <View
                testID="copilot-active-entity-chip"
                style={styles.entityChip}
              >
                <EntityKindIcon
                  kind={ambientEntity.kind}
                  color={colors.primary}
                />
                <Text style={styles.entityChipText} numberOfLines={1}>
                  {ambientEntity.label}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    haptics.selection()
                    dismissAmbient()
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("ai.copilotSheet.clearContext")}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <X size={12} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {additionalPinnedItems.map((item, idx) => (
              <View
                key={item.key}
                testID={
                  !ambientEntity && idx === 0
                    ? "copilot-active-entity-chip"
                    : `copilot-pinned-entity-chip-${item.key}`
                }
                style={styles.entityChip}
              >
                <EntityKindIcon kind={item.kind} color={colors.primary} />
                <Text style={styles.entityChipText} numberOfLines={1}>
                  {item.label}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    haptics.selection()
                    detachItem(item.key)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("ai.copilotSheet.clearContext")}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <X size={12} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {!hasConversation ? (
          <View style={styles.compactBody}>
            <ScrollView
              horizontal
              style={styles.horizontalScroll}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.suggestionsRow}
            >
              {starterSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  activeOpacity={0.75}
                  onPress={() => {
                    void handleSend(suggestion)
                  }}
                >
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : (
          <BottomSheetScrollView
            ref={scrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            keyboardShouldPersistTaps="handled"
          >
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

            {isStreaming && !hasAssistantText ? (
              <AssistantSkeletonBars />
            ) : null}

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
                  {error.message || t("ai.chatMobile.aiExecutionFailed")}
                </Text>
              </View>
            )}
          </BottomSheetScrollView>
        )}

        <View
          style={[
            styles.composerWrap,
            {
              paddingBottom: isKeyboardVisible
                ? 10
                : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.composerRow}>
            <BottomSheetTextInput
              testID="copilot-prompt-input"
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={t("ai.copilotSheet.askPlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
              multiline
            />
            {isStreaming ? (
              <TouchableOpacity
                testID="copilot-stop-btn"
                style={[styles.sendBtn, styles.stopBtn]}
                activeOpacity={0.75}
                onPress={() => {
                  haptics.medium()
                  void stop()
                }}
                accessibilityRole="button"
                accessibilityLabel={t("ai.chatMobile.stopAria")}
              >
                <Square size={14} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="copilot-send-btn"
                style={[
                  styles.sendBtn,
                  !input.trim() && styles.sendBtnDisabled,
                ]}
                activeOpacity={0.75}
                onPress={() => void handleSend()}
                disabled={!input.trim()}
                accessibilityRole="button"
                accessibilityLabel={t("ai.chatMobile.sendAria")}
              >
                <Send size={15} color={colors.primaryForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </CopilotSheetViewport>
    </BottomSheet>
  )

  if (Platform.OS === "android") {
    return (
      <View
        pointerEvents="box-none"
        onLayout={handleWrapperLayout}
        style={[
          StyleSheet.absoluteFill,
          isKeyboardVisible && baseContainerHeight
            ? { height: baseContainerHeight, bottom: undefined }
            : null,
        ]}
      >
        {sheetElement}
      </View>
    )
  }

  return sheetElement
}

const createStyles = (t: SaturnMobileTheme) => ({
  sheetBackground: {
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.borderStrong,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
  },
  sheetBackgroundFullscreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: t.colors.borderStrong,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetViewport: {
    width: "100%" as const,
    overflow: "hidden" as const,
  },
  sheetViewportFallback: {
    flex: 1,
    width: "100%" as const,
  },
  horizontalScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  shimmerTrack: {
    height: 2,
    width: "100%" as const,
    overflow: "hidden" as const,
    backgroundColor: t.colors.primarySubtle,
    flexShrink: 0,
  },
  shimmerBar: {
    height: 2,
    borderRadius: 1,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    flexShrink: 0,
  },
  headerTitleWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flexShrink: 1,
  },
  headerIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  contextStrip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  entityChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    maxWidth: 240,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: `${t.colors.primary}40`,
  },
  entityChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  compactBody: {
    flex: 1,
    justifyContent: "center" as const,
    paddingVertical: 6,
    minHeight: 48,
  },
  suggestionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
  },
  suggestionChip: {
    maxWidth: 220,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    lineHeight: 18,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 12,
    flexGrow: 1,
  },
  skeletonWrap: {
    gap: 8,
    paddingVertical: 4,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: t.colors.surfaceElevated,
  },
  skeletonBarWide: {
    width: "84%" as const,
  },
  skeletonBarNarrow: {
    width: "58%" as const,
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
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: t.colors.surface,
    flexShrink: 0,
  },
  composerRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 8,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 36,
    fontSize: 15,
    color: t.colors.textPrimary,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
