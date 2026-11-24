import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import {
  getLocalizedDashboardPresetMeta,
  getLocalizedDashboardWidgetMeta,
} from "@saturn/i18n"
import { TimezoneProvider, useDateSections, useI18n } from "@saturn/hooks"
import {
  configureZodLocale,
  LoginSchema,
  RegisterSchema,
} from "@saturn/schemas"
import { SpaceAvatarButton } from "../components/app-header"
import { getToolDomainLabelKey } from "../components/ai/tool-domain-label"
import { CustomizeOverviewSheet } from "../components/widgets/customize-overview-sheet"
import { getLocalizedCronSummary } from "../components/workflows/cron-label"
import {
  DatePickerSheet,
  formatDisplayDate,
} from "../components/ui/date-picker-sheet"

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
    locale: "es-ES",
    hourCycle: "h23" as const,
    weekStartsOn: 1 as const,
    mailAutoLoadRemoteContent: false,
    updateRegionalPreferences: vi.fn(async () => undefined),
    updateMailPreferences: vi.fn(async () => undefined),
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

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const Stub = (name: string) => (props: Record<string, unknown>) =>
    ReactMod.createElement("span", { "data-icon": name, ...props })
  return {
    ArrowDown: Stub("ArrowDown"),
    ArrowUp: Stub("ArrowUp"),
    Calendar: Stub("Calendar"),
    CalendarClock: Stub("CalendarClock"),
    ChevronLeft: Stub("ChevronLeft"),
    ChevronRight: Stub("ChevronRight"),
    Landmark: Stub("Landmark"),
    Mail: Stub("Mail"),
    PiggyBank: Stub("PiggyBank"),
    RotateCcw: Stub("RotateCcw"),
    Sparkles: Stub("Sparkles"),
    Workflow: Stub("Workflow"),
    X: Stub("X"),
  }
})

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
        ReactMod.createElement("span", null, title),
        children
      )
  )
  AppBottomSheet.displayName = "AppBottomSheet"
  const BottomSheetHeader = ({
    title,
  }: {
    title: string
    onClose?: () => void
  }) =>
    ReactMod.createElement(
      "div",
      { "data-testid": "bottom-sheet-header" },
      ReactMod.createElement("span", null, title)
    )
  return { AppBottomSheet, BottomSheetHeader }
})

vi.mock("../components/ui/button", async () => {
  const ReactMod = await import("react")
  return {
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      testID?: string
    }) =>
      ReactMod.createElement(
        "button",
        { "data-testid": testID, onClick: onPress },
        children
      ),
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
  }
})

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}))

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
      hairlineWidth: 1,
      absoluteFill: {},
    },
    useColorScheme: () => "dark",
    Image: ({ style, ...props }: Record<string, unknown>) =>
      ReactMod.createElement("img", { ...props, style: flattenStyle(style) }),
    Modal: ({
      visible,
      children,
    }: {
      visible?: boolean
      children?: React.ReactNode
    }) =>
      visible
        ? ReactMod.createElement("div", { "data-testid": "rn-modal" }, children)
        : null,
    View: ({ children, style, ...props }: Record<string, unknown>) =>
      ReactMod.createElement(
        "div",
        { ...props, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    Text: ({
      children,
      style,
      numberOfLines: _numberOfLines,
      testID,
      ...props
    }: Record<string, unknown>) =>
      ReactMod.createElement(
        "span",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children as React.ReactNode
      ),
    Switch: ({
      value,
      disabled,
      onValueChange,
      testID,
      accessibilityLabel,
    }: {
      value?: boolean
      disabled?: boolean
      onValueChange?: (val: boolean) => void
      testID?: string
      accessibilityLabel?: string
    }) =>
      ReactMod.createElement("input", {
        type: "checkbox",
        checked: Boolean(value),
        disabled,
        "data-testid": testID,
        "aria-label": accessibilityLabel,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onValueChange?.(e.target.checked),
      }),
    TouchableOpacity: ({
      children,
      onPress,
      onTouchStart,
      onTouchEnd,
      testID,
      accessibilityRole,
      accessibilityLabel,
      accessibilityHint,
      disabled,
      style,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      onTouchStart?: (e: unknown) => void
      onTouchEnd?: (e: unknown) => void
      testID?: string
      accessibilityRole?: string
      accessibilityLabel?: string
      accessibilityHint?: string
      disabled?: boolean
      style?: unknown
    }) =>
      ReactMod.createElement(
        "button",
        {
          "data-testid": testID,
          role: accessibilityRole,
          "aria-label": accessibilityLabel,
          "data-hint": accessibilityHint,
          disabled,
          style: flattenStyle(style),
          onClick: disabled ? undefined : onPress,
          onTouchStart,
          onTouchEnd,
        },
        children
      ),
  }
})

function I18nLabelsProbe() {
  const { t, locale, language } = useI18n()
  return (
    <div>
      <span data-testid="i18n-locale">{locale}</span>
      <span data-testid="i18n-lang">{language}</span>
      <span data-testid="nav-overview">{t("nav.overview")}</span>
      <span data-testid="nav-calendar">{t("nav.calendar")}</span>
      <span data-testid="nav-mail">{t("nav.mail")}</span>
      <span data-testid="nav-finance">{t("nav.finance")}</span>
      <span data-testid="nav-menu">{t("nav.menu")}</span>
      <span data-testid="regional-title">{t("settings.regional.title")}</span>
      <span data-testid="regional-saved">{t("settings.regional.saved")}</span>
      <span data-testid="greeting-morning">
        {t("dashboard.overview.greetingMorning")}
      </span>
      <span data-testid="prompt-schedule">
        {t("dashboard.overview.promptSchedule")}
      </span>
      <span data-testid="quick-action-expense">
        {t("dashboard.quickAction.recordExpense")}
      </span>
      <span data-testid="quick-action-compose">
        {t("dashboard.quickAction.composeEmail")}
      </span>
    </div>
  )
}

function FinanceI18nProbe() {
  const { t } = useI18n()
  return (
    <div>
      <span data-testid="fin-pill-expense">
        {t("finance.transactions.create.mobile.pillExpense")}
      </span>
      <span data-testid="fin-new-tx">
        {t("finance.transactions.create.mobile.newTransaction")}
      </span>
      <span data-testid="fin-expense-submit">
        {t("finance.transactions.expenseForm.submitRecord", {
          amount: "$12.50",
        })}
      </span>
      <span data-testid="fin-income-recorded">
        {t("finance.transactions.incomeForm.recordedTitle")}
      </span>
      <span data-testid="fin-transfer-title">
        {t("finance.transactions.transferForm.crossCurrencyTitle")}
      </span>
      <span data-testid="fin-pick-account">
        {t("finance.pickers.account.defaultTitle")}
      </span>
      <span data-testid="fin-pick-borrowing">
        {t("finance.pickers.borrowing.defaultTitle")}
      </span>
      <span data-testid="fin-spent-of">
        {t("finance.pickers.budget.spentOf", {
          spent: "$40.00",
          limit: "$100.00",
        })}
      </span>
      <span data-testid="fin-inst-desc">
        {t("finance.pickers.institution.noInstitutionDesc")}
      </span>
      <span data-testid="fin-sched-due">
        {t("finance.pickers.scheduled.dueLabel", { date: "12 nov" })}
      </span>
      <span data-testid="fin-conv-rate">
        {t("finance.conversion.exchangeRateLine", {
          from: "USD",
          rate: "0.9231",
          to: "EUR",
        })}
      </span>
      <span data-testid="fin-hero-amount">
        {t("finance.transactions.expenseForm.amountLabel").toUpperCase()}
      </span>
      <span data-testid="fin-widget-income">
        {t("dashboard.widget.net_worth.incomeStat", { month: "nov" })}
      </span>
      <span data-testid="fin-widget-networth">
        {t("dashboard.widget.net_worth.totalNetWorth").toUpperCase()}
      </span>
      <span data-testid="fin-widget-accounts">
        {t("dashboard.widget.net_worth.accountsCount", { count: 3 })}
      </span>
      <span data-testid="fin-widget-add-tx">
        {t("dashboard.widget.net_worth.addTransaction")}
      </span>
      <span data-testid="fin-bills-due">
        {t("dashboard.widget.upcoming_bills.dueLabel", { date: "5 dic" })}
      </span>
      <span data-testid="fin-bills-overdue">
        {t("dashboard.widget.upcoming_bills.overdue")}
      </span>
      <span data-testid="fin-total-spent">
        {t("finance.tab.totalSpentThisMonth").toUpperCase()}
      </span>
      <span data-testid="fin-of-limit">
        {t("finance.tab.ofLimit", { amount: "$100.00" })}
      </span>
      <span data-testid="fin-on-track">
        {t("finance.tab.onTrackLabel", { count: 2 })}
      </span>
      <span data-testid="fin-critical">
        {t("finance.tab.criticalCallout", {
          name: "Comida",
          pct: 95,
          spent: "$95.00",
          limit: "$100.00",
        })}
      </span>
      <span data-testid="fin-older">
        {t("finance.transactions.list.older")}
      </span>
      <span data-testid="fin-tx-income">
        {t("finance.transactions.list.income")}
      </span>
      <span data-testid="fin-tx-recurring">
        {t("finance.transactions.recurring")}
      </span>
      <span data-testid="fin-tx-unnamed">
        {t("finance.transactions.detail.unnamed")}
      </span>
      <span data-testid="fin-pace-over-badge">
        {t("dashboard.widget.budget_pace.overPaceBadge")}
      </span>
      <span data-testid="fin-pace-ahead-badge">
        {t("dashboard.widget.budget_pace.aheadBadge")}
      </span>
      <span data-testid="fin-pace-on-track-badge">
        {t("dashboard.widget.budget_pace.onTrackBadge")}
      </span>
      <span data-testid="fin-pace-over-limit-badge">
        {t("dashboard.widget.budget_pace.overLimitBadge")}
      </span>
      <span data-testid="fin-pace-active-badge">
        {t("dashboard.widget.budget_pace.activeBadge", { count: 3 })}
      </span>
      <span data-testid="fin-pace-meta">
        {t("dashboard.widget.budget_pace.paceMeta", { day: 12, pct: 40 })}
      </span>
      <span data-testid="fin-pace-over-delta">
        {t("dashboard.widget.budget_pace.overPaceDelta")}
      </span>
      <span data-testid="fin-pace-under-delta">
        {t("dashboard.widget.budget_pace.underPaceDelta")}
      </span>
      <span data-testid="fin-pace-remaining">
        {t("dashboard.widget.budget_pace.remaining")}
      </span>
      <span data-testid="fin-inbox-one">
        {t("finance.tab.pendingInboxOne")}
      </span>
      <span data-testid="fin-inbox-many">
        {t("finance.tab.pendingInboxMany", { count: 4 })}
      </span>
      <span data-testid="fin-inbox-subtitle">
        {t("finance.tab.pendingInboxSubtitle")}
      </span>
      <span data-testid="menu-section-triage">{t("menu.sectionTriage")}</span>
      <span data-testid="menu-section-workspace">
        {t("menu.sectionWorkspace")}
      </span>
      <span data-testid="menu-appearance-light">{t("menu.light")}</span>
      <span data-testid="menu-appearance-dark">{t("menu.dark")}</span>
      <span data-testid="menu-ai-assistant">{t("menu.aiAssistant")}</span>
      <span data-testid="menu-api-keys">{t("menu.apiKeys")}</span>
      <span data-testid="menu-web-only">{t("menu.webOnly")}</span>
      <span data-testid="menu-workspace-active">
        {t("menu.workspaceActive")}
      </span>
      <span data-testid="menu-switch">{t("menu.switchWorkspace")}</span>
      <span data-testid="menu-approval-needed">{t("menu.approvalNeeded")}</span>
      <span data-testid="ai-starter-2">{t("ai.conversation.starter2")}</span>
      <span data-testid="ai-phase-generating">
        {t("ai.streamPhase.generating")}
      </span>
      <span data-testid="ai-thought-process">
        {t("ai.chatMobile.thoughtProcess")}
      </span>
      <span data-testid="ai-steps-count">
        {t("ai.chatMobile.chatStepsCount", { count: 3 })}
      </span>
      <span data-testid="ai-confirm-tool">
        {t("ai.chatMobile.confirmTool", {
          tool: "Crear transacción",
          domain: t("nav.finance"),
        })}
      </span>
      <span data-testid="ai-domain-space">
        {t(getToolDomainLabelKey("space"))}
      </span>
      <span data-testid="ai-copy">{t("ai.chatMobile.copy")}</span>
      <span data-testid="ai-placeholder">
        {t("ai.chatMobile.messagePlaceholder")}
      </span>
      <span data-testid="ai-chat-sheet-title">
        {t("ai.chatMobile.chatSheetTitle")}
      </span>
      <span data-testid="ai-agents-title">{t("ai.agentsMobile.title")}</span>
      <span data-testid="wf-system-section">
        {t("workflows.mobile.systemWorkflows").toUpperCase()}
      </span>
      <span data-testid="wf-custom-section">
        {t("workflows.mobile.customWorkflows").toUpperCase()}
      </span>
      <span data-testid="wf-generate-ai">
        {t("workflows.mobile.generateWithAI")}
      </span>
      <span data-testid="wf-create">
        {t("workflows.mobile.createWorkflow")}
      </span>
      <span data-testid="wf-tab-counts">
        {t("workflows.mobile.workflowsWithCount", { count: 4 })} /{" "}
        {t("workflows.mobile.runHistoryWithCount", { count: 2 })}
      </span>
      <span data-testid="wf-empty-custom">
        {t("workflows.mobile.noCustomWorkflows")}
      </span>
      <span data-testid="wf-flow-meta">
        {t("workflows.mobile.flowMeta", {
          triggers: t("workflows.triggerCountOther", { count: 2 }),
          steps: t("workflows.stepCountOne", { count: 1 }),
          runs: `7 ${t("workflows.runs7d")}`,
        })}
      </span>
      <span data-testid="wf-run-step-trace">
        {t("workflows.mobile.stepTrace", { count: 3 })}
      </span>
      <span data-testid="wf-run-step-failed">
        {t("workflows.mobile.stepFailedHeader", { step: "summarize" })}
      </span>
      <span data-testid="wf-run-rows">
        {t("workflows.runs.rowsOther", { count: 5 })} /{" "}
        {t("workflows.runs.cacheHit")}
      </span>
      <span data-testid="wf-trigger-title">
        {t("workflows.mobile.configureTrigger")}
      </span>
      <span data-testid="wf-cron-label">
        {t("workflows.trigger.cronExpression", { timezone: "Europe/Madrid" })}
      </span>
      <span data-testid="wf-cron-summary">
        {getLocalizedCronSummary("0 9 * * 1-5", undefined, t)}
      </span>
      <span data-testid="wf-cron-invalid">
        {getLocalizedCronSummary("nonsense", undefined, t)}
      </span>
      <span data-testid="wf-save-trigger">
        {t("workflows.mobile.saveTrigger")}
      </span>
      <span data-testid="wf-step-type">{t("workflows.mobile.stepType")}</span>
      <span data-testid="wf-insert-variable">
        {t("workflows.variables.insert").toUpperCase()}
      </span>
      <span data-testid="wf-sources-pill">
        {t("workflows.inspector.tabSources", { count: 2 })}
      </span>
      <span data-testid="wf-model-config">
        {t("workflows.mobile.modelConfig")}
      </span>
      <span data-testid="wf-model-role-fast">
        {t("workflows.model.roleFast")}
      </span>
      <span data-testid="wf-apply-model">
        {t("workflows.mobile.applyModelSettings")}
      </span>
      <span data-testid="wf-data-sources">
        {t("workflows.mobile.dataSources")}
      </span>
      <span data-testid="wf-dry-test-status">
        {t("workflows.mobile.dryTestStatus", { status: "completed" })}
      </span>
      <span data-testid="wf-generate-title">
        {t("workflows.mobile.buildWithAITitle")}
      </span>
      <span data-testid="wf-generate-draft">
        {t("workflows.mobile.generateDraft")}
      </span>
      <span data-testid="conn-title">
        {t("settings.connectors.connectedAccountsTitle")}
      </span>
      <span data-testid="conn-connect-google">
        {t("settings.connectors.connectGoogle")}
      </span>
      <span data-testid="conn-coming-soon">
        {t("settings.connectors.comingSoon")}
      </span>
      <span data-testid="conn-admin-only">
        {t("settings.connectors.adminOnly")}
      </span>
      <span data-testid="conn-never-synced">
        {t("settings.connectors.neverSynced")}
      </span>
      <span data-testid="conn-cap-cals">
        {t("settings.connectors.capCalendar")}
      </span>
      <span data-testid="conn-status-active">
        {t("settings.connectors.statusActive")}
      </span>
      <span data-testid="conn-cancel">{t("common.cancel")}</span>
      <span data-testid="ws-title">{t("settings.spaces.mobile.title")}</span>
      <span data-testid="ws-add-member">
        {t("settings.spaces.mobile.addMember")}
      </span>
      <span data-testid="ws-you">{t("settings.spaces.mobile.you")}</span>
      <span data-testid="sec-title">
        {t("settings.sessions.mobile.headerTitle")}
      </span>
      <span data-testid="sec-signout-all">
        {t("settings.sessions.mobile.revokeAllAction")}
      </span>
      <span data-testid="sec-enrolled-on">
        {t("settings.devices.enrolledOn", { date: "12 feb" })}
      </span>
      <span data-testid="ak-title">
        {t("settings.apiKeys.mobile.headerTitle")}
      </span>
      <span data-testid="ak-never-used">{t("settings.apiKeys.neverUsed")}</span>
      <span data-testid="hub-title">{t("settings.hub.title")}</span>
      <span data-testid="hub-clear-cache">
        {t("settings.hub.mobile.clearCache")}
      </span>
      <span data-testid="hub-soon">{t("settings.hub.mobile.soon")}</span>
      <span data-testid="hub-device-count">
        {t("settings.hub.mobile.deviceCountOther", { count: 3 })}
      </span>
      <span data-testid="srv-section">
        {t("settings.server.sectionHeader").toUpperCase()}
      </span>
    </div>
  )
}

const PROBE_TODAY = `${new Date().toISOString().slice(0, 10)}T12:00:00Z`
const PROBE_YESTERDAY = `${new Date(Date.now() - 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)}T12:00:00Z`

function DateSectionsProbe() {
  const sections = useDateSections([
    { transactionDate: PROBE_TODAY },
    { transactionDate: PROBE_YESTERDAY },
    { transactionDate: "2020-03-15" },
    {},
  ])
  return (
    <span data-testid="date-sections">
      {sections.map((s) => s.title).join(" | ")}
    </span>
  )
}

function SchemaValidationProbe() {
  const { locale } = useI18n()
  const loginRes = LoginSchema.safeParse({ identifier: "", password: "" })
  const regRes = RegisterSchema.safeParse({
    name: "",
    email: "not-an-email",
    password: "123",
  })

  const loginErrors = loginRes.success
    ? []
    : loginRes.error.issues.map((issue) => issue.message)
  const regErrors = regRes.success
    ? []
    : regRes.error.issues.map((issue) => issue.message)

  return (
    <div>
      <span data-testid="schema-locale">{locale}</span>
      <span data-testid="login-errors">{loginErrors.join(" | ")}</span>
      <span data-testid="register-errors">{regErrors.join(" | ")}</span>
    </div>
  )
}

describe("Mobile i18n & User-Scoped Regional Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configureZodLocale("en-US")
  })

  afterEach(() => {
    configureZodLocale("en-US")
  })

  it("emits Spanish toast copy in SpaceAvatarButton when wrapped in TimezoneProvider locale='es-ES'", async () => {
    const { getByTestId } = render(
      <TimezoneProvider timezone="Europe/Madrid" locale="es-ES">
        <SpaceAvatarButton />
      </TimezoneProvider>
    )

    const btn = getByTestId("space-avatar-button")
    fireEvent.touchStart(btn, {
      changedTouches: [{ pageX: 100, pageY: 100 }],
    })
    fireEvent.touchEnd(btn, {
      changedTouches: [{ pageX: 100, pageY: 50 }],
    })

    await waitFor(() => {
      expect(mockSwitchSpace).toHaveBeenCalledWith("spc_family")
    })
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "info",
      title: "Cambiado a Family Budget",
    })
  })

  it("localizes dashboard widget & preset metadata and CustomizeOverviewSheet in Spanish", () => {
    const widgetMeta = getLocalizedDashboardWidgetMeta("budget_pace", "es-ES")
    expect(widgetMeta.title).toBe("Ritmo de presupuesto mensual")

    const presetMeta = getLocalizedDashboardPresetMeta("finance", "es-ES")
    expect(presetMeta.label).toBe("Enfoque financiero")

    const { getByText, getByTestId } = render(
      <TimezoneProvider timezone="Europe/Madrid" locale="es-ES">
        <CustomizeOverviewSheet
          open={true}
          activeWidgets={["net_worth", "budget_pace"]}
          onClose={vi.fn()}
          onChangeWidgets={vi.fn()}
        />
      </TimezoneProvider>
    )

    expect(getByTestId("app-bottom-sheet").getAttribute("data-title")).toBe(
      "Personalizar panel"
    )
    expect(getByText("Ritmo de presupuesto mensual")).toBeTruthy()
    expect(getByText("Enfoque financiero")).toBeTruthy()
    expect(getByText("Restablecer predeterminado")).toBeTruthy()
  })

  it("resolves Spanish nav.* and settings.regional.* keys via useI18n()", () => {
    const { getByTestId } = render(
      <TimezoneProvider timezone="Europe/Madrid" locale="es-ES">
        <I18nLabelsProbe />
      </TimezoneProvider>
    )

    expect(getByTestId("i18n-locale").textContent).toBe("es-ES")
    expect(getByTestId("i18n-lang").textContent).toBe("es")
    expect(getByTestId("nav-overview").textContent).toBe("Resumen")
    expect(getByTestId("nav-calendar").textContent).toBe("Calendario")
    expect(getByTestId("nav-mail").textContent).toBe("Correo")
    expect(getByTestId("nav-finance").textContent).toBe("Finanzas")
    expect(getByTestId("nav-menu").textContent).toBe("Menú")
    expect(getByTestId("regional-title").textContent).toBe(
      "Idioma y formato regional"
    )
    expect(getByTestId("regional-saved").textContent).toBe(
      "Preferencias regionales actualizadas"
    )
    expect(getByTestId("greeting-morning").textContent).toBe("Buenos días")
    expect(getByTestId("prompt-schedule").textContent).toBe("Agenda de hoy")
    expect(getByTestId("quick-action-expense").textContent).toBe(
      "Registrar gasto"
    )
    expect(getByTestId("quick-action-compose").textContent).toBe(
      "Redactar correo"
    )
  })

  it("resolves Spanish finance.* transaction form and picker keys via useI18n()", () => {
    const { getByTestId } = render(
      <TimezoneProvider timezone="Europe/Madrid" locale="es-ES">
        <FinanceI18nProbe />
      </TimezoneProvider>
    )

    expect(getByTestId("fin-pill-expense").textContent).toBe("Gasto")
    expect(getByTestId("fin-new-tx").textContent).toBe("Nueva transacción")
    expect(getByTestId("fin-expense-submit").textContent).toBe(
      "Registrar gasto • $12.50"
    )
    expect(getByTestId("fin-income-recorded").textContent).toBe(
      "Ingreso registrado"
    )
    expect(getByTestId("fin-transfer-title").textContent).toBe(
      "Transferencia entre monedas"
    )
    expect(getByTestId("fin-pick-account").textContent).toBe(
      "Seleccionar cuenta"
    )
    expect(getByTestId("fin-pick-borrowing").textContent).toBe(
      "Seleccionar acuerdo de préstamo"
    )
    expect(getByTestId("fin-spent-of").textContent).toBe("$40.00 de $100.00")
    expect(getByTestId("fin-inst-desc").textContent).toBe(
      "Tarjeta independiente o billetera en efectivo"
    )
    expect(getByTestId("fin-sched-due").textContent).toBe("Vence: 12 nov")
    expect(getByTestId("fin-conv-rate").textContent).toBe(
      "Tipo de cambio: 1 USD = 0.9231 EUR"
    )
    expect(getByTestId("fin-hero-amount").textContent).toBe("IMPORTE")
    expect(getByTestId("fin-widget-income").textContent).toBe("Ingresos (nov)")
    expect(getByTestId("fin-widget-networth").textContent).toBe(
      "PATRIMONIO NETO TOTAL"
    )
    expect(getByTestId("fin-widget-accounts").textContent).toBe("3 cuentas")
    expect(getByTestId("fin-widget-add-tx").textContent).toBe(
      "Añadir transacción"
    )
    expect(getByTestId("fin-bills-due").textContent).toBe("Vence 5 dic")
    expect(getByTestId("fin-bills-overdue").textContent).toBe("Atrasado")
    expect(getByTestId("fin-total-spent").textContent).toBe(
      "TOTAL GASTADO ESTE MES"
    )
    expect(getByTestId("fin-of-limit").textContent).toBe("de $100.00")
    expect(getByTestId("fin-on-track").textContent).toBe("2 en control")
    expect(getByTestId("fin-critical").textContent).toBe(
      "Comida está al 95% ($95.00 de $100.00)"
    )
    expect(getByTestId("fin-older").textContent).toBe("Anteriores")
    expect(getByTestId("fin-tx-income").textContent).toBe("Ingresos")
    expect(getByTestId("fin-tx-recurring").textContent).toBe("Recurrente")
    expect(getByTestId("fin-tx-unnamed").textContent).toBe("Sin nombre")
    expect(getByTestId("fin-pace-over-badge").textContent).toBe(
      "Por encima del ritmo"
    )
    expect(getByTestId("fin-pace-ahead-badge").textContent).toBe(
      "Por debajo del ritmo"
    )
    expect(getByTestId("fin-pace-on-track-badge").textContent).toBe("En ritmo")
    expect(getByTestId("fin-pace-over-limit-badge").textContent).toBe(
      "Límite superado"
    )
    expect(getByTestId("fin-pace-active-badge").textContent).toBe("3 activos")
    expect(getByTestId("fin-pace-meta").textContent).toBe(
      "Día 12 · 40% del mes"
    )
    expect(getByTestId("fin-pace-over-delta").textContent).toBe(
      "sobre el ritmo"
    )
    expect(getByTestId("fin-pace-under-delta").textContent).toBe(
      "bajo el ritmo"
    )
    expect(getByTestId("fin-pace-remaining").textContent).toBe("restante")
    expect(getByTestId("fin-inbox-one").textContent).toBe(
      "1 elemento pendiente en la cola"
    )
    expect(getByTestId("fin-inbox-many").textContent).toBe(
      "4 elementos pendientes en la cola"
    )
    expect(getByTestId("fin-inbox-subtitle").textContent).toBe(
      "Toca para revisar y aprobar en tu libro mayor"
    )
    expect(getByTestId("menu-section-triage").textContent).toBe(
      "Triaje y automatización"
    )
    expect(getByTestId("menu-section-workspace").textContent).toBe(
      "Espacio de trabajo y preferencias"
    )
    expect(getByTestId("menu-appearance-light").textContent).toBe("Claro")
    expect(getByTestId("menu-appearance-dark").textContent).toBe("Oscuro")
    expect(getByTestId("menu-ai-assistant").textContent).toBe("Asistente de IA")
    expect(getByTestId("menu-api-keys").textContent).toBe("Claves de API")
    expect(getByTestId("menu-web-only").textContent).toBe("Solo web")
    expect(getByTestId("menu-workspace-active").textContent).toBe(
      "Espacio de trabajo activo"
    )
    expect(getByTestId("menu-switch").textContent).toBe("Cambiar")
    expect(getByTestId("menu-approval-needed").textContent).toBe(
      "Aprobación requerida"
    )
    expect(getByTestId("ai-starter-2").textContent).toBe(
      "¿Qué eventos tengo en el calendario esta semana?"
    )
    expect(getByTestId("ai-phase-generating").textContent).toBe(
      "Generando respuesta…"
    )
    expect(getByTestId("ai-thought-process").textContent).toBe(
      "Proceso de razonamiento"
    )
    expect(getByTestId("ai-steps-count").textContent).toBe(
      "3 pasos de herramienta"
    )
    expect(getByTestId("ai-confirm-tool").textContent).toBe(
      "Confirmar Crear transacción (Finanzas)"
    )
    expect(getByTestId("ai-domain-space").textContent).toBe(
      "Espacio de trabajo"
    )
    expect(getByTestId("ai-copy").textContent).toBe("Copiar")
    expect(getByTestId("ai-placeholder").textContent).toBe(
      "Escribe a Saturn IA..."
    )
    expect(getByTestId("ai-chat-sheet-title").textContent).toBe(
      "Conversaciones de chat"
    )
    expect(getByTestId("ai-agents-title").textContent).toBe(
      "Agentes y ejecuciones recientes"
    )
    expect(getByTestId("wf-system-section").textContent).toBe(
      "FLUJOS DEL SISTEMA"
    )
    expect(getByTestId("wf-custom-section").textContent).toBe(
      "FLUJOS PERSONALIZADOS"
    )
    expect(getByTestId("wf-generate-ai").textContent).toBe("Generar con IA")
    expect(getByTestId("wf-create").textContent).toBe("Crear flujo de trabajo")
    expect(getByTestId("wf-tab-counts").textContent).toBe(
      "Flujos (4) / Historial de ejecuciones (2)"
    )
    expect(getByTestId("wf-empty-custom").textContent).toBe(
      "Aún no hay flujos personalizados. Toca Generar con IA o Crear flujo arriba."
    )
    expect(getByTestId("wf-flow-meta").textContent).toBe(
      "2 disparadores • 1 paso • 7 ejecuciones (7 d)"
    )
    expect(getByTestId("wf-run-step-trace").textContent).toBe(
      "Trazado de pasos (3)"
    )
    expect(getByTestId("wf-run-step-failed").textContent).toBe(
      "El paso summarize falló"
    )
    expect(getByTestId("wf-run-rows").textContent).toBe("5 filas / acierto")
    expect(getByTestId("wf-trigger-title").textContent).toBe(
      "Configurar disparador"
    )
    expect(getByTestId("wf-cron-label").textContent).toBe(
      "Expresión Cron (Europe/Madrid)"
    )
    expect(getByTestId("wf-cron-summary").textContent).toBe(
      "Días laborables a las 09:00"
    )
    expect(getByTestId("wf-cron-invalid").textContent).toBe(
      "Expresión cron no válida"
    )
    expect(getByTestId("wf-save-trigger").textContent).toBe(
      "Guardar disparador"
    )
    expect(getByTestId("wf-step-type").textContent).toBe("Tipo de paso")
    expect(getByTestId("wf-insert-variable").textContent).toBe(
      "INSERTAR VARIABLE"
    )
    expect(getByTestId("wf-sources-pill").textContent).toBe("Fuentes (2)")
    expect(getByTestId("wf-model-config").textContent).toBe(
      "Configuración del modelo"
    )
    expect(getByTestId("wf-model-role-fast").textContent).toBe(
      "Rápido (baja latencia)"
    )
    expect(getByTestId("wf-apply-model").textContent).toBe(
      "Aplicar configuración del modelo"
    )
    expect(getByTestId("wf-data-sources").textContent).toBe("Fuentes de datos")
    expect(getByTestId("wf-dry-test-status").textContent).toBe(
      "Estado de la prueba simulada: completed"
    )
    expect(getByTestId("wf-generate-title").textContent).toBe(
      "Crear un flujo con IA"
    )
    expect(getByTestId("wf-generate-draft").textContent).toBe(
      "Generar borrador"
    )
    expect(getByTestId("conn-title").textContent).toBe("Cuentas conectadas")
    expect(getByTestId("conn-connect-google").textContent).toBe(
      "Conectar Google"
    )
    expect(getByTestId("conn-coming-soon").textContent).toBe("Próximamente")
    expect(getByTestId("conn-admin-only").textContent).toBe(
      "Solo administrador"
    )
    expect(getByTestId("conn-never-synced").textContent).toBe(
      "Nunca sincronizada"
    )
    expect(getByTestId("conn-cap-cals").textContent).toBe("Calendarios")
    expect(getByTestId("conn-status-active").textContent).toBe("Activa")
    expect(getByTestId("conn-cancel").textContent).toBe("Cancelar")
    expect(getByTestId("ws-title").textContent).toBe(
      "Configuración del espacio de trabajo"
    )
    expect(getByTestId("ws-add-member").textContent).toBe("Añadir miembro")
    expect(getByTestId("ws-you").textContent).toBe("(Tú)")
    expect(getByTestId("sec-title").textContent).toBe(
      "Sesiones activas y seguridad"
    )
    expect(getByTestId("sec-signout-all").textContent).toBe(
      "Cerrar sesión en todos los dispositivos"
    )
    expect(getByTestId("sec-enrolled-on").textContent).toBe("Registrado 12 feb")
    expect(getByTestId("ak-title").textContent).toBe("Claves de API")
    expect(getByTestId("ak-never-used").textContent).toBe("Nunca usada")
    expect(getByTestId("hub-title").textContent).toBe("Configuración")
    expect(getByTestId("hub-clear-cache").textContent).toBe(
      "Borrar caché sin conexión"
    )
    expect(getByTestId("hub-soon").textContent).toBe("Pronto")
    expect(getByTestId("hub-device-count").textContent).toBe("3 dispositivos")
    expect(getByTestId("srv-section").textContent).toBe("ENTORNO AUTOALOJADO")
  })

  it("renders Spanish date section headers via useDateSections", () => {
    const { getByTestId } = render(
      <TimezoneProvider timezone="UTC" locale="es-ES">
        <DateSectionsProbe />
      </TimezoneProvider>
    )

    const titles = getByTestId("date-sections").textContent?.split(" | ") ?? []
    expect(titles[0]).toBe("Hoy")
    expect(titles[1]).toBe("Ayer")
    expect(titles[2]).toMatch(/dom.*15.*2020/i)
    expect(titles[3]).toBe("Anteriores")
  })

  it("validates mobile form inputs via @saturn/schemas with Spanish error messages under TimezoneProvider locale='es-419'", async () => {
    const { getByTestId, rerender } = render(
      <TimezoneProvider timezone="America/Mexico_City" locale="es-419">
        <SchemaValidationProbe />
      </TimezoneProvider>
    )

    await waitFor(() => {
      rerender(
        <TimezoneProvider timezone="America/Mexico_City" locale="es-419">
          <SchemaValidationProbe />
        </TimezoneProvider>
      )
      expect(getByTestId("login-errors").textContent).toContain(
        "El usuario o correo electrónico es obligatorio"
      )
      expect(getByTestId("login-errors").textContent).toContain(
        "La contraseña es obligatoria"
      )
      expect(getByTestId("register-errors").textContent).toContain(
        "El nombre es obligatorio"
      )
      expect(getByTestId("register-errors").textContent).toContain(
        "Por favor ingresa una dirección de correo válida"
      )
      expect(getByTestId("register-errors").textContent).toContain(
        "La contraseña debe tener al menos 6 caracteres"
      )
    })
  })

  it("formats display dates in Spanish and English via formatDisplayDate", () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86_400_000)
    const pastDate = new Date(Date.UTC(2025, 10, 10, 12, 0, 0))

    expect(formatDisplayDate(now, "UTC", "es-ES")).toMatch(/^Hoy \(\d+ [A-Z]/)
    expect(formatDisplayDate(yesterday, "UTC", "es-ES")).toMatch(
      /^Ayer \(\d+ [A-Z]/
    )
    expect(formatDisplayDate(pastDate, "UTC", "es-ES")).toBe("10 Nov 2025")

    expect(formatDisplayDate(now, "UTC", "en-US")).toMatch(/^Today \([A-Z]/)
    expect(formatDisplayDate(yesterday, "UTC", "en-US")).toMatch(
      /^Yesterday \([A-Z]/
    )
    expect(formatDisplayDate(pastDate, "UTC", "en-US")).toBe("Nov 10, 2025")
  })

  it("localizes DatePickerSheet presets, title, month header, and Monday-first grid in Spanish", () => {
    // Nov 1, 2026 is a Sunday -> 6 leading blank cells when weekStartsOn=1
    const nov2026 = new Date(Date.UTC(2026, 10, 5, 12, 0, 0))
    const { container, getByText } = render(
      <TimezoneProvider timezone="UTC" locale="es-ES" weekStartsOn={1}>
        <DatePickerSheet
          visible={true}
          value={nov2026}
          onChange={vi.fn()}
          onClose={vi.fn()}
        />
      </TimezoneProvider>
    )

    expect(getByText("Seleccionar fecha")).toBeTruthy()
    expect(getByText("Hoy")).toBeTruthy()
    expect(getByText("Ayer")).toBeTruthy()
    expect(getByText("Hace 2 días")).toBeTruthy()
    expect(getByText("1.º del mes")).toBeTruthy()

    expect(getByText("Noviembre 2026")).toBeTruthy()

    const allSpans = Array.from(container.querySelectorAll("span")).map(
      (el) => el.textContent
    )
    const monIndex = allSpans.indexOf("Lun")
    const sunIndex = allSpans.indexOf("Dom")
    expect(monIndex).toBeGreaterThan(-1)
    expect(sunIndex).toBe(monIndex + 6)

    // Verify grid has 6 leading blank cells before day 1 (Nov 1, 2026 is Sunday)
    // After the 7 weekday header cells, the calendar grid starts with 6 empty divs before the button for "1"
    const day1Button = getByText("1").closest("button")
    const day1Cell = day1Button?.parentElement
    const grid = day1Cell?.parentElement
    expect(grid).toBeTruthy()
    const cells = Array.from(grid?.children ?? [])
    expect(cells.indexOf(day1Cell as Element)).toBe(6)
    for (let i = 0; i < 6; i++) {
      expect(cells[i].querySelector("button")).toBeNull()
    }
  })
})
