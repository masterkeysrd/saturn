import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import {
  CATEGORICAL_HEX_MAP,
  CATEGORICAL_HUES,
  CATEGORICAL_PALETTE,
} from "@saturn/tokens"
import {
  MobileThemeProvider,
  THEME_MODE_STORAGE_KEY,
  darkColors,
  darkShadows,
  getCashflowColor,
  getNativeBudgetColors,
  lightColors,
  lightShadows,
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../lib/theme"
import { getCardTheme } from "../components/finance/card-account-item"
import { Card } from "../components/ui/card"

const mockColorSchemeState = vi.hoisted(() => ({
  scheme: "dark" as "light" | "dark" | null | undefined,
  setColorScheme: vi.fn(),
}))

const mockStorage = vi.hoisted(() => ({
  getItem: vi.fn<() => Promise<string | null>>(async () => null),
  setItem: vi.fn<() => Promise<void>>(async () => undefined),
}))

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  return {
    Appearance: {
      setColorScheme: mockColorSchemeState.setColorScheme,
    },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    useColorScheme: () => mockColorSchemeState.scheme,
    View: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { testID?: string }) => {
      const flat = Array.isArray(style)
        ? Object.assign({}, ...style.filter(Boolean))
        : (style as Record<string, unknown> | undefined)
      return ReactMod.createElement(
        "div",
        {
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          ...(flat ? { "data-style": JSON.stringify(flat), style: flat } : {}),
        },
        children as React.ReactNode
      )
    },
    Text: ({ children, ...props }: Record<string, unknown>) =>
      ReactMod.createElement("span", props, children as React.ReactNode),
    TouchableOpacity: ({
      children,
      onPress,
      ...props
    }: Record<string, unknown> & { onPress?: () => void }) =>
      ReactMod.createElement(
        "button",
        { ...props, onClick: onPress },
        children as React.ReactNode
      ),
    Image: (props: Record<string, unknown>) =>
      ReactMod.createElement("img", props),
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      absoluteFill: {},
    },
  }
})

vi.mock("expo-linear-gradient", async () => {
  const ReactMod = await import("react")
  return {
    LinearGradient: ({ children, ...props }: Record<string, unknown>) =>
      ReactMod.createElement("div", props, children as React.ReactNode),
  }
})

vi.mock("lucide-react-native", () => ({
  Landmark: () => null,
  CreditCard: () => null,
  Coins: () => null,
  Wallet: () => null,
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
vi.mock("../components/ui/typography", async () => {
  const ReactMod = await import("react")
  return {
    MonoAmount: ({ children }: { children?: React.ReactNode }) =>
      ReactMod.createElement("span", null, children),
  }
})

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockStorage.getItem,
    setItem: mockStorage.setItem,
  },
}))

const createProbeStyles = (t: SaturnMobileTheme) => ({
  box: {
    backgroundColor: t.colors.background,
    borderColor: t.colors.border,
  },
})

function ThemeProbe() {
  const { mode, resolvedMode, isDark, colors, setMode, getBudgetColors } =
    useTheme()
  const styles = useThemedStyles(createProbeStyles)
  const indigo = getBudgetColors("indigo")

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved-mode">{resolvedMode}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
      <span data-testid="bg">{colors.background}</span>
      <span data-testid="box-bg">{styles.box.backgroundColor}</span>
      <span data-testid="indigo-bg">{indigo.bg}</span>
      <button onClick={() => setMode("light")}>set-light</button>
      <button onClick={() => setMode("dark")}>set-dark</button>
      <button onClick={() => setMode("system")}>set-system</button>
    </div>
  )
}

describe("Mobile Theme Tokens & Reactivity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockColorSchemeState.scheme = "dark"
    mockStorage.getItem.mockResolvedValue(null)
  })

  describe("getNativeBudgetColors", () => {
    it("returns distinct light and dark categorical palettes for every hue", () => {
      for (const hue of CATEGORICAL_PALETTE) {
        const lightScale = getNativeBudgetColors(hue.value, "light")
        const darkScale = getNativeBudgetColors(hue.value, "dark")

        expect(lightScale.bg).toBeTruthy()
        expect(darkScale.bg).toBeTruthy()
        expect(lightScale.bg).not.toBe(darkScale.bg)
        expect(lightScale.text).not.toBe(darkScale.text)
        expect(lightScale.border).not.toBe(darkScale.border)
        expect(lightScale.bar).toBeTruthy()
        expect(darkScale.bar).toBeTruthy()
      }
    })

    it("falls back gracefully for unknown color names", () => {
      const lightFallback = getNativeBudgetColors("nonexistent-hue", "light")
      const darkFallback = getNativeBudgetColors("nonexistent-hue", "dark")

      expect(lightFallback.bg).not.toBe(darkFallback.bg)
      expect(lightFallback.bar).toBeTruthy()
      expect(darkFallback.bar).toBeTruthy()
    })
  })

  describe("lightColors vs darkColors & lightShadows vs darkShadows", () => {
    it("has distinct surface, background, text, and primaryForeground tokens", () => {
      expect(lightColors.background).not.toBe(darkColors.background)
      expect(lightColors.surface).not.toBe(darkColors.surface)
      expect(lightColors.surfaceElevated).toBe("#ffffff")
      expect(lightColors.surfaceElevated).not.toBe(lightColors.background)
      expect(lightColors.surfaceElevated).not.toBe(darkColors.surfaceElevated)
      expect(lightColors.textPrimary).not.toBe(darkColors.textPrimary)
      expect(lightColors.textMuted).not.toBe(darkColors.textMuted)
      expect(lightColors.border).not.toBe(darkColors.border)

      expect(lightColors.primaryForeground).toBeTruthy()
      expect(darkColors.primaryForeground).toBeTruthy()
      expect(lightColors.primaryForeground).not.toBe(lightColors.primary)
      expect(darkColors.primaryForeground).not.toBe(darkColors.primary)
    })

    it("has softer shadows in light mode than dark mode", () => {
      expect(lightShadows.sm.shadowOpacity).toBeLessThan(
        darkShadows.sm.shadowOpacity as number
      )
      expect(lightShadows.md.shadowOpacity).toBeLessThan(
        darkShadows.md.shadowOpacity as number
      )
      expect(lightShadows.lg.shadowOpacity).toBeLessThan(
        darkShadows.lg.shadowOpacity as number
      )
      expect(lightShadows.md.shadowColor).not.toBe(darkShadows.md.shadowColor)
    })
  })

  describe("getCashflowColor", () => {
    it("maps positive, negative, and zero amounts for lightColors", () => {
      expect(getCashflowColor(1250, lightColors)).toBe(lightColors.success)
      expect(getCashflowColor(-450, lightColors)).toBe(lightColors.destructive)
      expect(getCashflowColor(0, lightColors)).toBe(lightColors.textMuted)
    })

    it("maps positive, negative, and zero amounts for darkColors", () => {
      expect(getCashflowColor(1250, darkColors)).toBe(darkColors.success)
      expect(getCashflowColor(-450, darkColors)).toBe(darkColors.destructive)
      expect(getCashflowColor(0, darkColors)).toBe(darkColors.textMuted)
    })
  })

  describe("MobileThemeProvider, useTheme & useThemedStyles", () => {
    it("switches modes reactively, updates styles, and persists to AsyncStorage", async () => {
      mockColorSchemeState.scheme = "light"

      const { getByTestId, getByText } = render(
        <MobileThemeProvider defaultMode="system">
          <ThemeProbe />
        </MobileThemeProvider>
      )

      await waitFor(() => {
        expect(getByTestId("mode").textContent).toBe("system")
      })

      expect(getByTestId("resolved-mode").textContent).toBe("light")
      expect(getByTestId("is-dark").textContent).toBe("false")
      expect(getByTestId("bg").textContent).toBe(lightColors.background)
      expect(getByTestId("box-bg").textContent).toBe(lightColors.background)
      expect(getByTestId("indigo-bg").textContent).toBe(
        getNativeBudgetColors("indigo", "light").bg
      )

      fireEvent.click(getByText("set-dark"))

      expect(getByTestId("mode").textContent).toBe("dark")
      expect(getByTestId("resolved-mode").textContent).toBe("dark")
      expect(getByTestId("is-dark").textContent).toBe("true")
      expect(getByTestId("bg").textContent).toBe(darkColors.background)
      expect(getByTestId("box-bg").textContent).toBe(darkColors.background)
      expect(getByTestId("indigo-bg").textContent).toBe(
        getNativeBudgetColors("indigo", "dark").bg
      )
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        THEME_MODE_STORAGE_KEY,
        "dark"
      )
      expect(mockColorSchemeState.setColorScheme).toHaveBeenCalledWith("dark")

      fireEvent.click(getByText("set-light"))
      expect(getByTestId("resolved-mode").textContent).toBe("light")
      expect(mockColorSchemeState.setColorScheme).toHaveBeenCalledWith("light")

      fireEvent.click(getByText("set-system"))
      expect(getByTestId("mode").textContent).toBe("system")
      expect(mockColorSchemeState.setColorScheme).toHaveBeenCalledWith(
        "unspecified"
      )
    })
  })

  describe("Card surface standardization & 12-hue CardAccountItem (DF-22)", () => {
    it("renders Card with radius.lg (14), surface fill, and light-mode shadows", () => {
      mockColorSchemeState.scheme = "light"

      const { getByTestId } = render(
        <MobileThemeProvider defaultMode="light">
          <Card testID="default-card">Default</Card>
          <Card testID="elevated-card" elevated>
            Elevated
          </Card>
        </MobileThemeProvider>
      )

      const defaultCard = getByTestId("default-card")
      const elevatedCard = getByTestId("elevated-card")
      const defaultStyle = JSON.parse(
        defaultCard.getAttribute("data-style") || "{}"
      )
      const elevatedStyle = JSON.parse(
        elevatedCard.getAttribute("data-style") || "{}"
      )

      expect(defaultStyle.borderRadius).toBe(14)
      expect(defaultStyle.backgroundColor).toBe(lightColors.surface)
      expect(defaultStyle.borderColor).toBe(lightColors.border)
      expect(defaultStyle.shadowOpacity).toBe(lightShadows.sm.shadowOpacity)

      expect(elevatedStyle.borderRadius).toBe(14)
      expect(elevatedStyle.backgroundColor).toBe(lightColors.surfaceElevated)
      expect(elevatedStyle.shadowOpacity).toBe(lightShadows.md.shadowOpacity)
    })

    it("resolves distinct themes for all 12 CATEGORICAL_HUES plus rose alias", () => {
      const indigoTheme = getCardTheme("indigo")
      for (const hue of CATEGORICAL_HUES) {
        const cardTheme = getCardTheme(hue)
        expect(cardTheme.accentLight).toBe(CATEGORICAL_HEX_MAP[hue])
        expect(cardTheme.accentDark).toMatch(/^#[0-9a-f]{6}$/i)
        expect(cardTheme.textColor).toMatch(/^#[0-9a-f]{6}$/i)
        if (hue !== "indigo") {
          expect(cardTheme.accentLight).not.toBe(indigoTheme.accentLight)
        }
      }

      expect(getCardTheme("rose")).toEqual(getCardTheme("coral"))
      expect(getCardTheme("TEAL")).toEqual(getCardTheme("teal"))
      expect(getCardTheme("unknown")).toEqual(indigoTheme)
    })
  })
})
