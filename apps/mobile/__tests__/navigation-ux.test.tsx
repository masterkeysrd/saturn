import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import {
  formatTabBadgeCount,
  sumInboxUnreadCount,
  countOverdueOrDueTodayScheduled,
} from "../lib/tab-badges"
import {
  canWriteWorkspace,
  resolveTransactionFlowType,
  getOverviewQuickCaptureActions,
  getFinanceQuickCaptureActions,
} from "../lib/quick-capture"
import {
  getNextCycledSpace,
  resolveVerticalSwipeDirection,
} from "../lib/space-switcher"
import { SpaceAvatarButton } from "../components/app-header"
import {
  QuickCaptureFab,
  QuickCaptureSheet,
} from "../components/ui/quick-capture-sheet"
import { haptics } from "../lib/haptics"

const { mockSwitchSpace, mockToastShow, mockUseSpace } = vi.hoisted(() => {
  const mockSwitchSpace = vi.fn(async (_spaceId: string) => undefined)
  const mockToastShow = vi.fn()
  const mockUseSpace = vi.fn(() => ({
    spaces: [
      { id: "spc_personal", name: "Personal" },
      { id: "spc_acme", name: "Acme Corp" },
      { id: "spc_family", name: "Family Budget" },
    ],
    activeSpace: { id: "spc_acme", name: "Acme Corp" },
    activeSpaceId: "spc_acme",
    activeSpaceRole: "owner" as const,
    isLoading: false,
    isSwitching: false,
    isOwner: true,
    canManageMembers: true,
    timezone: "UTC",
    mailAutoLoadRemoteContent: false,
    calendarMobileView: "agenda" as const,
    updateMailPreferences: vi.fn(async () => undefined),
    updateCalendarPreferences: vi.fn(async () => undefined),
    switchSpace: mockSwitchSpace,
    refetchSpaces: vi.fn(),
  }))
  return { mockSwitchSpace, mockToastShow, mockUseSpace }
})

vi.mock("../lib/space-context", () => ({
  useSpace: mockUseSpace,
}))

vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ show: mockToastShow, hide: vi.fn() }),
}))

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

vi.mock("@saturn/api/saturn/platform/ai/v1/ai", () => ({
  useListThreadsQuery: () => ({ data: { threads: [] } }),
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

vi.mock("../components/ui/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const AppBottomSheet = ReactMod.forwardRef(
    (
      { title, children }: { title?: string; children?: React.ReactNode },
      _ref
    ) =>
      ReactMod.createElement(
        "div",
        { "data-testid": "app-bottom-sheet", "data-title": title },
        children
      )
  )
  AppBottomSheet.displayName = "AppBottomSheet"
  return { AppBottomSheet }
})

const mockRouterPush = vi.fn()
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, back: vi.fn() }),
  useIsFocused: () => true,
}))

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const Stub = (name: string) => (props: Record<string, unknown>) =>
    ReactMod.createElement("span", { "data-icon": name, ...props })
  return {
    Plus: Stub("Plus"),
    ArrowDownLeft: Stub("ArrowDownLeft"),
    ArrowUpRight: Stub("ArrowUpRight"),
    ArrowRightLeft: Stub("ArrowRightLeft"),
    CalendarClock: Stub("CalendarClock"),
    Landmark: Stub("Landmark"),
    PiggyBank: Stub("PiggyBank"),
    CalendarPlus: Stub("CalendarPlus"),
    MailPlus: Stub("MailPlus"),
    Sparkles: Stub("Sparkles"),
    ChevronRight: Stub("ChevronRight"),
    Inbox: Stub("Inbox"),
    X: Stub("X"),
  }
})

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const BottomSheet = ReactMod.forwardRef(
    ({ children }: { children?: React.ReactNode }, _ref) =>
      ReactMod.createElement("div", { "data-testid": "bottom-sheet" }, children)
  )
  BottomSheet.displayName = "BottomSheet"
  return {
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
      ReactMod.createElement("div", null, children),
    TouchableOpacity: ({
      children,
      onPress,
      ...props
    }: Record<string, unknown>) =>
      ReactMod.createElement(
        "button",
        { onClick: onPress, ...props },
        children as React.ReactNode
      ),
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
    Keyboard: { addListener: () => ({ remove: vi.fn() }) },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      absoluteFill: {},
    },
    useColorScheme: () => "dark",
    Image: ({ style, ...props }: Record<string, unknown>) =>
      ReactMod.createElement("img", { ...props, style: flattenStyle(style) }),
    View: ({ children, style, ...props }: Record<string, unknown>) =>
      ReactMod.createElement(
        "div",
        { ...props, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    Text: ({ children, style, ...props }: Record<string, unknown>) =>
      ReactMod.createElement(
        "span",
        { ...props, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    TouchableOpacity: ({
      children,
      onPress,
      onLongPress,
      onTouchStart,
      onTouchEnd,
      testID,
      accessibilityRole,
      accessibilityLabel,
      accessibilityHint,
      style,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      onLongPress?: () => void
      onTouchStart?: (e: unknown) => void
      onTouchEnd?: (e: unknown) => void
      testID?: string
      accessibilityRole?: string
      accessibilityLabel?: string
      accessibilityHint?: string
      style?: unknown
    }) =>
      ReactMod.createElement(
        "button",
        {
          "data-testid": testID,
          role: accessibilityRole,
          "aria-label": accessibilityLabel,
          "data-hint": accessibilityHint,
          style: flattenStyle(style),
          onClick: onPress,
          onContextMenu: onLongPress,
          onTouchStart,
          onTouchEnd,
        },
        children
      ),
  }
})

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}))

describe("Mobile Navigation UX, Tab Badges & Quick Capture", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("formatTabBadgeCount", () => {
    it("returns undefined for non-positive or non-finite counts", () => {
      expect(formatTabBadgeCount(0)).toBeUndefined()
      expect(formatTabBadgeCount(-5)).toBeUndefined()
      expect(formatTabBadgeCount(Number.NaN)).toBeUndefined()
      expect(formatTabBadgeCount(Number.POSITIVE_INFINITY)).toBeUndefined()
    })

    it("returns exact integer count between 1 and 99", () => {
      expect(formatTabBadgeCount(1)).toBe(1)
      expect(formatTabBadgeCount(17)).toBe(17)
      expect(formatTabBadgeCount(99)).toBe(99)
    })

    it('caps counts above 99 to "99+"', () => {
      expect(formatTabBadgeCount(100)).toBe("99+")
      expect(formatTabBadgeCount(420)).toBe("99+")
    })
  })

  describe("sumInboxUnreadCount", () => {
    it("sums unreadCount strictly for MAILBOX_ROLE_INBOX and ignores TRASH/SENT/etc.", () => {
      const mailboxes = [
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 5 },
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 12 },
        { systemRole: "MAILBOX_ROLE_SENT", unreadCount: 30 },
        { systemRole: "MAILBOX_ROLE_TRASH", unreadCount: 99 },
        { systemRole: "MAILBOX_ROLE_DRAFTS", unreadCount: 4 },
        { systemRole: "MAILBOX_ROLE_ARCHIVE", unreadCount: 18 },
      ]

      expect(sumInboxUnreadCount(mailboxes)).toBe(17)
      expect(formatTabBadgeCount(sumInboxUnreadCount(mailboxes))).toBe(17)
    })

    it("handles empty, undefined, and > 99 totals cleanly", () => {
      expect(sumInboxUnreadCount(undefined)).toBe(0)
      expect(sumInboxUnreadCount([])).toBe(0)

      const largeMailboxes = [
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 60 },
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 45 },
        { systemRole: "MAILBOX_ROLE_TRASH", unreadCount: 200 },
      ]
      const total = sumInboxUnreadCount(largeMailboxes)
      expect(total).toBe(105)
      expect(formatTabBadgeCount(total)).toBe("99+")
    })
  })

  describe("countOverdueOrDueTodayScheduled", () => {
    it("respects timezone boundaries for dueDate comparisons", () => {
      // 2026-10-21T02:00:00Z is:
      // - 2026-10-20 22:00 in America/New_York (UTC-4)
      // - 2026-10-21 11:00 in Asia/Tokyo (UTC+9)
      const now = new Date("2026-10-21T02:00:00Z")
      const items = [
        { status: "PENDING", dueDate: "2026-10-20" }, // overdue in Tokyo, due today in NY
        { status: "PENDING", dueDate: "2026-10-21" }, // due today in Tokyo, tomorrow in NY
        { status: "PENDING", dueDate: "2026-10-22" }, // future in both
        { status: "CONFIRMED", dueDate: "2026-10-19" }, // already confirmed
        { status: "SKIPPED", dueDate: "2026-10-19" }, // skipped
      ]

      expect(
        countOverdueOrDueTodayScheduled(items, now, "America/New_York")
      ).toBe(1)
      expect(countOverdueOrDueTodayScheduled(items, now, "Asia/Tokyo")).toBe(2)
    })

    it("handles ISO timestamps and empty lists across midnight boundaries", () => {
      const now = new Date("2026-10-21T03:00:00Z")
      const items = [
        { status: "PENDING", dueDate: "2026-10-21T02:00:00Z" },
        { status: "PENDING", dueDate: "2026-10-21T15:00:00Z" },
      ]

      // In America/New_York (2026-10-20 23:00): first item is 2026-10-20 (due today), second is 2026-10-21 (tomorrow)
      expect(
        countOverdueOrDueTodayScheduled(items, now, "America/New_York")
      ).toBe(1)
      // In UTC (2026-10-21): both are 2026-10-21
      expect(countOverdueOrDueTodayScheduled(items, now, "UTC")).toBe(2)
      expect(countOverdueOrDueTodayScheduled(undefined, now, "UTC")).toBe(0)
    })
  })

  describe("Quick Capture Routing & Role Gating", () => {
    it("resolves type and tab query params safely with EXPENSE fallback", () => {
      expect(resolveTransactionFlowType("INCOME")).toBe("INCOME")
      expect(resolveTransactionFlowType("transfer")).toBe("TRANSFER")
      expect(resolveTransactionFlowType(undefined, "scheduled")).toBe(
        "SCHEDULED"
      )
      expect(resolveTransactionFlowType(undefined, "BORROWING")).toBe(
        "BORROWING"
      )
      expect(resolveTransactionFlowType("UNKNOWN", "INVALID")).toBe("EXPENSE")
      expect(resolveTransactionFlowType()).toBe("EXPENSE")
    })

    it("gates workspace write actions away from viewers", () => {
      expect(canWriteWorkspace("owner")).toBe(true)
      expect(canWriteWorkspace("admin")).toBe(true)
      expect(canWriteWorkspace("member")).toBe(true)
      expect(canWriteWorkspace("viewer")).toBe(false)
      expect(canWriteWorkspace(undefined)).toBe(false)

      const memberOverview = getOverviewQuickCaptureActions("member")
      expect(memberOverview.map((a) => a.route)).toEqual([
        "/modal/add-transaction?type=EXPENSE",
        "/modal/add-transaction?type=INCOME",
        "/modal/add-transaction?type=TRANSFER",
        "/modal/manage-event",
        "/modal/compose-mail",
        "/(app)/ai",
      ])

      const viewerOverview = getOverviewQuickCaptureActions("viewer")
      expect(viewerOverview.map((a) => a.route)).toEqual([
        "/modal/compose-mail",
        "/(app)/ai",
      ])

      const ownerFinance = getFinanceQuickCaptureActions("owner")
      expect(ownerFinance.map((a) => a.route)).toEqual([
        "/modal/add-transaction?type=EXPENSE",
        "/modal/add-transaction?type=INCOME",
        "/modal/add-transaction?type=TRANSFER",
        "/modal/add-transaction?type=SCHEDULED",
        "/modal/manage-account",
        "/modal/manage-budget",
        "/(app)/finance/inbox",
      ])

      expect(getFinanceQuickCaptureActions("viewer")).toEqual([])
    })
  })

  describe("QuickCaptureFab & QuickCaptureSheet interaction & haptics", () => {
    it("triggers light haptic on tap and medium haptic on long press", () => {
      const onPress = vi.fn()
      const onLongPress = vi.fn()

      const { getByTestId } = render(
        <QuickCaptureFab
          testID="test-quick-fab"
          accessibilityLabel="Quick action"
          onPress={onPress}
          onLongPress={onLongPress}
        />
      )

      const btn = getByTestId("test-quick-fab")
      fireEvent.click(btn)
      expect(haptics.light).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledTimes(1)

      fireEvent.contextMenu(btn)
      expect(haptics.medium).toHaveBeenCalledTimes(1)
      expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it("renders QuickCaptureSheet actions and routes with haptic feedback on selection", () => {
      const onClose = vi.fn()
      const actions = getOverviewQuickCaptureActions("owner")

      const { getByTestId } = render(
        <QuickCaptureSheet
          title="Quick Capture"
          actions={actions}
          onClose={onClose}
        />
      )

      fireEvent.click(getByTestId("quick-capture-action-record-expense"))
      expect(haptics.light).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/modal/add-transaction?type=EXPENSE"
      )
    })
  })

  describe("getNextCycledSpace", () => {
    const spaces = [
      { id: "spc_1", name: "Personal" },
      { id: "spc_2", name: "Acme Corp" },
      { id: "spc_3", name: "Family" },
    ]

    it.each([
      {
        name: "returns null for empty list",
        list: [],
        activeId: "spc_1",
        dir: "next" as const,
        expectedId: null,
      },
      {
        name: "returns null for single valid space",
        list: [{ id: "spc_1", name: "Only" }, { id: "" }, { name: "No ID" }],
        activeId: "spc_1",
        dir: "next" as const,
        expectedId: null,
      },
      {
        name: "advances forward on next",
        list: spaces,
        activeId: "spc_1",
        dir: "next" as const,
        expectedId: "spc_2",
      },
      {
        name: "wraps from end to start on next",
        list: spaces,
        activeId: "spc_3",
        dir: "next" as const,
        expectedId: "spc_1",
      },
      {
        name: "steps backward on prev",
        list: spaces,
        activeId: "spc_2",
        dir: "prev" as const,
        expectedId: "spc_1",
      },
      {
        name: "wraps from start to end on prev",
        list: spaces,
        activeId: "spc_1",
        dir: "prev" as const,
        expectedId: "spc_3",
      },
      {
        name: "falls back to index 0 when activeSpaceId is unknown",
        list: spaces,
        activeId: "spc_missing",
        dir: "next" as const,
        expectedId: "spc_2",
      },
      {
        name: "falls back to index 0 on prev when activeSpaceId is null",
        list: spaces,
        activeId: null,
        dir: "prev" as const,
        expectedId: "spc_3",
      },
    ])("$name", ({ list, activeId, dir, expectedId }) => {
      const result = getNextCycledSpace(list, activeId, dir)
      expect(result?.id ?? null).toBe(expectedId)
    })
  })

  describe("resolveVerticalSwipeDirection", () => {
    it.each([
      { name: "returns null below threshold", dy: -15, dx: 0, expected: null },
      {
        name: "returns null for horizontal-dominant swipe",
        dy: -30,
        dx: 45,
        expected: null,
      },
      {
        name: "returns null for non-finite input",
        dy: Number.NaN,
        dx: 0,
        expected: null,
      },
      {
        name: "returns next for negative dy (swipe up)",
        dy: -28,
        dx: 4,
        expected: "next" as const,
      },
      {
        name: "returns prev for positive dy (swipe down)",
        dy: 32,
        dx: -6,
        expected: "prev" as const,
      },
      {
        name: "respects custom threshold",
        dy: 30,
        dx: 0,
        threshold: 40,
        expected: null,
      },
    ])("$name", ({ dy, dx, threshold, expected }) => {
      expect(resolveVerticalSwipeDirection(dy, dx, threshold)).toBe(expected)
    })
  })

  describe("SpaceAvatarButton", () => {
    beforeEach(() => {
      mockUseSpace.mockReturnValue({
        spaces: [
          { id: "spc_personal", name: "Personal" },
          { id: "spc_acme", name: "Acme Corp" },
          { id: "spc_family", name: "Family Budget" },
        ],
        activeSpace: { id: "spc_acme", name: "Acme Corp" },
        activeSpaceId: "spc_acme",
        activeSpaceRole: "owner" as const,
        isLoading: false,
        isSwitching: false,
        isOwner: true,
        canManageMembers: true,
        timezone: "UTC",
        mailAutoLoadRemoteContent: false,
        calendarMobileView: "agenda" as const,
        updateMailPreferences: vi.fn(async () => undefined),
        updateCalendarPreferences: vi.fn(async () => undefined),
        switchSpace: mockSwitchSpace,
        refetchSpaces: vi.fn(),
      })
    })

    it("renders active workspace initials and opens switch-space modal on tap", () => {
      const { getByTestId, getByText } = render(<SpaceAvatarButton />)

      expect(getByText("AC")).toBeTruthy()
      const btn = getByTestId("space-avatar-button")
      expect(btn.getAttribute("aria-label")).toContain("Acme Corp")

      fireEvent.click(btn)
      expect(haptics.light).toHaveBeenCalledTimes(1)
      expect(mockRouterPush).toHaveBeenCalledWith("/modal/switch-space")
    })

    it("cycles to next workspace on swipe up without opening modal", async () => {
      const { getByTestId } = render(<SpaceAvatarButton />)
      const btn = getByTestId("space-avatar-button")

      fireEvent.touchStart(btn, {
        changedTouches: [{ pageX: 100, pageY: 100 }],
      })
      fireEvent.touchEnd(btn, {
        changedTouches: [{ pageX: 102, pageY: 60 }],
      })
      fireEvent.click(btn)

      await waitFor(() => {
        expect(mockSwitchSpace).toHaveBeenCalledWith("spc_family")
      })
      expect(haptics.medium).toHaveBeenCalledTimes(1)
      expect(mockToastShow).toHaveBeenCalledWith({
        type: "info",
        title: "Switched to Family Budget",
      })
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it("cycles to previous workspace on swipe down without opening modal", async () => {
      const { getByTestId } = render(<SpaceAvatarButton />)
      const btn = getByTestId("space-avatar-button")

      fireEvent.touchStart(btn, {
        changedTouches: [{ pageX: 100, pageY: 100 }],
      })
      fireEvent.touchEnd(btn, {
        changedTouches: [{ pageX: 98, pageY: 140 }],
      })

      await waitFor(() => {
        expect(mockSwitchSpace).toHaveBeenCalledWith("spc_personal")
      })
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it("opens switch-space modal on vertical swipe when only one space exists", async () => {
      mockUseSpace.mockReturnValue({
        spaces: [{ id: "spc_personal", name: "Personal" }],
        activeSpace: { id: "spc_personal", name: "Personal" },
        activeSpaceId: "spc_personal",
        activeSpaceRole: "owner" as const,
        isLoading: false,
        isSwitching: false,
        isOwner: true,
        canManageMembers: true,
        timezone: "UTC",
        mailAutoLoadRemoteContent: false,
        calendarMobileView: "agenda" as const,
        updateMailPreferences: vi.fn(async () => undefined),
        updateCalendarPreferences: vi.fn(async () => undefined),
        switchSpace: mockSwitchSpace,
        refetchSpaces: vi.fn(),
      })

      const { getByTestId, getByText } = render(<SpaceAvatarButton />)
      expect(getByText("PE")).toBeTruthy()
      const btn = getByTestId("space-avatar-button")

      fireEvent.touchStart(btn, {
        changedTouches: [{ pageX: 50, pageY: 100 }],
      })
      fireEvent.touchEnd(btn, {
        changedTouches: [{ pageX: 50, pageY: 60 }],
      })

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith("/modal/switch-space")
      })
      expect(mockSwitchSpace).not.toHaveBeenCalled()
      expect(haptics.selection).toHaveBeenCalledTimes(1)
    })
  })
})
