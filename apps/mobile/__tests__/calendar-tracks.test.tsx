import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { TimezoneProvider } from "@saturn/hooks"
import { haptics } from "../lib/haptics"
import {
  buildDuplicateEventParams,
  groupEventsByDate,
} from "../components/calendar/calendar-utils"
import { SpaceProvider, useSpace } from "../lib/space-context"
import { AgendaList } from "../components/calendar/agenda-list"
import { TimelineGrid } from "../components/calendar/timeline-grid"
import { EventPreviewSheet } from "../components/calendar/event-preview-sheet"
import CalendarScreen, {
  resolveMobileCalendarViewMode,
} from "../app/(app)/(tabs)/calendar"

const {
  mockRouterPush,
  mockToastShow,
  mockAlert,
  mockMutateDelete,
  mockUpdateUserPreferencesMutateAsync,
  mockGetUserPreferences,
  mockSetUserPreferences,
  mockSectionListPropsRef,
  mockScrollToLocation,
  mockPreviewExpand,
  mockPreviewClose,
  mockDeleteScopeExpand,
  mockDeleteScopeClose,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockToastShow: vi.fn(),
  mockAlert: vi.fn(),
  mockMutateDelete: vi.fn(async () => ({})),
  mockUpdateUserPreferencesMutateAsync: vi.fn(async (vars: unknown) => {
    const v = vars as { userPreferences?: unknown }
    return v.userPreferences
  }),
  mockGetUserPreferences: vi.fn<() => Promise<unknown>>(async () => null),
  mockSetUserPreferences: vi.fn(async (_prefs: unknown) => undefined),
  mockSectionListPropsRef: {
    current: null as null | Record<string, unknown>,
  },
  mockScrollToLocation: vi.fn(),
  mockPreviewExpand: vi.fn(),
  mockPreviewClose: vi.fn(),
  mockDeleteScopeExpand: vi.fn(),
  mockDeleteScopeClose: vi.fn(),
}))

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> | undefined => {
    if (!s) return undefined
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s
          .flat(Infinity)
          .filter(Boolean)
          .map((item) => flattenStyle(item))
      )
    }
    return typeof s === "object" ? (s as Record<string, unknown>) : undefined
  }
  return {
    Appearance: { setColorScheme: vi.fn() },
    Alert: { alert: mockAlert },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      hairlineWidth: 0.5,
    },
    useColorScheme: () => "dark",
    ActivityIndicator: ({ testID }: { testID?: string }) =>
      ReactMod.createElement("div", { "data-testid": testID ?? "spinner" }),
    RefreshControl: () => null,
    View: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "div",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    Text: ({
      children,
      style,
      testID,
      numberOfLines: _nol,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "span",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    ScrollView: (() => {
      const MockScrollView = ReactMod.forwardRef(
        (
          {
            children,
            testID,
            style,
          }: {
            children?: React.ReactNode
            testID?: string
            style?: unknown
          },
          ref
        ) => {
          ReactMod.useImperativeHandle(ref, () => ({
            scrollTo: vi.fn(),
          }))
          return ReactMod.createElement(
            "div",
            { "data-testid": testID, style: flattenStyle(style) },
            children
          )
        }
      )
      MockScrollView.displayName = "MockScrollView"
      return MockScrollView
    })(),
    TouchableOpacity: ({
      children,
      onPress,
      onLongPress: _olp,
      disabled,
      testID,
      accessibilityLabel,
      accessibilityHint: _ah,
      accessibilityRole: _ar,
      accessibilityState: _as,
      activeOpacity: _ao,
      style,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode
      onPress?: () => void
      disabled?: boolean
      testID?: string
      accessibilityLabel?: string
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          onClick: disabled ? undefined : onPress,
          disabled,
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
          ...props,
        },
        children
      ),
    SectionList: (() => {
      const MockSectionList = ReactMod.forwardRef(
        (props: Record<string, unknown>, ref) => {
          mockSectionListPropsRef.current = props
          ReactMod.useImperativeHandle(ref, () => ({
            scrollToLocation: mockScrollToLocation,
            getScrollResponder: () => ({ scrollTo: vi.fn() }),
          }))
          const sections = (props.sections || []) as {
            title: string
            dateString: string
            isToday: boolean
            data: EventOccurrence[]
          }[]
          const renderSectionHeader = props.renderSectionHeader as (arg: {
            section: (typeof sections)[number]
          }) => React.ReactNode
          const renderItem = props.renderItem as (arg: {
            item: EventOccurrence
            index: number
            section: (typeof sections)[number]
          }) => React.ReactNode

          return ReactMod.createElement(
            "div",
            { "data-testid": "mock-section-list" },
            sections.map((section) =>
              ReactMod.createElement(
                "div",
                { key: section.dateString },
                renderSectionHeader({ section }),
                section.data.map((item, idx) =>
                  ReactMod.createElement(
                    ReactMod.Fragment,
                    { key: item.instanceId || item.eventId || idx },
                    renderItem({ item, index: idx, section })
                  )
                )
              )
            )
          )
        }
      )
      MockSectionList.displayName = "MockSectionList"
      return MockSectionList
    })(),
  }
})

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, back: vi.fn() }),
  useIsFocused: () => true,
}))

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}))

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const MockBottomSheet = ReactMod.forwardRef(
    ({ children }: { children?: React.ReactNode }, _ref) =>
      ReactMod.createElement("div", null, children)
  )
  MockBottomSheet.displayName = "MockBottomSheet"
  return {
    default: MockBottomSheet,
    BottomSheetBackdrop: () => null,
    TouchableOpacity: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode
      onPress?: () => void
    }) =>
      ReactMod.createElement(
        "button",
        { type: "button", onClick: onPress },
        children
      ),
  }
})

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const Stub = (name: string) => {
    const IconStub = (props: Record<string, unknown>) =>
      ReactMod.createElement("span", {
        "data-icon": name,
        "data-testid": props.testID,
      })
    IconStub.displayName = name
    return IconStub
  }
  return {
    Calendar: Stub("Calendar"),
    Users: Stub("Users"),
    Video: Stub("Video"),
    MapPin: Stub("MapPin"),
    Check: Stub("Check"),
    X: Stub("X"),
    HelpCircle: Stub("HelpCircle"),
    Clock: Stub("Clock"),
    Edit3: Stub("Edit3"),
    ExternalLink: Stub("ExternalLink"),
    Copy: Stub("Copy"),
    Trash2: Stub("Trash2"),
    SlidersHorizontal: Stub("SlidersHorizontal"),
    RotateCcw: Stub("RotateCcw"),
    ChevronDown: Stub("ChevronDown"),
    ChevronUp: Stub("ChevronUp"),
    ChevronLeft: Stub("ChevronLeft"),
    ChevronRight: Stub("ChevronRight"),
  }
})

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(() => vi.fn()),
  },
}))

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
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

vi.mock("@/lib/haptics", () => ({
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

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "usr_1", email: "me@example.com", name: "Me" },
    isAuthenticated: true,
    setActiveSpace: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "usr_1", email: "me@example.com", name: "Me" },
    isAuthenticated: true,
    setActiveSpace: vi.fn(async () => undefined),
  }),
}))

const mockThemeObj = {
  isDark: true,
  colors: {
    background: "#000",
    surface: "#111",
    surfaceSubtle: "#18181b",
    surfaceElevated: "#222",
    border: "#333",
    borderStrong: "#444",
    borderFocus: "#38bdf8",
    primary: "#38bdf8",
    primarySubtle: "#0c4a6e",
    primaryForeground: "#fff",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#888",
    destructive: "#ef4444",
    destructiveSubtle: "#7f1d1d",
    success: "#10b981",
    successSubtle: "#064e3b",
    warning: "#f59e0b",
    warningSubtle: "#78350f",
  },
  radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 18, full: 999 },
}

vi.mock("@/lib/theme", () => ({
  useTheme: () => mockThemeObj,
  useThemedStyles: (fn: (t: typeof mockThemeObj) => Record<string, unknown>) =>
    fn(mockThemeObj),
}))

vi.mock("../lib/theme", () => ({
  useTheme: () => mockThemeObj,
  useThemedStyles: (fn: (t: typeof mockThemeObj) => Record<string, unknown>) =>
    fn(mockThemeObj),
}))

vi.mock("@/lib/query-persister", () => ({
  clearPersistedQueryCache: vi.fn(async () => undefined),
}))

vi.mock("../lib/query-persister", () => ({
  clearPersistedQueryCache: vi.fn(async () => undefined),
}))

vi.mock("@/components/workflows/workflow-draft-store", () => ({
  setPendingWorkflowDraft: vi.fn(),
}))

vi.mock("../lib/storage", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/storage")>("../lib/storage")
  return {
    ...actual,
    mobileStorage: {
      ...actual.mobileStorage,
      getActiveSpaceId: vi.fn(async () => "spc_1"),
      setActiveSpaceId: vi.fn(async () => undefined),
    },
    getUserPreferences: () => mockGetUserPreferences(),
    setUserPreferences: (prefs: unknown) => mockSetUserPreferences(prefs),
  }
})

vi.mock("@saturn/api/saturn/space/v1/space", () => ({
  useListSpacesQuery: () => ({
    data: { spaces: [{ id: "spc_1", name: "Personal" }] },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useGetSettingsQuery: () => ({
    data: { timezone: "UTC" },
  }),
}))

vi.mock("@saturn/api/saturn/identity/v1/identity", () => ({
  useGetUserPreferencesQuery: () => ({
    data: undefined,
  }),
  useUpdateUserPreferencesMutation: () => ({
    mutateAsync: mockUpdateUserPreferencesMutateAsync,
  }),
}))

vi.mock("@saturn/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@saturn/hooks")>("@saturn/hooks")
  return {
    ...actual,
    useSpaceRole: () => ({ role: "owner" as const }),
    useCalendars: () => ({
      data: { calendars: [{ id: "cal_1", name: "Work", isEnabled: true }] },
    }),
    useCalendarEvents: () => ({
      data: {
        occurrences: [
          {
            eventId: "ev_single",
            calendarId: "cal_1",
            masterId: "",
            instanceId: "inst_single",
            title: "1:1 Sync",
            description: "Weekly check-in",
            location: "Room B",
            isAllDay: false,
            startTime: "2026-10-20T14:00:00Z",
            endTime: "2026-10-20T15:00:00Z",
            startDate: "",
            endDate: "",
            timezone: "UTC",
            status: "EVENT_STATUS_CONFIRMED",
            isException: false,
            meetUrl: "https://meet.example.com/123",
            color: "#38bdf8",
            calendarName: "Work",
            organizer: {
              email: "me@example.com",
              displayName: "Me",
              isSelf: true,
            },
            attendees: [],
            reminders: [],
            isVirtual: false,
            sourceType: "",
          },
          {
            eventId: "ev_series",
            calendarId: "cal_1",
            masterId: "ev_series_master",
            instanceId: "inst_series_1",
            title: "Team Standup",
            description: "",
            location: "",
            isAllDay: false,
            startTime: "2026-10-21T16:00:00Z",
            endTime: "2026-10-21T16:30:00Z",
            startDate: "",
            endDate: "",
            timezone: "UTC",
            status: "EVENT_STATUS_CONFIRMED",
            isException: false,
            meetUrl: "",
            color: "#6366f1",
            calendarName: "Work",
            organizer: {
              email: "me@example.com",
              displayName: "Me",
              isSelf: true,
            },
            attendees: [],
            reminders: [],
            isVirtual: false,
            sourceType: "",
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(async () => undefined),
    }),
    useEnsureDefaultCalendar: () => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
    }),
    useConnectedAccounts: () => ({
      data: { accounts: [] },
    }),
    useSyncConnectedAccount: () => ({
      mutateAsync: vi.fn(async () => ({})),
    }),
    useRespondToEvent: () => ({
      mutateAsync: vi.fn(async () => ({})),
    }),
    useDeleteEvent: () => ({
      mutateAsync: mockMutateDelete,
    }),
  }
})

vi.mock("../components/app-header", () => ({
  SpaceAvatarButton: () => null,
  AIHeaderButton: () => null,
}))

vi.mock("../components/ui/quick-capture-sheet", () => ({
  QuickCaptureFab: ({
    testID,
    onPress,
  }: {
    testID?: string
    onPress?: () => void
  }) =>
    React.createElement("button", {
      type: "button",
      "data-testid": testID,
      onClick: onPress,
    }),
}))

vi.mock("../components/calendar/calendar-filter-sheet", async () => {
  const ReactMod = await import("react")
  const MockRelCalendarFilterSheet = ReactMod.forwardRef(() => null)
  MockRelCalendarFilterSheet.displayName = "MockRelCalendarFilterSheet"
  return { CalendarFilterSheet: MockRelCalendarFilterSheet }
})

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show: mockToastShow, hide: vi.fn() }),
}))

vi.mock("@/components/app-header", () => ({
  SpaceAvatarButton: () => null,
  AIHeaderButton: () => null,
}))

vi.mock("@/components/ui/quick-capture-sheet", () => ({
  QuickCaptureFab: ({
    testID,
    onPress,
  }: {
    testID?: string
    onPress?: () => void
  }) =>
    React.createElement("button", {
      type: "button",
      "data-testid": testID,
      onClick: onPress,
    }),
}))

vi.mock("@/components/ui/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const MockAppBottomSheet = ReactMod.forwardRef(
    (
      { children, title }: { children?: React.ReactNode; title?: string },
      ref
    ) => {
      ReactMod.useImperativeHandle(ref, () => ({
        expand: title ? mockDeleteScopeExpand : mockPreviewExpand,
        close: title ? mockDeleteScopeClose : mockPreviewClose,
      }))
      return ReactMod.createElement("div", null, children)
    }
  )
  MockAppBottomSheet.displayName = "MockAppBottomSheet"
  return { AppBottomSheet: MockAppBottomSheet }
})

vi.mock("../components/ui/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const MockRelativeAppBottomSheet = ReactMod.forwardRef(
    (
      { children, title }: { children?: React.ReactNode; title?: string },
      ref
    ) => {
      ReactMod.useImperativeHandle(ref, () => ({
        expand: title ? mockDeleteScopeExpand : mockPreviewExpand,
        close: title ? mockDeleteScopeClose : mockPreviewClose,
      }))
      return ReactMod.createElement("div", null, children)
    }
  )
  MockRelativeAppBottomSheet.displayName = "MockRelativeAppBottomSheet"
  return { AppBottomSheet: MockRelativeAppBottomSheet }
})

vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ show: mockToastShow, hide: vi.fn() }),
}))

vi.mock("@/components/calendar/date-strip", async () => {
  const actual = await vi.importActual<
    typeof import("../components/calendar/date-strip")
  >("../components/calendar/date-strip")
  return actual
})

vi.mock("@/components/calendar/timeline-grid", async () => {
  const actual = await vi.importActual<
    typeof import("../components/calendar/timeline-grid")
  >("../components/calendar/timeline-grid")
  return actual
})

vi.mock("@/components/calendar/agenda-list", async () => {
  const actual = await vi.importActual<
    typeof import("../components/calendar/agenda-list")
  >("../components/calendar/agenda-list")
  return actual
})

vi.mock("@/components/calendar/calendar-filter-sheet", async () => {
  const ReactMod = await import("react")
  const MockCalendarFilterSheet = ReactMod.forwardRef(() => null)
  MockCalendarFilterSheet.displayName = "MockCalendarFilterSheet"
  return { CalendarFilterSheet: MockCalendarFilterSheet }
})

vi.mock("@/components/calendar/event-preview-sheet", async () => {
  const actual = await vi.importActual<
    typeof import("../components/calendar/event-preview-sheet")
  >("../components/calendar/event-preview-sheet")
  return actual
})

vi.mock("@/components/calendar/calendar-utils", async () => {
  const actual = await vi.importActual<
    typeof import("../components/calendar/calendar-utils")
  >("../components/calendar/calendar-utils")
  return actual
})

function makeOccurrence(
  overrides: Partial<EventOccurrence> = {}
): EventOccurrence {
  return {
    eventId: "ev_1",
    calendarId: "cal_1",
    masterId: "",
    instanceId: "inst_1",
    title: "Design Review",
    description: "Review mobile calendar fixes",
    location: "Studio A",
    isAllDay: false,
    startTime: "2026-10-20T14:00:00Z",
    endTime: "2026-10-20T15:30:00Z",
    startDate: "",
    endDate: "",
    timezone: "UTC",
    status: "EVENT_STATUS_CONFIRMED",
    isException: false,
    meetUrl: "https://meet.example.com/abc",
    color: "#38bdf8",
    calendarName: "Work",
    organizer: { email: "me@example.com", displayName: "Me", isSelf: true },
    attendees: [
      {
        email: "alex@example.com",
        displayName: "Alex",
        isOrganizer: false,
        isOptional: false,
        responseStatus: "ATTENDEE_RESPONSE_STATUS_ACCEPTED",
      },
    ],
    reminders: [],
    isVirtual: false,
    sourceType: "",
    ...overrides,
  }
}

describe("DF-06: SpaceProvider calendarMobileView & updateCalendarPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserPreferences.mockResolvedValue(null)
  })

  it("restores stored calendar.mobileView and persists updates optimistically", async () => {
    mockGetUserPreferences.mockResolvedValue({
      regional: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
      mail: { autoLoadRemoteContent: false },
      calendar: { webView: "month", mobileView: "three_day" },
    })

    function Probe() {
      const { calendarMobileView, updateCalendarPreferences } = useSpace()
      return (
        <div>
          <span data-testid="probe-view">{calendarMobileView}</span>
          <button
            type="button"
            data-testid="probe-set-month"
            onClick={() =>
              void updateCalendarPreferences({ mobileView: "month" })
            }
          />
        </div>
      )
    }

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const screen = render(
      <QueryClientProvider client={qc}>
        <SpaceProvider>
          <Probe />
        </SpaceProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("probe-view").textContent).toBe("three_day")
    })

    fireEvent.click(screen.getByTestId("probe-set-month"))

    await waitFor(() => {
      expect(screen.getByTestId("probe-view").textContent).toBe("month")
    })

    expect(mockSetUserPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        calendar: expect.objectContaining({ mobileView: "month" }),
      })
    )
    expect(mockUpdateUserPreferencesMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        updateMask: { paths: ["calendar.mobile_view"] },
      })
    )
  })

  it("maps week preference to three_day and unknown values to agenda", () => {
    expect(resolveMobileCalendarViewMode("agenda")).toBe("agenda")
    expect(resolveMobileCalendarViewMode("day")).toBe("day")
    expect(resolveMobileCalendarViewMode("three_day")).toBe("three_day")
    expect(resolveMobileCalendarViewMode("month")).toBe("month")
    expect(resolveMobileCalendarViewMode("week")).toBe("three_day")
    expect(resolveMobileCalendarViewMode("invalid")).toBe("agenda")
    expect(resolveMobileCalendarViewMode(undefined)).toBe("agenda")
  })
})

describe("DF-04: TimelineGrid Column Hairline Alignment", () => {
  it("applies consistent hairlineWidth borders across header, all-day row, and day columns", () => {
    const allDayOcc = makeOccurrence({
      eventId: "ev_allday",
      instanceId: "inst_allday",
      title: "Offsite",
      isAllDay: true,
      startTime: "",
      endTime: "",
      startDate: "2026-10-20",
      endDate: "2026-10-21",
    })
    const timedOcc = makeOccurrence()

    const { container } = render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <TimelineGrid
          days={["2026-10-20", "2026-10-21", "2026-10-22"]}
          timeZone="UTC"
          occurrences={[allDayOcc, timedOcc]}
          onSelectOccurrence={vi.fn()}
        />
      </TimezoneProvider>
    )

    const divs = Array.from(container.querySelectorAll("div"))
    const leftBorderDivs = divs.filter(
      (el) => el.style.borderLeftWidth === "0.5px"
    )
    // Header has 2 bordered columns (cols 1 & 2), All-day has 2, Grid has 2 => 6
    expect(leftBorderDivs).toHaveLength(6)

    const rightBorderTimeCols = divs.filter(
      (el) => el.style.width === "54px" && el.style.borderRightWidth === "0.5px"
    )
    // timeColHeader, allDayLabelCol, timeLabelsColumn => 3
    expect(rightBorderTimeCols).toHaveLength(3)
  })
})

describe("DF-05: AgendaList Dynamic Header Month Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSectionListPropsRef.current = null
  })

  it("emits onVisibleDateChange only when the visible YYYY-MM prefix changes", () => {
    const onVisibleDateChange = vi.fn()
    const events = [
      makeOccurrence({
        eventId: "ev_oct_1",
        instanceId: "inst_oct_1",
        startTime: "2026-10-20T14:00:00Z",
        endTime: "2026-10-20T15:00:00Z",
      }),
      makeOccurrence({
        eventId: "ev_oct_2",
        instanceId: "inst_oct_2",
        startTime: "2026-10-28T14:00:00Z",
        endTime: "2026-10-28T15:00:00Z",
      }),
      makeOccurrence({
        eventId: "ev_nov_1",
        instanceId: "inst_nov_1",
        startTime: "2026-11-02T14:00:00Z",
        endTime: "2026-11-02T15:00:00Z",
      }),
    ]

    render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <AgendaList
          occurrences={events}
          timeZone="UTC"
          focusDate="2026-10-20"
          onSelectOccurrence={vi.fn()}
          onVisibleDateChange={onVisibleDateChange}
        />
      </TimezoneProvider>
    )

    const props = mockSectionListPropsRef.current
    expect(props).toBeTruthy()
    expect(props?.viewabilityConfig).toEqual({
      itemVisiblePercentThreshold: 20,
    })

    const onViewableItemsChanged = props?.onViewableItemsChanged as (info: {
      viewableItems: {
        isViewable?: boolean
        section?: { dateString: string }
      }[]
    }) => void

    onViewableItemsChanged({
      viewableItems: [
        { isViewable: true, section: { dateString: "2026-10-20" } },
      ],
    })
    expect(onVisibleDateChange).toHaveBeenCalledTimes(1)
    expect(onVisibleDateChange).toHaveBeenLastCalledWith("2026-10-20")

    // Scrolling within the same month does not spam callbacks
    onViewableItemsChanged({
      viewableItems: [
        { isViewable: true, section: { dateString: "2026-10-28" } },
      ],
    })
    expect(onVisibleDateChange).toHaveBeenCalledTimes(1)

    // Crossing into November updates the header month
    onViewableItemsChanged({
      viewableItems: [
        { isViewable: true, section: { dateString: "2026-11-02" } },
      ],
    })
    expect(onVisibleDateChange).toHaveBeenCalledTimes(2)
    expect(onVisibleDateChange).toHaveBeenLastCalledWith("2026-11-02")
  })
})

describe("DF-14: EventPreviewSheet Duplicate & Delete + CalendarScreen Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserPreferences.mockResolvedValue(null)
  })

  it("renders Duplicate, Delete, Close, and Edit buttons when canEdit is true", () => {
    const occ = makeOccurrence()
    const onEdit = vi.fn()
    const onDuplicate = vi.fn()
    const onDelete = vi.fn()
    const onClose = vi.fn()

    const screen = render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <EventPreviewSheet
          occurrence={occ}
          timeZone="UTC"
          canEdit={true}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onClose={onClose}
        />
      </TimezoneProvider>
    )

    fireEvent.click(screen.getByTestId("event-duplicate-button"))
    expect(onDuplicate).toHaveBeenCalledWith(occ)

    fireEvent.click(screen.getByTestId("event-delete-button"))
    expect(onDelete).toHaveBeenCalledWith(occ)

    fireEvent.click(screen.getByTestId("event-edit-button"))
    expect(onEdit).toHaveBeenCalledWith(occ)

    fireEvent.click(screen.getByTestId("event-close-button"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(haptics.light).toHaveBeenCalled()
  })

  it("hides Duplicate, Delete, and Edit buttons when canEdit is false", () => {
    const occ = makeOccurrence()
    const screen = render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <EventPreviewSheet
          occurrence={occ}
          timeZone="UTC"
          canEdit={false}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </TimezoneProvider>
    )

    expect(screen.queryByTestId("event-duplicate-button")).toBeNull()
    expect(screen.queryByTestId("event-delete-button")).toBeNull()
    expect(screen.queryByTestId("event-edit-button")).toBeNull()
    expect(screen.getByTestId("event-close-button")).toBeTruthy()
  })

  it("builds duplicate route params cleanly for timed and multi-day all-day events", () => {
    const timedParams = buildDuplicateEventParams(
      makeOccurrence({
        calendarId: "cal_work",
        title: "Architecture Sync",
        description: "Deep dive",
        location: "HQ 4B",
        timezone: "America/New_York",
        startTime: "2026-10-20T14:30:00Z",
        endTime: "2026-10-20T15:45:00Z",
        meetUrl: "https://meet.example.com/arch",
      }),
      "UTC"
    )

    expect(timedParams).toMatchObject({
      calendarId: "cal_work",
      initialTitle: "Architecture Sync",
      initialDescription: "Deep dive",
      initialLocation: "HQ 4B",
      initialIsAllDay: "false",
      initialDate: "2026-10-20",
      initialEndDate: "2026-10-20",
      initialStartTime: "10:30",
      initialEndTime: "11:45",
      initialTimezone: "America/New_York",
      initialMeetUrl: "https://meet.example.com/arch",
    })
    expect(timedParams.initialAttendees).toContain("alex@example.com")

    const allDayParams = buildDuplicateEventParams(
      makeOccurrence({
        isAllDay: true,
        startTime: "",
        endTime: "",
        startDate: "2026-10-20",
        endDate: "2026-10-23",
      }),
      "UTC"
    )
    expect(allDayParams.initialIsAllDay).toBe("true")
    expect(allDayParams.initialDate).toBe("2026-10-20")
    expect(allDayParams.initialEndDate).toBe("2026-10-22")
  })

  it("persists mode switches, renders Month view, and wires Duplicate + Delete on CalendarScreen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"))
    try {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const screen = render(
        <QueryClientProvider client={qc}>
          <SpaceProvider>
            <CalendarScreen />
          </SpaceProvider>
        </QueryClientProvider>
      )

      // Switch to Month view -> persists mobileView: "month" and renders expanded grid + month list
      fireEvent.click(screen.getByTestId("calendar-mode-month"))
      await waitFor(() => {
        expect(mockSetUserPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            calendar: expect.objectContaining({ mobileView: "month" }),
          })
        )
      })
      expect(mockUpdateUserPreferencesMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          updateMask: { paths: ["calendar.mobile_view"] },
        })
      )
      expect(screen.getByTestId("calendar-month-view")).toBeTruthy()
      expect(screen.getByTestId("calendar-mode-agenda")).toBeTruthy()
      expect(screen.getByTestId("calendar-mode-day")).toBeTruthy()
      expect(screen.getByTestId("calendar-mode-3day")).toBeTruthy()

      // Switch back to Agenda to select single and recurring occurrences
      fireEvent.click(screen.getByTestId("calendar-mode-agenda"))
      await waitFor(() => {
        expect(mockSetUserPreferences).toHaveBeenLastCalledWith(
          expect.objectContaining({
            calendar: expect.objectContaining({ mobileView: "agenda" }),
          })
        )
      })

      // Select single occurrence -> Duplicate opens manage-event draft
      fireEvent.click(screen.getByTestId("agenda-item-inst_single"))
      fireEvent.click(screen.getByTestId("event-duplicate-button"))
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: "/modal/manage-event",
        params: expect.objectContaining({
          calendarId: "cal_1",
          initialTitle: "1:1 Sync",
          initialLocation: "Room B",
          initialIsAllDay: "false",
          initialMeetUrl: "https://meet.example.com/123",
        }),
      })

      // Non-recurring delete triggers Alert.alert confirmation
      fireEvent.click(screen.getByTestId("agenda-item-inst_single"))
      fireEvent.click(screen.getByTestId("event-delete-button"))
      expect(mockAlert).toHaveBeenCalledTimes(1)
      const alertButtons = mockAlert.mock.calls[0][2] as {
        onPress?: () => void
      }[]
      alertButtons[1]?.onPress?.()
      await waitFor(() => {
        expect(mockMutateDelete).toHaveBeenCalledWith({
          id: "ev_single",
          req: {
            id: "ev_single",
            recurrenceScope: "RECURRENCE_SCOPE_UNSPECIFIED",
            targetStartTime: "2026-10-20T14:00:00Z",
            targetStartDate: "",
          },
        })
      })

      // Recurring delete opens scope picker and deletes with chosen scope
      fireEvent.click(screen.getByTestId("agenda-item-inst_series_1"))
      fireEvent.click(screen.getByTestId("event-delete-button"))
      expect(mockDeleteScopeExpand).toHaveBeenCalled()
      fireEvent.click(screen.getByTestId("calendar-delete-scope-this"))
      await waitFor(() => {
        expect(mockMutateDelete).toHaveBeenCalledWith({
          id: "ev_series",
          req: {
            id: "ev_series",
            recurrenceScope: "RECURRENCE_SCOPE_THIS_EVENT",
            targetStartTime: "2026-10-21T16:00:00Z",
            targetStartDate: "",
          },
        })
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("groupEventsByDate safely handles ISO-suffixed startDate, invalid timestamps, and non-current years without throwing Invalid time value", () => {
    const sections = groupEventsByDate(
      [
        makeOccurrence({
          eventId: "ev_iso_allday",
          instanceId: "inst_iso_allday",
          title: "All-Day With ISO Suffix",
          isAllDay: true,
          startDate: "2026-10-15T00:00:00Z",
          endDate: "2026-10-16T00:00:00Z",
          startTime: "",
          endTime: "",
          timezone: "America/Santo_Domingo",
        }),
        makeOccurrence({
          eventId: "ev_bad_time",
          instanceId: "inst_bad_time",
          title: "Malformed Time Event",
          isAllDay: false,
          startDate: "",
          endDate: "",
          startTime: "not-a-valid-date",
          endTime: "",
          timezone: "Invalid/Zone",
        }),
        makeOccurrence({
          eventId: "ev_other_year",
          instanceId: "inst_other_year",
          title: "Next Year Event",
          isAllDay: true,
          startDate: "2028-01-05",
          endDate: "2028-01-06",
          startTime: "",
          endTime: "",
          timezone: "Invalid/Zone",
        }),
      ],
      "Invalid/Zone",
      "es-DO"
    )

    expect(sections).toHaveLength(2)
    expect(sections[0]?.dateString).toBe("2026-10-15")
    expect(sections[0]?.title.length).toBeGreaterThan(0)
    expect(sections[1]?.dateString).toBe("2028-01-05")
    expect(sections[1]?.title).toContain("2028")
  })
})
