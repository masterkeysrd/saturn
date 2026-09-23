import React from "react"
import {
  View,
  Text,
  StyleSheet,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import { theme } from "@/lib/theme"

export type BadgeVariant =
  "default" | "primary" | "success" | "destructive" | "warning" | "outline"

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant
  size?: "sm" | "md"
  label?: string
  bg?: string
  border?: string
  color?: string
  icon?: React.ReactNode
  children?: React.ReactNode
  textStyle?: StyleProp<TextStyle>
}

export function Badge({
  variant = "default",
  size = "md",
  label,
  bg,
  border,
  color,
  icon,
  children,
  style,
  textStyle,
  ...props
}: BadgeProps) {
  const customStyles: StyleProp<ViewStyle> = {}
  if (bg) customStyles.backgroundColor = bg
  if (border) {
    customStyles.borderColor = border
    customStyles.borderWidth = 1
  }

  return (
    <View
      style={[styles.base, styles[size], styles[variant], customStyles, style]}
      {...props}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text
        style={[
          styles.text,
          styles[`${size}Text`],
          styles[`${variant}Text`],
          color ? { color } : undefined,
          textStyle,
        ]}
      >
        {label || children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  iconContainer: {
    marginRight: 4,
  },
  text: {
    fontWeight: "600",
  },
  // Sizes
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  md: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  smText: {
    fontSize: 11,
  },
  mdText: {
    fontSize: 12,
  },
  // Variants
  default: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.border,
  },
  defaultText: {
    color: theme.colors.textSecondary,
  },
  primary: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  primaryText: {
    color: theme.colors.primary,
  },
  success: {
    backgroundColor: theme.colors.successSubtle,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  successText: {
    color: theme.colors.success,
  },
  destructive: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  destructiveText: {
    color: theme.colors.destructive,
  },
  warning: {
    backgroundColor: theme.colors.warningSubtle,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  warningText: {
    color: theme.colors.warning,
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
  },
  outlineText: {
    color: theme.colors.textMuted,
  },
})
