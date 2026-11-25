import React from "react"
import {
  View,
  Text,
  TouchableOpacity,
  type ViewProps,
  type StyleProp,
  type TextStyle,
} from "react-native"
import { useThemedStyles, type SaturnMobileTheme } from "../../lib/theme"
import { haptics } from "../../lib/haptics"

export interface CardProps extends ViewProps {
  elevated?: boolean
  onPress?: () => void
  children?: React.ReactNode
}

export function Card({
  elevated = false,
  onPress,
  style,
  children,
  ...props
}: CardProps) {
  const styles = useThemedStyles(createStyles)

  const containerStyles = [
    styles.card,
    elevated ? styles.cardElevated : styles.cardDefault,
    style,
  ]

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => {
          haptics.light()
          onPress()
        }}
        style={containerStyles}
        {...(props as any)}
      >
        {children}
      </TouchableOpacity>
    )
  }

  return (
    <View style={containerStyles} {...props}>
      {children}
    </View>
  )
}

export function CardHeader({
  style,
  children,
  ...props
}: ViewProps & { children?: React.ReactNode }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={[styles.header, style]} {...props}>
      {children}
    </View>
  )
}

export function CardTitle({
  style,
  children,
}: {
  style?: StyleProp<TextStyle>
  children?: React.ReactNode
}) {
  const styles = useThemedStyles(createStyles)
  return <Text style={[styles.title, style]}>{children}</Text>
}

export function CardDescription({
  style,
  children,
}: {
  style?: StyleProp<TextStyle>
  children?: React.ReactNode
}) {
  const styles = useThemedStyles(createStyles)
  return <Text style={[styles.description, style]}>{children}</Text>
}

export function CardContent({
  style,
  children,
  ...props
}: ViewProps & { children?: React.ReactNode }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={[styles.content, style]} {...props}>
      {children}
    </View>
  )
}

export function CardFooter({
  style,
  children,
  ...props
}: ViewProps & { children?: React.ReactNode }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={[styles.footer, style]} {...props}>
      {children}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    borderRadius: t.radius.lg,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  cardDefault: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    ...(!t.isDark ? t.shadows.sm : {}),
  },
  cardElevated: {
    backgroundColor: t.colors.surfaceElevated,
    borderColor: t.colors.borderStrong,
    ...(t.isDark ? t.shadows.sm : t.shadows.md),
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  description: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
})
