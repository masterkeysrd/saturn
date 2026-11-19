import React from "react"
import {
  View,
  Text,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

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
  const styles = useThemedStyles(createStyles)

  const customStyles: ViewStyle = {
    ...(bg ? { backgroundColor: bg } : undefined),
    ...(border ? { borderColor: border, borderWidth: 1 } : undefined),
  }

  return (
    <View
      style={[styles.base, styles[size], styles[variant], customStyles, style]}
      {...props}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text
        numberOfLines={1}
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

const createStyles = (t: SaturnMobileTheme) => ({
  base: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    maxWidth: "100%" as const,
    flexShrink: 1,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  iconContainer: {
    marginRight: 4,
    flexShrink: 0,
  },
  text: {
    fontWeight: "600" as const,
    flexShrink: 1,
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
    lineHeight: 14,
  },
  mdText: {
    fontSize: 12,
    lineHeight: 16,
  },
  // Variants
  default: {
    backgroundColor: t.colors.surfaceElevated,
    borderColor: t.colors.border,
  },
  defaultText: {
    color: t.colors.textSecondary,
  },
  primary: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: `${t.colors.primary}4D`,
  },
  primaryText: {
    color: t.colors.primary,
  },
  success: {
    backgroundColor: t.colors.successSubtle,
    borderColor: `${t.colors.success}4D`,
  },
  successText: {
    color: t.colors.success,
  },
  destructive: {
    backgroundColor: t.colors.destructiveSubtle,
    borderColor: `${t.colors.destructive}4D`,
  },
  destructiveText: {
    color: t.colors.destructive,
  },
  warning: {
    backgroundColor: t.colors.warningSubtle,
    borderColor: `${t.colors.warning}4D`,
  },
  warningText: {
    color: t.colors.warning,
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: t.colors.border,
  },
  outlineText: {
    color: t.colors.textMuted,
  },
})
