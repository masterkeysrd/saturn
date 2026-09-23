import React from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

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
  const containerStyles = [
    styles.card,
    elevated ? styles.cardElevated : styles.cardDefault,
    elevated && theme.shadows.sm,
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
  return <Text style={[styles.title, style]}>{children}</Text>
}

export function CardDescription({
  style,
  children,
}: {
  style?: StyleProp<TextStyle>
  children?: React.ReactNode
}) {
  return <Text style={[styles.description, style]}>{children}</Text>
}

export function CardContent({
  style,
  children,
  ...props
}: ViewProps & { children?: React.ReactNode }) {
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
  return (
    <View style={[styles.footer, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardDefault: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  cardElevated: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.borderStrong,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  description: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
})
