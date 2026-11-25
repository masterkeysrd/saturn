import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor, act } from "@testing-library/react"
import type { ThreadStreamPhase } from "@saturn/core"
import type {
  PendingToolApproval,
  ThreadMessage,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import type { StreamingAssistantDraft } from "@saturn/hooks/ai"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import {
  MobileCopilotProvider,
  useMobileCopilotView,
} from "../lib/copilot-sheet-context"
import { MobileCopilotSheet } from "../components/ai/mobile-copilot-sheet"
import { AIHeaderButton } from "../components/app-header"
import MailThreadScreen from "../app/(app)/mail/[threadId]"

const {
  mockRouterPush,
  mockSendMessage,
  mockStop,
  mockResolveApprovals,
  mockSnapToIndex,
  mockSheetClose,
  mockBottomSheetState,
  mockStreamState,
} = vi.hoisted(() => {
  const mockRouterPush = vi.fn()
  const mockSendMessage = vi.fn(async (_params: Record<string, unknown>) => {})
  const mockStop = vi.fn(async () => {})
  const mockResolveApprovals = vi.fn(async () => {})
  const mockSnapToIndex = vi.fn()
  const mockSheetClose = vi.fn()
  const mockBottomSheetState = {
    latestOnChange: null as ((index: number) => void) | null,
    latestSnapPoints: [] as (string | number)[],
    latestIndex: -1,
    latestAnimationConfigs: null as Record<string, unknown> | null,
    internal: null as {
      animatedPosition: { value: number }
      animatedLayoutState: {
        value: { containerHeight: number; handleHeight: number }
      }
      animatedKeyboardState: {
        value: { status: number; heightWithinContainer: number }
      }
      animatedDetentsState: {
        value: { detents?: number[] }
      }
    } | null,
  }
  const mockStreamState = {
    thread: undefined as { id?: string; title?: string } | undefined,
    messages: [] as ThreadMessage[],
    isLoadingMessages: false,
    isStreaming: false,
    status: "idle" as "idle" | "streaming" | "awaiting_approval",
    streamPhase: "idle" as ThreadStreamPhase,
    activeToolCall: null as {
      toolCallId: string
      toolName: string
      arguments?: Record<string, unknown>
      result?: Record<string, unknown>
      status: "running" | "completed" | "error"
    } | null,
    activeRunId: null as string | null,
    streamingMessage: null as StreamingAssistantDraft | null,
    pendingApprovals: [] as PendingToolApproval[],
    error: null as Error | null,
  }

  return {
    mockRouterPush,
    mockSendMessage,
    mockStop,
    mockResolveApprovals,
    mockSnapToIndex,
    mockSheetClose,
    mockBottomSheetState,
    mockStreamState,
  }
})

const ScreenFocusContext = React.createContext(true)
const mockStackScreenState = {
  options: null as Record<string, unknown> | null,
}

vi.mock("expo-router", async () => {
  const ReactMod = await import("react")
  return {
    useRouter: () => ({ push: mockRouterPush, back: vi.fn() }),
    useLocalSearchParams: () => ({ threadId: "thr_live_1" }),
    useIsFocused: () => ReactMod.useContext(ScreenFocusContext),
    Stack: {
      Screen: ({ options }: { options?: Record<string, unknown> }) => {
        mockStackScreenState.options = options ?? null
        return null
      },
    },
  }
})

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: vi.fn(),
}))

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(),
}))

vi.mock("../lib/config", () => ({
  getApiBaseUrl: () => "https://saturn.example.com",
}))

vi.mock("../components/mail/message-webview", async () => {
  const ReactMod = await import("react")
  return {
    MessageWebView: () =>
      ReactMod.createElement("div", { "data-testid": "mock-webview" }),
  }
})

vi.mock("../components/mail/thread-avatar", async () => {
  const ReactMod = await import("react")
  return {
    ThreadAvatar: () =>
      ReactMod.createElement("span", { "data-testid": "mock-thread-avatar" }),
  }
})

vi.mock("@saturn/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@saturn/hooks")>("@saturn/hooks")
  const staticMailThreadResult = {
    isLoading: false,
    error: null,
    data: {
      id: "thr_live_1",
      subject: "Board Deck Review",
      isUnread: false,
      isStarred: false,
      messageCount: 1,
      messages: [
        {
          id: "msg_1",
          from: "Ada Lovelace <ada@example.com>",
          to: ["me@example.com"],
          cc: [],
          date: "2026-04-19T12:00:00Z",
          snippet: "Please review slides 4-8.",
          bodyHtml: "<p>Please review slides 4-8.</p>",
          attachments: [],
        },
      ],
    },
  }
  const staticModifyMutation = { mutate: vi.fn(), isPending: false }
  const staticSummarizeMutation = { mutate: vi.fn(), isPending: false }

  return {
    ...actual,
    useMailThread: () => staticMailThreadResult,
    useModifyThread: () => staticModifyMutation,
    useSummarizeMailThread: () => staticSummarizeMutation,
  }
})

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
}))

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 20, left: 0, right: 0 }),
}))

vi.mock("../lib/space-context", () => ({
  useSpace: () => ({
    activeSpaceId: "spc_1",
    activeSpace: { id: "spc_1", name: "Personal" },
    spaces: [{ id: "spc_1", name: "Personal" }],
    activeSpaceRole: "owner",
    timezone: "UTC",
  }),
}))

vi.mock("../lib/haptics", () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ show: vi.fn(), hide: vi.fn() }),
}))

vi.mock("../components/ai/chat-message-bubble", async () => {
  const ReactMod = await import("react")
  return {
    ChatMessageBubble: ({
      message,
      streamingDraft,
      streamPhase,
    }: {
      message?: { id?: string; role?: string }
      streamingDraft?: { text?: string }
      streamPhase?: string
    }) =>
      ReactMod.createElement("div", {
        "data-testid": message
          ? `chat-bubble-${message.id ?? message.role}`
          : "chat-bubble-streaming",
        "data-phase": streamPhase,
        "data-text": streamingDraft?.text ?? "",
      }),
  }
})

vi.mock("../components/ai/tool-approval-card", async () => {
  const ReactMod = await import("react")
  return {
    ToolApprovalCard: ({ approval }: { approval: { toolCallId?: string } }) =>
      ReactMod.createElement("div", {
        "data-testid": `tool-approval-${approval.toolCallId ?? "unknown"}`,
      }),
  }
})

vi.mock("../components/ai/streaming-dots", async () => {
  const ReactMod = await import("react")
  return {
    StreamingDots: () =>
      ReactMod.createElement("span", { "data-testid": "streaming-dots" }),
  }
})

vi.mock("@saturn/api/saturn/platform/ai/v1/ai", () => ({
  useListAgentsQuery: () => ({
    data: { agents: [{ id: "agt_1", name: "Saturn Assistant" }] },
  }),
  useListThreadsQuery: () => ({
    data: { threads: [] },
  }),
}))

vi.mock("@saturn/hooks/ai", async () => {
  const actual =
    await vi.importActual<typeof import("@saturn/hooks/ai")>("@saturn/hooks/ai")
  return {
    ...actual,
    useThreadStream: () => ({
      ...mockStreamState,
      sendMessage: mockSendMessage,
      resolveApprovals: mockResolveApprovals,
      stop: mockStop,
      clearError: vi.fn(),
    }),
  }
})

const flattenMockStyle = (s: unknown): Record<string, unknown> | undefined => {
  if (!s) return undefined
  if (Array.isArray(s)) {
    return Object.assign(
      {},
      ...s.flat(Infinity).filter(Boolean).map(flattenMockStyle)
    )
  }
  return typeof s === "object" ? (s as Record<string, unknown>) : undefined
}

vi.mock("react-native-reanimated", async () => {
  const ReactMod = await import("react")
  const AnimatedView = ({ children, style, testID }: Record<string, unknown>) =>
    ReactMod.createElement(
      "div",
      { "data-testid": testID, style: flattenMockStyle(style) },
      children as React.ReactNode
    )

  return {
    default: { View: AnimatedView },
    Easing: {
      inOut: () => (v: number) => v,
      ease: (v: number) => v,
    },
    FadeInDown: { duration: () => ({}) },
    FadeOutUp: { duration: () => ({}) },
    cancelAnimation: vi.fn(),
    interpolate: (_v: number, _i: number[], o: number[]) => o[0],
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0],
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    useSharedValue: (val: number) => ({ value: val }),
    withDelay: (_d: number, v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...v: unknown[]) => v[0],
    withTiming: (v: unknown) => v,
  }
})

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const BottomSheet = ReactMod.forwardRef(
    (
      {
        children,
        snapPoints,
        index,
        animationConfigs,
        onChange,
      }: {
        children?: React.ReactNode
        snapPoints: (string | number)[]
        index: number
        animationConfigs?: Record<string, unknown>
        onChange?: (index: number) => void
      },
      ref
    ) => {
      mockBottomSheetState.latestOnChange = onChange ?? null
      mockBottomSheetState.latestSnapPoints = snapPoints
      mockBottomSheetState.latestIndex = index
      mockBottomSheetState.latestAnimationConfigs = animationConfigs ?? null

      ReactMod.useImperativeHandle(ref, () => ({
        snapToIndex: (nextIdx: number) => {
          mockSnapToIndex(nextIdx)
          onChange?.(nextIdx)
        },
        close: () => {
          mockSheetClose()
          onChange?.(-1)
        },
      }))

      return ReactMod.createElement(
        "div",
        {
          "data-testid": "copilot-bottom-sheet",
          "data-snap-points": JSON.stringify(snapPoints),
          "data-index": String(index),
        },
        index >= 0 ? children : null
      )
    }
  )
  BottomSheet.displayName = "BottomSheet"

  const BottomSheetScrollView = ReactMod.forwardRef(
    ({ children }: Record<string, unknown>, ref) => {
      ReactMod.useImperativeHandle(ref, () => ({
        scrollToEnd: vi.fn(),
      }))
      return ReactMod.createElement("div", null, children as React.ReactNode)
    }
  )
  BottomSheetScrollView.displayName = "BottomSheetScrollView"

  return {
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView,
    useBottomSheetInternal: () => mockBottomSheetState.internal,
    BottomSheetTextInput: ({
      value,
      onChangeText,
      placeholder,
      testID,
    }: {
      value?: string
      onChangeText?: (t: string) => void
      placeholder?: string
      testID?: string
    }) =>
      ReactMod.createElement("input", {
        "data-testid": testID,
        value: value ?? "",
        placeholder,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChangeText?.(e.target.value),
      }),
  }
})

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const Stub = (name: string) => (props: Record<string, unknown>) =>
    ReactMod.createElement("span", { "data-icon": name, ...props })
  return {
    Archive: Stub("Archive"),
    Bot: Stub("Bot"),
    Brain: Stub("Brain"),
    Building2: Stub("Building2"),
    Calendar: Stub("Calendar"),
    CalendarPlus: Stub("CalendarPlus"),
    Check: Stub("Check"),
    CheckCircle2: Stub("CheckCircle2"),
    ChevronDown: Stub("ChevronDown"),
    ChevronRight: Stub("ChevronRight"),
    ChevronUp: Stub("ChevronUp"),
    Copy: Stub("Copy"),
    CornerUpLeft: Stub("CornerUpLeft"),
    Download: Stub("Download"),
    FileText: Stub("FileText"),
    Forward: Stub("Forward"),
    GitBranch: Stub("GitBranch"),
    Landmark: Stub("Landmark"),
    Mail: Stub("Mail"),
    Maximize2: Stub("Maximize2"),
    Paperclip: Stub("Paperclip"),
    PiggyBank: Stub("PiggyBank"),
    Plug: Stub("Plug"),
    Plus: Stub("Plus"),
    ReceiptText: Stub("ReceiptText"),
    RefreshCw: Stub("RefreshCw"),
    Reply: Stub("Reply"),
    ReplyAll: Stub("ReplyAll"),
    Send: Stub("Send"),
    Share2: Stub("Share2"),
    ShieldAlert: Stub("ShieldAlert"),
    Sparkles: Stub("Sparkles"),
    Square: Stub("Square"),
    Star: Stub("Star"),
    Trash2: Stub("Trash2"),
    Wallet: Stub("Wallet"),
    Wrench: Stub("Wrench"),
    X: Stub("X"),
    XCircle: Stub("XCircle"),
  }
})

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> | undefined => {
    if (!s) return undefined
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s.flat(Infinity).filter(Boolean).map(flattenStyle)
      )
    }
    return typeof s === "object" ? (s as Record<string, unknown>) : undefined
  }
  return {
    Appearance: { setColorScheme: vi.fn() },
    ActivityIndicator: () => ReactMod.createElement("span"),
    Alert: { alert: vi.fn() },
    Keyboard: {
      addListener: () => ({ remove: vi.fn() }),
      isVisible: () => false,
    },
    Linking: { openURL: vi.fn() },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    Pressable: ({
      children,
      onPress,
      testID,
      accessibilityLabel,
      style,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      testID?: string
      accessibilityLabel?: string
      style?: unknown
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
          onClick: onPress,
        },
        children
      ),
    Share: { share: vi.fn(async () => ({})) },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      absoluteFill: {},
    },
    useColorScheme: () => "dark",
    View: ({ children, style, testID }: Record<string, unknown>) =>
      ReactMod.createElement(
        "div",
        { "data-testid": testID, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    Text: ({ children, style, testID }: Record<string, unknown>) =>
      ReactMod.createElement(
        "span",
        { "data-testid": testID, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    ScrollView: ({ children }: Record<string, unknown>) =>
      ReactMod.createElement("div", null, children as React.ReactNode),
    TouchableOpacity: ({
      children,
      onPress,
      disabled,
      testID,
      accessibilityLabel,
      style,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      disabled?: boolean
      testID?: string
      accessibilityLabel?: string
      style?: unknown
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          disabled,
          style: flattenStyle(style),
          onClick: onPress,
        },
        children
      ),
  }
})

function SampleMailThreadScreen() {
  useRegisterCopilotView({
    viewId: "mobile.mail.thread",
    title: "Q4 Invoice Follow-up",
    activeEntity: {
      key: "mail_thread:thr_42",
      kind: "mail_thread",
      id: "thr_42",
      label: "Q4 Invoice Follow-up",
      summary: { isUnread: true, messageCount: 3 },
    },
    suggestions: [
      "Summarize this email thread",
      "Draft a concise reply",
      "Extract action items",
    ],
  })
  return <AIHeaderButton />
}

describe("MobileCopilotSheet & Contextual Header Trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBottomSheetState.latestOnChange = null
    mockBottomSheetState.latestSnapPoints = []
    mockBottomSheetState.latestIndex = -1
    mockBottomSheetState.latestAnimationConfigs = null
    mockBottomSheetState.internal = null
    mockStreamState.thread = undefined
    mockStreamState.messages = []
    mockStreamState.isStreaming = false
    mockStreamState.status = "idle"
    mockStreamState.streamPhase = "idle"
    mockStreamState.activeToolCall = null
    mockStreamState.streamingMessage = null
    mockStreamState.pendingApprovals = []
    mockStreamState.error = null
  })

  it("opens from AIHeaderButton into compact 36%/96% detents showing activeEntity chip and view suggestions", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <MobileCopilotProvider>
        <SampleMailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    expect(queryByTestId("copilot-sheet-root")).toBeNull()

    fireEvent.click(getByTestId("ai-header-button"))

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockSnapToIndex).toHaveBeenCalledWith(0)
    expect(
      getByTestId("copilot-bottom-sheet").getAttribute("data-snap-points")
    ).toBe(JSON.stringify(["36%", "96%"]))
    expect(getByTestId("copilot-active-entity-chip").textContent).toContain(
      "Q4 Invoice Follow-up"
    )
    expect(getByText("Summarize this email thread")).toBeTruthy()
    expect(getByText("Draft a concise reply")).toBeTruthy()
  })

  it("switches to 62%/100% detents on prompt send, serializes <attached_context>, supports full-screen swipe + swipe back down, and renders streaming shimmer", async () => {
    const { getByTestId, getByText, queryByTestId, rerender } = render(
      <MobileCopilotProvider>
        <SampleMailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    fireEvent.click(getByTestId("ai-header-button"))
    expect(queryByTestId("copilot-streaming-shimmer")).toBeNull()

    fireEvent.click(getByText("Summarize this email thread"))

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
    })

    const sentPayload = mockSendMessage.mock.calls[0][0]
    expect(sentPayload.content).toContain("<attached_context>")
    expect(sentPayload.content).toContain("mail_thread:thr_42")
    expect(sentPayload.content).toContain("Q4 Invoice Follow-up")
    expect(sentPayload.content).toContain("</attached_context>")
    expect(sentPayload.content).toContain("Summarize this email thread")
    expect(sentPayload.contextHint).toBe("mobile.mail.thread")

    mockStreamState.isStreaming = true
    mockStreamState.status = "streaming"
    mockStreamState.streamPhase = "tool_running"
    mockStreamState.activeToolCall = {
      toolCallId: "tc_1",
      toolName: "mail_get_thread",
      status: "running",
    }
    mockStreamState.streamingMessage = {
      thinking: "",
      text: "",
      toolCalls: [
        {
          toolCallId: "tc_1",
          toolName: "mail_get_thread",
          status: "running",
        },
      ],
    }

    rerender(
      <MobileCopilotProvider>
        <SampleMailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    expect(
      getByTestId("copilot-bottom-sheet").getAttribute("data-snap-points")
    ).toBe(JSON.stringify(["62%", "100%"]))
    expect(getByTestId("copilot-streaming-shimmer")).toBeTruthy()
    expect(getByTestId("copilot-streaming-skeleton")).toBeTruthy()

    // Swipe up to 100% full-screen applies safe-area top inset
    act(() => {
      mockBottomSheetState.latestOnChange?.(1)
    })
    expect(getByTestId("copilot-sheet-root").style.paddingTop).toBe("44px")

    // Swipe down from 100% back to 62% normal size removes full-screen top inset
    act(() => {
      mockBottomSheetState.latestOnChange?.(0)
    })
    expect(getByTestId("copilot-sheet-root").style.paddingTop).toBe("")
  })

  it("escalates to full-screen AI route when pressing [↗] and falls back to route when AIHeaderButton has no provider", () => {
    const { getByTestId } = render(
      <MobileCopilotProvider>
        <SampleMailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    fireEvent.click(getByTestId("ai-header-button"))
    fireEvent.click(getByTestId("copilot-open-fullscreen-route"))

    expect(mockSheetClose).toHaveBeenCalled()
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/ai")

    mockRouterPush.mockClear()
    const isolated = render(<AIHeaderButton testID="isolated-ai-btn" />)
    fireEvent.click(isolated.getByTestId("isolated-ai-btn"))
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/ai")
  })

  it("omits <attached_context> after dismissing the active entity chip", async () => {
    const { getByTestId, getByLabelText, queryByTestId } = render(
      <MobileCopilotProvider>
        <SampleMailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    fireEvent.click(getByTestId("ai-header-button"))
    expect(getByTestId("copilot-active-entity-chip")).toBeTruthy()

    fireEvent.click(getByLabelText("Remove context"))
    expect(queryByTestId("copilot-active-entity-chip")).toBeNull()

    fireEvent.change(getByTestId("copilot-prompt-input"), {
      target: { value: "What are my open tasks?" },
    })
    fireEvent.click(getByTestId("copilot-send-btn"))

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
    })
    expect(mockSendMessage.mock.calls[0][0].content).toBe(
      "What are my open tasks?"
    )
  })

  it("bounds CopilotSheetViewport height to active detent and keyboard geometry instead of overflowing off-screen", () => {
    const cases = [
      {
        name: "36% compact empty detent keeps suggestions and composer inside 283px visible viewport",
        position: 545,
        detents: [545, 34],
        keyboardStatus: 0,
        keyboardHeight: 0,
        expectedHeight: "283px",
        expectedPaddingTop: "0px",
      },
      {
        name: "slide-in opening gesture clamps to lowest detent height so compact card does not squish",
        position: 760,
        detents: [545, 34],
        keyboardStatus: 0,
        keyboardHeight: 0,
        expectedHeight: "283px",
        expectedPaddingTop: "0px",
      },
      {
        name: "62% conversation detent bounds viewport to 504px so composer stays visible",
        position: 324,
        detents: [324, 0],
        keyboardStatus: 0,
        keyboardHeight: 0,
        expectedHeight: "504px",
        expectedPaddingTop: "0px",
      },
      {
        name: "100% full-screen detent expands to 828px with 44px top safe-area inset",
        position: 0,
        detents: [324, 0],
        keyboardStatus: 0,
        keyboardHeight: 0,
        expectedHeight: "828px",
        expectedPaddingTop: "44px",
      },
      {
        name: "interactive software keyboard subtracts keyboard height so composer sits above keyboard",
        position: 0,
        detents: [324, 0],
        keyboardStatus: 1,
        keyboardHeight: 336,
        expectedHeight: "492px",
        expectedPaddingTop: "44px",
      },
    ]

    for (const tc of cases) {
      mockBottomSheetState.internal = {
        animatedPosition: { value: tc.position },
        animatedLayoutState: {
          value: { containerHeight: 852, handleHeight: 24 },
        },
        animatedKeyboardState: {
          value: {
            status: tc.keyboardStatus,
            heightWithinContainer: tc.keyboardHeight,
          },
        },
        animatedDetentsState: {
          value: { detents: tc.detents },
        },
      }

      const view = render(
        <MobileCopilotProvider>
          <SampleMailThreadScreen />
          <MobileCopilotSheet />
        </MobileCopilotProvider>
      )

      fireEvent.click(view.getByTestId("ai-header-button"))
      const sheetRoot = view.getByTestId("copilot-sheet-root")
      expect(sheetRoot.style.height, tc.name).toBe(tc.expectedHeight)
      expect(sheetRoot.style.paddingTop, tc.name).toBe(tc.expectedPaddingTop)
      view.unmount()
    }
  })

  it("switches Copilot suggestions and entity context cleanly when focus moves from Mail back to persistent Calendar tab", () => {
    function PersistentCalendarTab() {
      useMobileCopilotView({
        viewId: "mobile.calendar",
        title: "Calendar",
        suggestions: [
          "What's on my schedule around 2026-04-19?",
          "Find open focus blocks this week",
          "Check for overlapping meetings",
        ],
      })
      return null
    }

    function PersistentMailScreen() {
      useMobileCopilotView({
        viewId: "mobile.mail.thread",
        title: "Vendor Contract",
        activeEntity: {
          key: "mail_thread:thr_99",
          kind: "mail_thread",
          id: "thr_99",
          label: "Vendor Contract",
        },
        suggestions: [
          "Summarize this thread and extract action items",
          "Draft a concise reply",
          "Find deadlines or commitments in this thread",
        ],
      })
      return null
    }

    function PersistentTabShell({
      focusedScreen,
    }: {
      focusedScreen: "calendar" | "mail"
    }) {
      return (
        <MobileCopilotProvider>
          <ScreenFocusContext.Provider value={focusedScreen === "calendar"}>
            <PersistentCalendarTab />
          </ScreenFocusContext.Provider>
          <ScreenFocusContext.Provider value={focusedScreen === "mail"}>
            <PersistentMailScreen />
          </ScreenFocusContext.Provider>
          <AIHeaderButton />
          <MobileCopilotSheet />
        </MobileCopilotProvider>
      )
    }

    const { getByTestId, getByText, queryByText, queryByTestId, rerender } =
      render(<PersistentTabShell focusedScreen="mail" />)

    // User switches back to already-mounted Calendar tab (Mail stays mounted unfocused)
    rerender(<PersistentTabShell focusedScreen="calendar" />)

    fireEvent.click(getByTestId("ai-header-button"))

    expect(getByText("What's on my schedule around 2026-04-19?")).toBeTruthy()
    expect(getByText("Find open focus blocks this week")).toBeTruthy()
    expect(queryByText("Draft a concise reply")).toBeNull()
    expect(queryByTestId("copilot-active-entity-chip")).toBeNull()
  })

  it("keeps MailThreadScreen iOS header right items to 3 so sparkles AI trigger is never clipped and opens Copilot sheet", () => {
    mockStackScreenState.options = null

    const { getByTestId, getByText } = render(
      <MobileCopilotProvider>
        <MailThreadScreen />
        <MobileCopilotSheet />
      </MobileCopilotProvider>
    )

    const capturedOptions = mockStackScreenState.options as Record<
      string,
      unknown
    > | null
    const getHeaderRightItems = capturedOptions?.unstable_headerRightItems as
      | (() => {
          type: string
          label: string
          icon?: { name?: string }
          onPress?: () => void
        }[])
      | undefined

    expect(getHeaderRightItems).toBeTypeOf("function")
    const items = getHeaderRightItems!()
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.icon?.name)).toEqual([
      "archivebox",
      "ellipsis",
      "sparkles",
    ])

    act(() => {
      items[2].onPress?.()
    })

    expect(getByTestId("copilot-active-entity-chip").textContent).toContain(
      "Board Deck Review"
    )
    expect(
      getByText("Summarize this thread and extract action items")
    ).toBeTruthy()
    expect(getByText("Draft a concise reply")).toBeTruthy()
  })
})
