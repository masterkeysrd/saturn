import React from "react"
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
  type StyleProp,
  type TextStyle,
} from "react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export type ButtonVariant =
  "primary" | "secondary" | "destructive" | "ghost" | "outline"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends Omit<TouchableOpacityProps, "onPress"> {
  onPress?:
    | TouchableOpacityProps["onPress"]
    | ((e?: React.BaseSyntheticEvent) => unknown)
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  haptic?: "light" | "medium" | "heavy" | "none"
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  textStyle?: StyleProp<TextStyle>
  children?: React.ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  haptic = "light",
  leftIcon,
  rightIcon,
  fullWidth = false,
  style,
  textStyle,
  children,
  onPress,
  ...props
}: ButtonProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const handlePress: NonNullable<TouchableOpacityProps["onPress"]> = (e) => {
    if (disabled || loading) return
    if (haptic === "light") haptics.light()
    else if (haptic === "medium") haptics.medium()
    else if (haptic === "heavy") haptics.heavy()
    ;(onPress as ((event?: typeof e) => unknown) | undefined)?.(e)
  }

  const containerStyles = [
    styles.base,
    styles[size],
    styles[variant],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ]

  const textStyles = [
    styles.textBase,
    styles[`${size}Text`],
    styles[`${variant}Text`],
    disabled && styles.disabledText,
    textStyle,
  ]

  const spinnerColor =
    variant === "primary"
      ? colors.primaryForeground
      : variant === "destructive"
        ? colors.destructive
        : colors.textPrimary

  const isTextChild =
    typeof children === "string" ||
    typeof children === "number" ||
    (Array.isArray(children) &&
      children.every(
        (child) =>
          typeof child === "string" ||
          typeof child === "number" ||
          child === null ||
          child === undefined ||
          typeof child === "boolean"
      ))

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={handlePress}
      style={containerStyles}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {leftIcon && <>{leftIcon}</>}
          {isTextChild ? <Text style={textStyles}>{children}</Text> : children}
          {rightIcon && <>{rightIcon}</>}
        </>
      )}
    </TouchableOpacity>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  base: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.md,
    gap: 8,
  },
  fullWidth: {
    width: "100%" as const,
  },
  // Sizes
  sm: {
    height: 36,
    paddingHorizontal: 12,
  },
  md: {
    height: 46,
    paddingHorizontal: 18,
  },
  lg: {
    height: 52,
    paddingHorizontal: 22,
  },
  // Variants
  primary: {
    backgroundColor: t.colors.primary,
  },
  secondary: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  destructive: {
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: `${t.colors.destructive}4D`,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
  },
  disabled: {
    opacity: 0.5,
  },
  // Text sizes
  textBase: {
    fontWeight: "600" as const,
  },
  smText: {
    fontSize: 13,
  },
  mdText: {
    fontSize: 15,
  },
  lgText: {
    fontSize: 16,
  },
  // Text colors
  primaryText: {
    color: t.colors.primaryForeground,
  },
  secondaryText: {
    color: t.colors.textPrimary,
  },
  destructiveText: {
    color: t.colors.destructive,
  },
  ghostText: {
    color: t.colors.textMuted,
  },
  outlineText: {
    color: t.colors.textPrimary,
  },
  disabledText: {
    color: t.colors.textMuted,
  },
})
