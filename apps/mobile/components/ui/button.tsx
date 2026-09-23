import React from "react"
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type TouchableOpacityProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export type ButtonVariant =
  "primary" | "secondary" | "destructive" | "ghost" | "outline"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends TouchableOpacityProps {
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
  const handlePress = (e: any) => {
    if (disabled || loading) return
    if (haptic === "light") haptics.light()
    else if (haptic === "medium") haptics.medium()
    else if (haptic === "heavy") haptics.heavy()
    onPress?.(e)
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
      ? theme.colors.primaryForeground
      : theme.colors.textPrimary

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
          {typeof children === "string" ? (
            <Text style={textStyles}>{children}</Text>
          ) : (
            children
          )}
          {rightIcon && <>{rightIcon}</>}
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    gap: 8,
  },
  fullWidth: {
    width: "100%",
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
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  destructive: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  disabled: {
    opacity: 0.5,
  },
  // Text sizes
  textBase: {
    fontWeight: "600",
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
    color: theme.colors.primaryForeground,
  },
  secondaryText: {
    color: theme.colors.textPrimary,
  },
  destructiveText: {
    color: theme.colors.destructive,
  },
  ghostText: {
    color: theme.colors.textMuted,
  },
  outlineText: {
    color: theme.colors.textPrimary,
  },
  disabledText: {
    color: theme.colors.textMuted,
  },
})
