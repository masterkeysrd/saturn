import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import { useForm } from "react-hook-form"
import * as Clipboard from "expo-clipboard"
import { OTPInput, normalizeOtpInput } from "../components/ui/otp-input"
import { haptics } from "../lib/haptics"

const keyboardListeners = vi.hoisted(() => new Map<string, Set<() => void>>())

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: any): Record<string, unknown> | undefined => {
    if (!s) return undefined
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s.flat(Infinity).filter(Boolean).map(flattenStyle)
      )
    }
    return typeof s === "object" ? s : undefined
  }
  return {
    Platform: {
      OS: "android",
      select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
    },
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    Keyboard: {
      addListener: vi.fn((event: string, cb: () => void) => {
        if (!keyboardListeners.has(event)) {
          keyboardListeners.set(event, new Set())
        }
        keyboardListeners.get(event)!.add(cb)
        return {
          remove: () => {
            keyboardListeners.get(event)?.delete(cb)
          },
        }
      }),
    },
    View: ({ children, style, pointerEvents: _pe, ...props }: any) =>
      ReactMod.createElement(
        "div",
        { ...props, style: flattenStyle(style) },
        children
      ),
    Text: ({ children, style, ...props }: any) =>
      ReactMod.createElement(
        "span",
        { ...props, style: flattenStyle(style) },
        children
      ),
    TouchableOpacity: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityRole: _ar,
      activeOpacity: _ao,
      style,
      ...props
    }: any) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          onClick: disabled ? undefined : onPress,
          disabled,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
          ...props,
        },
        children
      ),
    TextInput: ReactMod.forwardRef(function MockTextInput(
      {
        onChangeText,
        value,
        autoComplete,
        maxLength,
        caretHidden,
        editable,
        keyboardType: _kt,
        textContentType: _tct,
        importantForAutofill: _ifa,
        autoCorrect: _ac,
        autoFocus: _af,
        keyboardAppearance: _ka,
        placeholderTextColor: _ptc,
        cursorColor: _cc,
        selectionColor: _sc,
        underlineColorAndroid: _uca,
        onPress: _onPress,
        style,
        ...rest
      }: any,
      ref: any
    ) {
      return ReactMod.createElement("input", {
        ref,
        value: value ?? "",
        readOnly: editable === false,
        style: flattenStyle(style),
        "data-autocomplete": autoComplete,
        "data-maxlength": maxLength === undefined ? "none" : String(maxLength),
        "data-carethidden":
          caretHidden === undefined ? "false" : String(caretHidden),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChangeText?.(e.target.value),
        ...rest,
      })
    }),
    Animated: {
      View: ({ children, style, ...props }: any) =>
        ReactMod.createElement(
          "div",
          { ...props, style: flattenStyle(style) },
          children
        ),
      loop: () => ({ start: vi.fn(), stop: vi.fn() }),
      sequence: vi.fn(),
      timing: vi.fn(),
    },
    useAnimatedValue: () => ({ setValue: vi.fn() }),
  }
})

vi.mock("expo-clipboard", () => ({
  getStringAsync: vi.fn(async () => ""),
}))

vi.mock("lucide-react-native", () => ({
  ClipboardPaste: () => null,
}))

vi.mock("../lib/theme", () => {
  const mockTheme = {
    mode: "dark" as const,
    resolvedMode: "dark" as const,
    setMode: vi.fn(),
    isDark: true,
    colors: {
      textSecondary: "#cbd5e1",
      border: "#334155",
      surfaceElevated: "#161e2e",
      borderStrong: "#475569",
      surfaceHighlight: "#1e293b",
      primary: "#38bdf8",
      primaryForeground: "#090d16",
      destructive: "#f43f5e",
      textPrimary: "#f8fafc",
      textMuted: "#94a3b8",
      primarySubtle: "rgba(56, 189, 248, 0.12)",
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 },
    radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
    shadows: { sm: {}, md: {}, lg: {} },
    budgetColors: {},
    getBudgetColors: () => ({}),
    typography: { mono: "monospace" },
  }
  return {
    theme: mockTheme,
    useTheme: () => mockTheme,
    useThemedStyles: (factory: (t: typeof mockTheme) => unknown) =>
      factory(mockTheme),
  }
})

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

function TestOTPForm({ onComplete }: { onComplete?: (code: string) => void }) {
  const { control } = useForm<{ code: string }>({
    defaultValues: { code: "" },
  })
  return <OTPInput control={control} name="code" onComplete={onComplete} />
}

describe("normalizeOtpInput", () => {
  it("strips spaces, dashes, and non-numeric characters from authenticator codes", () => {
    expect(normalizeOtpInput("123 456", 6)).toBe("123456")
    expect(normalizeOtpInput("123-456", 6)).toBe("123456")
    expect(normalizeOtpInput("Code: 98 76 54!", 6)).toBe("987654")
  })

  it("extracts pasted code when replacing or appending to existing partial digits", () => {
    expect(normalizeOtpInput("12654321", 6, "12")).toBe("654321")
  })
})

describe("OTPInput component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keyboardListeners.clear()
  })

  it("configures Android input without caretHidden or maxLength and uses 2fa-app-otp", () => {
    const { container } = render(<TestOTPForm />)
    const input = container.querySelector("input") as HTMLInputElement

    expect(input).toBeTruthy()
    expect(input.getAttribute("data-autocomplete")).toBe("2fa-app-otp")
    expect(input.getAttribute("data-maxlength")).toBe("none")
    expect(input.getAttribute("data-carethidden")).toBe("false")
  })

  it("accepts pasted formatted TOTP code via onChangeText and triggers onComplete", () => {
    const onComplete = vi.fn()
    const { container } = render(<TestOTPForm onComplete={onComplete} />)
    const input = container.querySelector("input") as HTMLInputElement

    fireEvent.change(input, { target: { value: "482 910" } })

    expect(input.value).toBe("482910")
    expect(haptics.success).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith("482910")
  })

  it("pastes formatted authenticator code when clicking the Paste code button", async () => {
    vi.mocked(Clipboard.getStringAsync).mockResolvedValueOnce("739 204")
    const onComplete = vi.fn()
    const { getByRole, container } = render(
      <TestOTPForm onComplete={onComplete} />
    )

    fireEvent.click(getByRole("button", { name: "Paste verification code" }))

    await waitFor(() => {
      const input = container.querySelector("input") as HTMLInputElement
      expect(input.value).toBe("739204")
      expect(onComplete).toHaveBeenCalledWith("739204")
    })
  })

  it("shows feedback when clipboard does not contain digits", async () => {
    vi.mocked(Clipboard.getStringAsync).mockResolvedValueOnce("hello world")
    const onComplete = vi.fn()
    const { getByRole, findByText } = render(
      <TestOTPForm onComplete={onComplete} />
    )

    fireEvent.click(getByRole("button", { name: "Paste verification code" }))

    expect(
      await findByText("No verification code found in clipboard")
    ).toBeTruthy()
    expect(haptics.warning).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("blurs the Android input when keyboardDidHide fires while focused so tapping again reopens the keyboard", () => {
    const { container } = render(<TestOTPForm />)
    const input = container.querySelector("input") as HTMLInputElement
    const blurSpy = vi.spyOn(input, "blur")

    fireEvent.focus(input)
    keyboardListeners.get("keyboardDidShow")?.forEach((cb) => cb())
    keyboardListeners.get("keyboardDidHide")?.forEach((cb) => cb())

    expect(blurSpy).toHaveBeenCalledTimes(1)
  })
})
