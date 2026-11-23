import React, { useRef, useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  type StyleProp,
  type ViewStyle,
  Animated,
  useAnimatedValue,
} from "react-native"
import * as Clipboard from "expo-clipboard"
import { ClipboardPaste } from "lucide-react-native"
import { useI18n } from "@saturn/hooks"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"

export function normalizeOtpInput(
  raw: string,
  length: number,
  currentValue = ""
): string {
  const digits = raw.replace(/[^0-9]/g, "")
  if (digits.length <= length) {
    return digits
  }
  if (currentValue && digits.startsWith(currentValue)) {
    const remainder = digits.slice(currentValue.length)
    if (remainder.length >= length) {
      return remainder.slice(0, length)
    }
  }
  return digits.slice(0, length)
}

export interface OTPInputProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  onComplete?: (code: string) => void
  length?: number
  autoFocus?: boolean
  error?: string | boolean
  disabled?: boolean
  label?: string
  containerStyle?: StyleProp<ViewStyle>
}

interface OTPSlotsProps {
  value: string
  onChangeText: (value: string) => void
  onComplete?: (code: string) => void
  length: number
  autoFocus: boolean
  error?: string | boolean
  disabled: boolean
  label?: string
  containerStyle?: StyleProp<ViewStyle>
}

export type OTPTextInputRef = React.ComponentRef<typeof RNTextInput>

const OTPSlots = React.forwardRef<OTPTextInputRef, OTPSlotsProps>(
  function OTPSlots(
    {
      value,
      onChangeText,
      onComplete,
      length,
      autoFocus,
      error,
      disabled,
      label,
      containerStyle,
    },
    ref
  ) {
    const { colors, isDark } = useTheme()
    const styles = useThemedStyles(createStyles)
    const { t } = useI18n()
    const internalRef = useRef<OTPTextInputRef>(null)
    const pasteHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isFocusedRef = useRef(false)
    const keyboardVisibleRef = useRef(false)
    const [isFocused, setIsFocused] = useState(false)
    const [pasteHint, setPasteHint] = useState<string | null>(null)
    const blinkAnim = useAnimatedValue(1)

    const setInputRef = (instance: OTPTextInputRef | null) => {
      internalRef.current = instance
      if (typeof ref === "function") {
        ref(instance)
      } else if (ref) {
        ref.current = instance
      }
    }

    useEffect(() => {
      return () => {
        if (pasteHintTimerRef.current) {
          clearTimeout(pasteHintTimerRef.current)
        }
      }
    }, [])

    useEffect(() => {
      if (Platform.OS !== "android") return
      const showSub = Keyboard.addListener("keyboardDidShow", () => {
        keyboardVisibleRef.current = true
      })
      const hideSub = Keyboard.addListener("keyboardDidHide", () => {
        keyboardVisibleRef.current = false
        if (isFocusedRef.current) {
          internalRef.current?.blur()
        }
      })
      return () => {
        showSub.remove()
        hideSub.remove()
      }
    }, [])

    // Delayed focus for Android & Modal transitions
    useEffect(() => {
      if (autoFocus && !disabled) {
        const timer = setTimeout(() => {
          internalRef.current?.focus()
        }, 150)
        return () => clearTimeout(timer)
      }
    }, [autoFocus, disabled])

    // Blinking cursor effect for current active slot
    useEffect(() => {
      if (isFocused) {
        const animation = Animated.loop(
          Animated.sequence([
            Animated.timing(blinkAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(blinkAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        )
        animation.start()
        return () => animation.stop()
      } else {
        blinkAnim.setValue(1)
      }
    }, [isFocused, blinkAnim])

    const applyOtpCode = (clean: string) => {
      setPasteHint(null)
      onChangeText(clean)

      if (clean.length === length) {
        haptics.success()
        onComplete?.(clean)
      }
    }

    const handleChangeText = (text: string) => {
      const clean = normalizeOtpInput(text, length, value || "")
      applyOtpCode(clean)
    }

    const handlePasteFromClipboard = async () => {
      if (disabled) return
      try {
        const raw = await Clipboard.getStringAsync()
        const clean = normalizeOtpInput(raw || "", length)
        if (!clean) {
          haptics.warning()
          setPasteHint(t("auth.mobile.pasteEmpty"))
          if (pasteHintTimerRef.current) {
            clearTimeout(pasteHintTimerRef.current)
          }
          pasteHintTimerRef.current = setTimeout(() => {
            setPasteHint(null)
          }, 2500)
          return
        }
        applyOtpCode(clean)
        if (clean.length < length) {
          haptics.light()
          internalRef.current?.focus()
        }
      } catch {
        haptics.warning()
        internalRef.current?.focus()
      }
    }

    const half = Math.floor(length / 2)
    const digits = (value || "").split("")

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}

        <View style={styles.inputWrapper}>
          {/* Visual Segmented 6-Box Display */}
          <View style={styles.slotsRow} pointerEvents="none">
            {/* First Half */}
            <View style={styles.slotGroup}>
              {Array.from({ length: half }, (_, i) => {
                const digit = digits[i] || ""
                const isCurrent =
                  isFocused &&
                  (i === digits.length ||
                    (i === length - 1 && digits.length === length))
                const isFilled = Boolean(digit)

                return (
                  <View
                    key={i}
                    style={[
                      styles.slot,
                      isFilled && styles.slotFilled,
                      isCurrent && styles.slotActive,
                      Boolean(error) && styles.slotError,
                      disabled && styles.slotDisabled,
                    ]}
                  >
                    {digit ? (
                      <Text style={styles.digitText}>{digit}</Text>
                    ) : isCurrent ? (
                      <Animated.View
                        style={[styles.cursor, { opacity: blinkAnim }]}
                      />
                    ) : null}
                  </View>
                )
              })}
            </View>

            {/* Center Separator Dash */}
            <View style={styles.separatorContainer}>
              <View
                style={[
                  styles.separatorDash,
                  Boolean(error) && styles.separatorDashError,
                ]}
              />
            </View>

            {/* Second Half */}
            <View style={styles.slotGroup}>
              {Array.from({ length: length - half }, (_, i) => {
                const idx = half + i
                const digit = digits[idx] || ""
                const isCurrent =
                  isFocused &&
                  (idx === digits.length ||
                    (idx === length - 1 && digits.length === length))
                const isFilled = Boolean(digit)

                return (
                  <View
                    key={idx}
                    style={[
                      styles.slot,
                      isFilled && styles.slotFilled,
                      isCurrent && styles.slotActive,
                      Boolean(error) && styles.slotError,
                      disabled && styles.slotDisabled,
                    ]}
                  >
                    {digit ? (
                      <Text style={styles.digitText}>{digit}</Text>
                    ) : isCurrent ? (
                      <Animated.View
                        style={[styles.cursor, { opacity: blinkAnim }]}
                      />
                    ) : null}
                  </View>
                )
              })}
            </View>
          </View>

          <RNTextInput
            ref={setInputRef}
            value={value}
            onChangeText={handleChangeText}
            keyboardType="number-pad"
            keyboardAppearance={isDark ? "dark" : "light"}
            textContentType="oneTimeCode"
            autoComplete={
              Platform.OS === "android" ? "2fa-app-otp" : "one-time-code"
            }
            importantForAutofill="yes"
            autoCorrect={false}
            autoFocus={autoFocus}
            editable={!disabled}
            onFocus={() => {
              isFocusedRef.current = true
              setIsFocused(true)
            }}
            onBlur={() => {
              isFocusedRef.current = false
              setIsFocused(false)
            }}
            onPress={() => {
              if (
                Platform.OS === "android" &&
                !disabled &&
                isFocusedRef.current &&
                !keyboardVisibleRef.current
              ) {
                internalRef.current?.blur()
                requestAnimationFrame(() => {
                  internalRef.current?.focus()
                })
              }
            }}
            cursorColor="transparent"
            selectionColor="transparent"
            underlineColorAndroid="transparent"
            style={styles.hiddenInput}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePasteFromClipboard}
          disabled={disabled}
          style={[styles.pasteButton, disabled && styles.pasteButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("auth.mobile.pasteCodeAria")}
        >
          <ClipboardPaste size={14} color={colors.primary} />
          <Text style={styles.pasteButtonText}>{t("auth.mobile.pasteCode")}</Text>
        </TouchableOpacity>

        {pasteHint && <Text style={styles.pasteHintText}>{pasteHint}</Text>}

        {typeof error === "string" && error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>
    )
  }
)

export const OTPInput = React.forwardRef(function OTPInput<
  TFieldValues extends FieldValues = FieldValues,
>(
  {
    control,
    name,
    onComplete,
    length = 6,
    autoFocus = false,
    error,
    disabled = false,
    label,
    containerStyle,
  }: OTPInputProps<TFieldValues>,
  ref: React.ForwardedRef<OTPTextInputRef>
) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <OTPSlots
          ref={(instance) => {
            field.ref(instance)
            if (typeof ref === "function") {
              ref(instance)
            } else if (ref) {
              ref.current = instance
            }
          }}
          value={
            field.value !== undefined && field.value !== null
              ? String(field.value)
              : ""
          }
          onChangeText={field.onChange}
          onComplete={onComplete}
          length={length}
          autoFocus={autoFocus}
          disabled={disabled}
          label={label}
          containerStyle={containerStyle}
          error={
            typeof error === "string"
              ? error
              : fieldState.error?.message || error
          }
        />
      )}
    />
  )
}) as <TFieldValues extends FieldValues = FieldValues>(
  props: OTPInputProps<TFieldValues> & { ref?: React.Ref<OTPTextInputRef> }
) => React.ReactElement

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    width: "100%" as const,
    alignItems: "center" as const,
  },
  label: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.sm,
    alignSelf: "center" as const,
  },
  inputWrapper: {
    position: "relative" as const,
    width: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  hiddenInput: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    opacity: 0.01,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 22,
  },
  pasteButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: t.spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
  },
  pasteButtonDisabled: {
    opacity: 0.5,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  pasteHintText: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: t.spacing.xs,
    textAlign: "center" as const,
  },
  slotsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  slotGroup: {
    flexDirection: "row" as const,
    gap: 8,
  },
  slot: {
    width: 44,
    height: 54,
    borderRadius: t.radius.md,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  slotFilled: {
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surfaceHighlight,
  },
  slotActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.surfaceHighlight,
    shadowColor: t.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  slotError: {
    borderColor: t.colors.destructive,
  },
  slotDisabled: {
    opacity: 0.5,
  },
  digitText: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    fontVariant: ["tabular-nums"] as "tabular-nums"[],
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: t.colors.primary,
    borderRadius: 1,
  },
  separatorContainer: {
    paddingHorizontal: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  separatorDash: {
    width: 8,
    height: 2,
    backgroundColor: t.colors.textMuted,
    borderRadius: 1,
    opacity: 0.6,
  },
  separatorDashError: {
    backgroundColor: t.colors.destructive,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    marginTop: t.spacing.xs,
    textAlign: "center" as const,
  },
})
