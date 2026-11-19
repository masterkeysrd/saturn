import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import {
  getLocalizedDashboardPresetMeta,
  getLocalizedDashboardWidgetMeta,
} from "@saturn/i18n"
import { TimezoneProvider, useI18n } from "@saturn/hooks"
import {
  configureZodLocale,
  LoginSchema,
  RegisterSchema,
} from "@saturn/schemas"
import { SpaceAvatarButton } from "../components/app-header"
import { CustomizeOverviewSheet } from "../components/widgets/customize-overview-sheet"

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
    updateRegionalPreferences: vi.fn(async () => undefined),
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
  return { AppBottomSheet }
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
    </div>
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
})
