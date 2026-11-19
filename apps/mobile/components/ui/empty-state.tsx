import React from "react"
import { View, Text, type StyleProp, type ViewStyle } from "react-native"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Button } from "./button"

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  style?: StyleProp<ViewStyle>
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const styles = useThemedStyles(createStyles)

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionLabel && onAction && (
        <Button
          variant="secondary"
          size="md"
          onPress={onAction}
          style={styles.actionBtn}
        >
          {actionLabel}
        </Button>
      )}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    textAlign: "center" as const,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 280,
  },
  actionBtn: {
    marginTop: 8,
  },
})
