import React, { useRef, useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  Animated,
} from "react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface OTPInputProps {
  value: string
  onChangeText: (value: string) => void
  onComplete?: (code: string) => void
  length?: number
  autoFocus?: boolean
  error?: string | boolean
  disabled?: boolean
  label?: string
  containerStyle?: StyleProp<ViewStyle>
}

export const OTPInput = React.forwardRef<RNTextInput, OTPInputProps>(
  function OTPInput(
    {
      value,
      onChangeText,
      onComplete,
      length = 6,
      autoFocus = false,
      error,
      disabled = false,
      label,
      containerStyle,
    }: OTPInputProps,
    ref
  ) {
    const internalRef = useRef<RNTextInput>(null)
    const inputRef = (ref as React.RefObject<RNTextInput>) || internalRef
    const [isFocused, setIsFocused] = useState(false)
    const blinkAnim = useRef(new Animated.Value(1)).current

    // Delayed focus for Android & Modal transitions
    useEffect(() => {
      if (autoFocus && !disabled) {
        const timer = setTimeout(() => {
          inputRef.current?.focus()
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

    const handlePress = () => {
      if (!disabled) {
        inputRef.current?.focus()
      }
    }

    const handleChangeText = (text: string) => {
      const clean = text.replace(/[^0-9]/g, "").slice(0, length)
      onChangeText(clean)

      if (clean.length === length) {
        haptics.success()
        onComplete?.(clean)
      }
    }

    const half = Math.floor(length / 2)
    const digits = value.split("")

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}

        <TouchableOpacity
          activeOpacity={1}
          onPress={handlePress}
          style={styles.inputWrapper}
          disabled={disabled}
        >
          {/* Hidden underlying text input capturing keyboard, paste, and autofill */}
          <RNTextInput
            ref={inputRef}
            value={value}
            onChangeText={handleChangeText}
            maxLength={length}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus={autoFocus}
            editable={!disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={styles.hiddenInput}
            caretHidden
          />

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
        </TouchableOpacity>

        {typeof error === "string" && error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>
    )
  }
)

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    alignSelf: "center",
  },
  inputWrapper: {
    position: "relative",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.01,
    color: "transparent",
    backgroundColor: "transparent",
  },
  slotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  slotGroup: {
    flexDirection: "row",
    gap: 8,
  },
  slot: {
    width: 44,
    height: 54,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  slotFilled: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  slotActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceHighlight,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  slotError: {
    borderColor: theme.colors.destructive,
  },
  slotDisabled: {
    opacity: 0.5,
  },
  digitText: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: theme.colors.primary,
    borderRadius: 1,
  },
  separatorContainer: {
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  separatorDash: {
    width: 8,
    height: 2,
    backgroundColor: theme.colors.textMuted,
    borderRadius: 1,
    opacity: 0.6,
  },
  separatorDashError: {
    backgroundColor: theme.colors.destructive,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: theme.spacing.xs,
    textAlign: "center",
  },
})
