import React from "react"
import { Platform } from "react-native"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Budget } from "@saturn/api/saturn/finance/v1/finance"
import { TimezoneProvider } from "@saturn/hooks"
import BudgetsScreen, {
  computeBudgetPacePercent,
} from "../app/(app)/finance/budgets"
import ManageBudgetModal from "../app/modal/manage-budget"

const {
  mockRouterPush,
  mockRouterBack,
  mockRouterReplace,
  mockToastShow,
  mockCreateBudgetMutateAsync,
  mockUpdateBudgetMutateAsync,
  mockDeleteBudgetMutateAsync,
  mockRefetchBudgets,
  mockBudgetsListRef,
  mockAccountsListRef,
  mockExchangeRatesRef,
  mockStackOptionsRef,
  mockThemeObj,
} = vi.hoisted(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("node:module")
    if (Module._extensions && !Module._extensions[".xml"]) {
      Module._extensions[".xml"] = (mod: { exports: unknown }) => {
        mod.exports = "mock-xml-asset"
      }
    }
  } catch {
    // Ignore if unavailable
  }
  return {
    mockRouterPush: vi.fn(),
    mockRouterBack: vi.fn(),
    mockRouterReplace: vi.fn(),
    mockToastShow: vi.fn(),
    mockCreateBudgetMutateAsync: vi.fn(async () => ({ id: "bud_created" })),
    mockUpdateBudgetMutateAsync: vi.fn(async () => ({ id: "bud_updated" })),
    mockDeleteBudgetMutateAsync: vi.fn(async () => ({})),
    mockRefetchBudgets: vi.fn(),
    mockBudgetsListRef: { current: [] as Budget[] },
    mockAccountsListRef: {
      current: [
        {
          id: "acc_checking",
          name: "Main Checking",
          currency: "USD",
          type: "CHECKING",
          isActive: true,
        },
      ],
    },
    mockExchangeRatesRef: {
      current: [
        {
          id: "rate_eur_usd",
          fromCurrency: "EUR",
          toCurrency: "USD",
          rate: 1.1,
          rateDate: "2026-10-01",
        },
      ],
    },
    mockStackOptionsRef: { current: null as Record<string, unknown> | null },
    mockThemeObj: {
      mode: "light" as const,
      resolvedMode: "light" as const,
      setMode: vi.fn(),
      isDark: false,
      colors: {
        background: "#f6f9fb",
        surface: "#ffffff",
        surfaceElevated: "#f1f6f9",
        surfaceSubtle: "#edf3f7",
        surfaceHighlight: "#e5eef4",
        border: "rgba(15, 23, 42, 0.10)",
        borderStrong: "#cbd5e1",
        borderFocus: "#0c7e95",
        textPrimary: "#0f172a",
        textSecondary: "#334155",
        textMuted: "#64748b",
        primary: "#0c7e95",
        primaryForeground: "#f8feff",
        primaryDark: "#096275",
        primarySubtle: "rgba(12, 126, 149, 0.10)",
        brandSecondary: "#5449e6",
        brandSecondarySubtle: "rgba(84, 73, 230, 0.10)",
        accent: "#5449e6",
        destructive: "#dc2626",
        destructiveSubtle: "rgba(220, 38, 38, 0.10)",
        destructiveBorder: "rgba(220, 38, 38, 0.28)",
        success: "#059669",
        successSubtle: "rgba(5, 150, 105, 0.10)",
        successBorder: "rgba(5, 150, 105, 0.28)",
        warning: "#d97706",
        warningSubtle: "rgba(217, 119, 6, 0.11)",
        warningBorder: "rgba(217, 119, 6, 0.28)",
        info: "#0284c7",
        infoSubtle: "rgba(2, 132, 199, 0.10)",
        infoBorder: "rgba(2, 132, 199, 0.28)",
        tabBar: "#ffffff",
        tabBarBorder: "#e2e8f0",
        tabBarActive: "#0c7e95",
        tabBarInactive: "#64748b",
      },
      radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 999 },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      shadows: { sm: {}, md: {}, lg: {} },
      budgetColors: {},
      typography: { mono: "monospace" },
      getBudgetColors: () => ({
        bg: "rgba(99, 102, 241, 0.10)",
        border: "rgba(99, 102, 241, 0.28)",
        text: "#4338ca",
        bar: "#6366f1",
      }),
    },
  }
})

vi.mock("@expo/material-symbols/info.xml", () => ({ default: "info.xml" }))
vi.mock("@expo/material-symbols/add_circle.xml", () => ({
  default: "add_circle.xml",
}))
vi.mock("@expo/material-symbols/pause_circle.xml", () => ({
  default: "pause_circle.xml",
}))
vi.mock("@expo/material-symbols/play_circle.xml", () => ({
  default: "play_circle.xml",
}))
vi.mock("@expo/material-symbols/lock.xml", () => ({ default: "lock.xml" }))
vi.mock("@expo/material-symbols/lock_open.xml", () => ({
  default: "lock_open.xml",
}))
vi.mock("@expo/material-symbols/edit.xml", () => ({ default: "edit.xml" }))
vi.mock("@expo/material-symbols/delete.xml", () => ({ default: "delete.xml" }))

vi.mock("@expo/ui", () => ({
  Icon: {
    select: (opts: Record<string, unknown>) => opts.ios ?? "icon",
  },
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
  const MockTextInput = ReactMod.forwardRef(
    (
      {
        value,
        onChangeText,
        placeholder,
        testID,
        accessibilityLabel,
        style,
        onFocus,
        onBlur,
      }: Record<string, unknown>,
      _ref
    ) =>
      ReactMod.createElement("input", {
        type: "text",
        value: typeof value === "string" ? value : "",
        placeholder: typeof placeholder === "string" ? placeholder : undefined,
        "data-testid": testID,
        "aria-label": accessibilityLabel ?? placeholder,
        style: flattenStyle(style),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          typeof onChangeText === "function" && onChangeText(e.target.value),
        onFocus,
        onBlur,
      })
  )
  MockTextInput.displayName = "MockTextInput"

  return {
    Appearance: { setColorScheme: vi.fn() },
    Alert: { alert: vi.fn() },
    Keyboard: {
      dismiss: vi.fn(),
      addListener: () => ({ remove: vi.fn() }),
    },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      hairlineWidth: 0.5,
      absoluteFill: {},
    },
    useColorScheme: () => "light",
    ActivityIndicator: ({ testID }: { testID?: string }) =>
      ReactMod.createElement("div", { "data-testid": testID ?? "spinner" }),
    RefreshControl: () => null,
    KeyboardAvoidingView: ({
      children,
      style,
    }: {
      children?: React.ReactNode
      style?: unknown
    }) =>
      ReactMod.createElement("div", { style: flattenStyle(style) }, children),
    View: ({
      children,
      style,
      testID,
      accessibilityLabel,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "div",
        {
          ...props,
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
        },
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
    ScrollView: ReactMod.forwardRef(
      (
        {
          children,
          testID,
          style,
          contentContainerStyle: _ccs,
        }: {
          children?: React.ReactNode
          testID?: string
          style?: unknown
          contentContainerStyle?: unknown
        },
        _ref
      ) =>
        ReactMod.createElement(
          "div",
          { "data-testid": testID, style: flattenStyle(style) },
          children
        )
    ),
    TouchableOpacity: ({
      children,
      onPress,
      disabled,
      testID,
      accessibilityLabel,
      accessibilityRole,
      style,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      disabled?: boolean
      testID?: string
      accessibilityLabel?: string
      accessibilityRole?: string
      style?: unknown
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          role: accessibilityRole,
          onClick: disabled ? undefined : onPress,
          disabled,
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
        },
        children
      ),
    TextInput: MockTextInput,
  }
})

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: mockRouterBack,
    replace: mockRouterReplace,
    canDismiss: () => false,
    dismiss: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      mockStackOptionsRef.current = options ?? null
      return null
    },
  },
}))

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const MockBottomSheet = ReactMod.forwardRef(
    ({ children }: { children?: React.ReactNode }, ref) => {
      ReactMod.useImperativeHandle(ref, () => ({
        expand: vi.fn(),
        close: vi.fn(),
      }))
      return ReactMod.createElement("div", null, children)
    }
  )
  MockBottomSheet.displayName = "MockBottomSheet"
  return {
    default: MockBottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode
      testID?: string
    }) => ReactMod.createElement("div", { "data-testid": testID }, children),
    BottomSheetFlatList: () => null,
    BottomSheetTextInput: () => null,
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
    PiggyBank: Stub("PiggyBank"),
    Plus: Stub("Plus"),
    Search: Stub("Search"),
    X: Stub("X"),
    AlertTriangle: Stub("AlertTriangle"),
    MoreVertical: Stub("MoreVertical"),
    Trash2: Stub("Trash2"),
    Pencil: Stub("Pencil"),
    ChevronDown: Stub("ChevronDown"),
    ChevronRight: Stub("ChevronRight"),
    AlertCircle: Stub("AlertCircle"),
    Check: Stub("Check"),
    Calendar: Stub("Calendar"),
    CalendarClock: Stub("CalendarClock"),
    Landmark: Stub("Landmark"),
    CreditCard: Stub("CreditCard"),
    Coins: Stub("Coins"),
    Wallet: Stub("Wallet"),
    Utensils: Stub("Utensils"),
    ShoppingBag: Stub("ShoppingBag"),
    Car: Stub("Car"),
    Zap: Stub("Zap"),
    Clapperboard: Stub("Clapperboard"),
    Heart: Stub("Heart"),
    GraduationCap: Stub("GraduationCap"),
    Tv: Stub("Tv"),
    Briefcase: Stub("Briefcase"),
    Sparkles: Stub("Sparkles"),
    ShoppingCart: Stub("ShoppingCart"),
    Home: Stub("Home"),
    Plane: Stub("Plane"),
    Gift: Stub("Gift"),
    Umbrella: Stub("Umbrella"),
    Music: Stub("Music"),
    Gamepad2: Stub("Gamepad2"),
    Bike: Stub("Bike"),
    Smartphone: Stub("Smartphone"),
    Monitor: Stub("Monitor"),
    Scale: Stub("Scale"),
    Building2: Stub("Building2"),
    Flame: Stub("Flame"),
    Store: Stub("Store"),
  }
})

vi.mock("../lib/theme", () => ({
  theme: mockThemeObj,
  useTheme: () => mockThemeObj,
  useThemedStyles: (fn: (t: typeof mockThemeObj) => Record<string, unknown>) =>
    fn(mockThemeObj),
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

vi.mock("../lib/space-context", () => ({
  useSpace: () => ({
    activeSpaceId: "spc_1",
    activeSpaceRole: "owner",
    timezone: "UTC",
  }),
}))

vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ show: mockToastShow, hide: vi.fn() }),
}))

vi.mock("../lib/budget-icons", async () => {
  return await vi.importActual<typeof import("../lib/budget-icons")>(
    "../lib/budget-icons"
  )
})

vi.mock("../components/ui/card", () => ({
  Card: ({
    children,
    testID,
    style,
  }: {
    children?: React.ReactNode
    testID?: string
    style?: unknown
  }) =>
    React.createElement(
      "div",
      { "data-testid": testID ?? "card", style },
      children
    ),
}))

vi.mock("../components/ui/typography", () => ({
  MonoAmount: ({
    children,
    testID,
  }: {
    children?: React.ReactNode
    testID?: string
  }) => React.createElement("span", { "data-testid": testID }, children),
  Caption: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
}))

vi.mock("../components/ui/skeleton-loader", () => ({
  SkeletonCard: () => React.createElement("div", { "data-testid": "skeleton" }),
}))

vi.mock("../components/ui/empty-state", () => ({
  EmptyState: ({
    title,
    description,
    actionLabel,
    onAction,
  }: {
    title: string
    description?: string
    actionLabel?: string
    onAction?: () => void
  }) =>
    React.createElement(
      "div",
      { "data-testid": "empty-state" },
      React.createElement("span", null, title),
      description ? React.createElement("span", null, description) : null,
      actionLabel && onAction
        ? React.createElement(
            "button",
            { type: "button", onClick: onAction },
            actionLabel
          )
        : null
    ),
}))

vi.mock("../components/ui/quick-capture-sheet", () => ({
  QuickCaptureFab: ({
    onPress,
    testID,
    accessibilityLabel,
  }: {
    onPress: () => void
    testID?: string
    accessibilityLabel?: string
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": testID ?? "quick-capture-fab",
        "aria-label": accessibilityLabel,
        onClick: onPress,
      },
      "+"
    ),
}))

vi.mock("../components/ui/action-menu", () => ({
  ActionMenu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "action-menu" }, children),
}))

vi.mock("../components/ui/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const AppBottomSheet = ReactMod.forwardRef(
    (
      {
        title,
        children,
      }: {
        title?: string
        children?: React.ReactNode
      },
      ref
    ) => {
      ReactMod.useImperativeHandle(ref, () => ({
        expand: vi.fn(),
        close: vi.fn(),
      }))
      return ReactMod.createElement(
        "div",
        { "data-testid": "app-bottom-sheet", "data-title": title },
        children
      )
    }
  )
  AppBottomSheet.displayName = "AppBottomSheet"
  return {
    AppBottomSheet,
    BottomSheetHeader: ({ title }: { title?: string }) =>
      ReactMod.createElement("span", null, title),
  }
})

vi.mock("../components/ui/text-input", async () => {
  const { Controller } = await import("react-hook-form")
  return {
    TextInput: ({
      control,
      name,
      label,
      placeholder,
    }: {
      control: never
      name: never
      label?: string
      placeholder?: string
    }) =>
      React.createElement(Controller, {
        control,
        name,
        render: ({ field, fieldState }) =>
          React.createElement(
            "div",
            null,
            label ? React.createElement("label", null, label) : null,
            React.createElement("input", {
              type: "text",
              placeholder,
              value: field.value ? String(field.value) : "",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                field.onChange(e.target.value),
            }),
            fieldState.error?.message
              ? React.createElement("span", null, fieldState.error.message)
              : null
          ),
      }),
  }
})

vi.mock("../components/ui/amount-input", async () => {
  const { Controller } = await import("react-hook-form")
  return {
    HeroAmountInput: ({
      control,
      name,
      label,
      placeholder = "0.00",
    }: {
      control: never
      name: never
      label?: string
      placeholder?: string
    }) =>
      React.createElement(Controller, {
        control,
        name,
        render: ({ field, fieldState }) =>
          React.createElement(
            "div",
            null,
            label ? React.createElement("span", null, label) : null,
            React.createElement("input", {
              type: "text",
              placeholder,
              value: field.value ? String(field.value) : "",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                field.onChange(e.target.value),
            }),
            fieldState.error?.message
              ? React.createElement("span", null, fieldState.error.message)
              : null
          ),
      }),
  }
})

vi.mock("../components/ui/form-primitives", async () => {
  const { Controller } = await import("react-hook-form")
  return {
    FormPillGroup: ({
      control,
      name,
      options,
    }: {
      control: never
      name: never
      options: { label: string; value: string }[]
    }) =>
      React.createElement(Controller, {
        control,
        name,
        render: ({ field }) =>
          React.createElement(
            "div",
            null,
            options.map((opt) =>
              React.createElement(
                "button",
                {
                  key: opt.value,
                  type: "button",
                  onClick: () => field.onChange(opt.value),
                },
                opt.label
              )
            )
          ),
      }),
    FormColorPicker: ({ control, name }: { control: never; name: never }) =>
      React.createElement(Controller, {
        control,
        name,
        render: ({ field }) =>
          React.createElement(
            "div",
            { "data-testid": "color-picker" },
            ["indigo", "emerald", "sky"].map((c) =>
              React.createElement(
                "button",
                {
                  key: c,
                  type: "button",
                  "data-testid": `color-option-${c}`,
                  onClick: () => field.onChange(c),
                },
                c
              )
            )
          ),
      }),
  }
})

vi.mock("../components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    testID,
    disabled,
  }: {
    children?: React.ReactNode
    onPress?: () => void
    testID?: string
    disabled?: boolean
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": testID,
        disabled,
        onClick: onPress,
      },
      children
    ),
}))

vi.mock("../components/finance/sheets", () => ({
  CurrencyPickerSheet: () => null,
  AccountPickerSheet: () => null,
}))

vi.mock("../components/finance/account-select", () => ({
  AccountCardSelect: ({
    placeholder,
    onPress,
  }: {
    placeholder?: string
    onPress?: () => void
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": "account-select", onClick: onPress },
      placeholder || "Account"
    ),
}))

vi.mock("@saturn/api/saturn/finance/v1/finance", () => ({
  useListBudgetsQuery: () => ({
    data: { budgets: mockBudgetsListRef.current },
    isLoading: false,
    refetch: mockRefetchBudgets,
  }),
  useGetSettingsQuery: () => ({
    data: { baseCurrency: "USD" },
  }),
  useListAccountsQuery: () => ({
    data: { accounts: mockAccountsListRef.current },
  }),
  useListCurrenciesQuery: () => ({
    data: {
      currencies: [
        { code: "USD", name: "US Dollar" },
        { code: "EUR", name: "Euro" },
      ],
    },
  }),
  useListInstitutionsQuery: () => ({
    data: { institutions: [] },
  }),
  useListExchangeRatesQuery: () => ({
    data: { exchangeRates: mockExchangeRatesRef.current },
    isLoading: false,
  }),
  useGetBudgetQuery: () => ({
    data: undefined,
    isLoading: false,
  }),
  useCreateBudgetMutation: () => ({
    mutateAsync: mockCreateBudgetMutateAsync,
    isPending: false,
  }),
  useUpdateBudgetMutation: () => ({
    mutateAsync: mockUpdateBudgetMutateAsync,
    isPending: false,
  }),
  useDeleteBudgetMutation: () => ({
    mutateAsync: mockDeleteBudgetMutateAsync,
    isPending: false,
  }),
}))

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TimezoneProvider timezone="UTC" locale="en-US">
        {ui}
      </TimezoneProvider>
    </QueryClientProvider>
  )
}

describe("Track E Part 2: Mobile Budgets Redesign & Fluent Form", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"))
    mockStackOptionsRef.current = null
    mockBudgetsListRef.current = [
      {
        id: "bud_groceries",
        name: "Groceries",
        limitAmount: "100000", // $1,000.00
        currency: "USD",
        interval: "MONTHLY",
        status: "ACTIVE",
        icon: "shopping-cart",
        color: "emerald",
        currentPeriod: {
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          spentAmount: "30000", // $300.00
        },
      },
      {
        id: "bud_euro_travel",
        name: "Euro Trip",
        limitAmount: "20000", // €200.00 -> $220.00 USD via 1.1 rate
        currency: "EUR",
        interval: "MONTHLY",
        status: "ACTIVE",
        icon: "plane",
        color: "sky",
        currentPeriod: {
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          spentAmount: "5000", // €50.00 -> $55.00 USD
        },
      },
      {
        id: "bud_paused",
        name: "Dining Out",
        limitAmount: "50000",
        currency: "USD",
        interval: "MONTHLY",
        status: "PAUSED",
        icon: "utensils",
        color: "amber",
        currentPeriod: {
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          spentAmount: "10000",
        },
      },
    ]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("computeBudgetPacePercent", () => {
    it("computes clamped elapsed percentage for active recurring periods and null for ONE_TIME/CLOSED", () => {
      const midMonth = new Date("2026-10-16T00:00:00Z")
      expect(
        computeBudgetPacePercent(
          {
            name: "Groceries",
            limitAmount: "10000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "shopping-cart",
            color: "emerald",
            currentPeriod: {
              startDate: "2026-10-01",
              endDate: "2026-10-31",
            },
          },
          midMonth
        )
      ).toBe(50)

      expect(
        computeBudgetPacePercent(
          {
            name: "Lifetime",
            limitAmount: "10000",
            currency: "USD",
            interval: "ONE_TIME",
            status: "ACTIVE",
            icon: "piggy-bank",
            color: "indigo",
            currentPeriod: {
              startDate: "2026-10-01",
              endDate: "2026-10-31",
            },
          },
          midMonth
        )
      ).toBeNull()

      expect(
        computeBudgetPacePercent(
          {
            name: "Archived",
            limitAmount: "10000",
            currency: "USD",
            interval: "MONTHLY",
            status: "CLOSED",
            icon: "piggy-bank",
            color: "indigo",
            currentPeriod: {
              startDate: "2026-10-01",
              endDate: "2026-10-31",
            },
          },
          midMonth
        )
      ).toBeNull()
    })
  })

  describe("BudgetsScreen (DF-18, DF-19, DF-20)", () => {
    it("renders compact date range without current year (DF-19), omits % badge pills (DF-18), and shows Today pace ticks & Left to spend hero summary (DF-20)", () => {
      const { getAllByText, getByText, getByTestId, queryByText } =
        renderWithProviders(<BudgetsScreen />)

      // DF-19: tz.formatDateRange produces "Oct 1 - Oct 31" without redundant "2026"
      expect(getAllByText("Oct 1 - Oct 31 · Monthly")).toHaveLength(2)
      expect(queryByText(/2026/)).toBeNull()

      // DF-18: No redundant % pill badges anywhere (30%, 25%, 29% etc.)
      expect(queryByText(/^\d+%$/)).toBeNull()

      // DF-20: Hero summary converts EUR->USD via exchangeRates (1000+220=1220 limit, 300+55=355 spent -> 865.00 USD left)
      expect(getByText("Left to spend")).toBeTruthy()
      expect(getByTestId("budgets-hero-amount").textContent).toBe("$865.00")
      expect(getByText("$355.00 of $1,220.00")).toBeTruthy()
      expect(queryByText(/Base:\s*USD/i)).toBeNull()

      // Today elapsed-period pace ticks on both summary bar and active budget cards
      expect(getByTestId("summary-pace-tick")).toBeTruthy()
      expect(getByTestId("budget-pace-tick-bud_groceries")).toBeTruthy()
      expect(getByTestId("budget-pace-tick-bud_euro_travel")).toBeTruthy()
    })

    it("preserves active workspace totals in hero summary when filtering to Paused budgets (DF-20)", () => {
      const { getByTestId, getByText, queryByText } = renderWithProviders(
        <BudgetsScreen />
      )

      expect(getByText("Groceries")).toBeTruthy()
      expect(queryByText("Dining Out")).toBeNull()

      fireEvent.click(getByTestId("budgets-filter-paused"))

      // List switches to Paused budget, while hero summary preserves active workspace totals
      expect(getByText("Dining Out")).toBeTruthy()
      expect(queryByText("Groceries")).toBeNull()
      expect(getByTestId("budgets-hero-amount").textContent).toBe("$865.00")
      expect(getByText("$355.00 of $1,220.00")).toBeTruthy()
    })

    it("keeps creation in the header and hides the hero on an empty workspace", () => {
      mockBudgetsListRef.current = []
      const ui = renderWithProviders(<BudgetsScreen />)
      const items = (
        mockStackOptionsRef.current!.unstable_headerRightItems as () => {
          icon: { name: string }
          onPress: () => void
        }[]
      )()
      expect(items.map((i) => i.icon.name)).toEqual(["plus", "sparkles"])
      items[0].onPress()
      expect(mockRouterPush).toHaveBeenCalledWith("/modal/manage-budget")
      expect(ui.queryByTestId("budgets-fab-add")).toBeNull()
      expect(ui.queryByTestId("budgets-hero-summary")).toBeNull()
      expect(ui.getAllByTestId("budgets-inline-search-toggle")).toHaveLength(1)
    })

    it("keeps the Android header limited to New and AI", () => {
      const previous = Platform.OS
      try {
        Platform.OS = "android"
        renderWithProviders(<BudgetsScreen />)
        const header = (
          mockStackOptionsRef.current!.headerRight as () => React.ReactElement<{
            children: React.ReactElement<{ testID: string }>[]
          }>
        )()
        expect(
          header.props.children.map((child) => child.props.testID)
        ).toEqual(["budgets-header-add", "budgets-header-ai"])
      } finally {
        Platform.OS = previous
      }
    })

    it("orders flat navigable rows by urgency, then paused and closed", () => {
      const [groceries, travel, paused] = mockBudgetsListRef.current
      mockBudgetsListRef.current = [
        { ...paused, id: "closed", status: "CLOSED" },
        paused,
        groceries,
        {
          ...travel,
          currentPeriod: { ...travel.currentPeriod, spentAmount: "22000" },
        },
      ]
      const ui = renderWithProviders(<BudgetsScreen />)
      fireEvent.click(ui.getByTestId("budgets-filter-all"))
      const rows = ui.getAllByTestId(/^budget-row-/)
      expect(rows.map((r) => r.dataset.testid)).toEqual([
        "budget-row-bud_euro_travel",
        "budget-row-bud_groceries",
        "budget-row-bud_paused",
        "budget-row-closed",
      ])
      expect(rows[1].parentElement?.style.borderBottomWidth).toBe("0.5px")
      expect(rows[1].textContent).toMatch(/day safe/)
      expect(rows[2].textContent).not.toMatch(/day safe/)
      fireEvent.click(rows[0])
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: "/(app)/finance/budgets/[id]",
        params: { id: "bud_euro_travel" },
      })
    })

    it("places the pace origin at workspace midnight", () => {
      expect(
        computeBudgetPacePercent(
          mockBudgetsListRef.current[0],
          new Date("2026-10-01T03:00:00Z"),
          "America/New_York"
        )
      ).toBe(0)
    })

    it("collapses search bar by default and toggles inline when search icon is tapped", () => {
      const { getByTestId, queryByTestId, getByText, queryByText } =
        renderWithProviders(<BudgetsScreen />)

      expect(queryByTestId("budgets-search-bar")).toBeNull()

      fireEvent.click(getByTestId("budgets-inline-search-toggle"))
      expect(getByTestId("budgets-search-bar")).toBeTruthy()

      const input = getByTestId("budgets-search-bar").querySelector("input")!
      fireEvent.change(input, { target: { value: "Euro" } })

      expect(getByText("Euro Trip")).toBeTruthy()
      expect(queryByText("Groceries")).toBeNull()
    })
  })

  describe("ManageBudgetModal (DF-21)", () => {
    it("renders single fluent form without raw icon slug text or duplicate Save buttons, opens Appearance picker on tap, and submits cleanly", async () => {
      vi.useRealTimers()
      const {
        getByTestId,
        queryByTestId,
        queryByText,
        getAllByRole,
        getByPlaceholderText,
      } = renderWithProviders(<ManageBudgetModal />)

      // No raw icon slug text like "piggy-bank"
      expect(queryByText("piggy-bank")).toBeNull()

      // Header must NOT have a duplicate Save button (only single sticky Save button in footer)
      const rightItemsFn = mockStackOptionsRef.current
        ?.unstable_headerRightItems as (() => unknown[]) | undefined
      expect(rightItemsFn ? rightItemsFn() : []).toEqual([])
      const saveButtons = getAllByRole("button", { name: /create budget/i })
      expect(saveButtons).toHaveLength(1)

      // Appearance picker starts closed and opens on tapping budget-appearance-trigger
      expect(queryByTestId("budget-appearance-picker")).toBeNull()
      fireEvent.click(getByTestId("budget-appearance-trigger"))
      expect(getByTestId("budget-appearance-picker")).toBeTruthy()

      // Select an icon from the Appearance picker
      fireEvent.click(getByTestId("budget-icon-option-utensils"))
      expect(queryByTestId("budget-appearance-picker")).toBeNull()

      // Fill name & limit and submit
      fireEvent.change(
        getByPlaceholderText("e.g. Dining & Restaurants, Groceries, Rent"),
        { target: { value: "Dining Out" } }
      )
      fireEvent.change(getByPlaceholderText("0.00"), {
        target: { value: "450.00" },
      })

      fireEvent.click(getByTestId("budget-save-button"))

      await waitFor(() => {
        expect(mockCreateBudgetMutateAsync).toHaveBeenCalledWith({
          budget: expect.objectContaining({
            name: "Dining Out",
            limitAmount: "45000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "utensils",
            color: "indigo",
          }),
        })
      })
      expect(mockRouterBack).toHaveBeenCalled()
    })
  })
})
