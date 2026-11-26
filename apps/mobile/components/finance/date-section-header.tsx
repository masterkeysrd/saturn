import React from "react"
import { Text, View, type ViewStyle } from "react-native"
import { useThemedStyles, type SaturnMobileTheme } from "../../lib/theme"

export interface DateSectionHeaderProps {
  title: string
  rightContent?: React.ReactNode
  insetHorizontal?: boolean
  style?: ViewStyle
}

export function DateSectionHeader({
  title,
  rightContent,
  insetHorizontal = true,
  style,
}: DateSectionHeaderProps) {
  const styles = useThemedStyles(createStyles)

  return (
    <View
      style={[
        styles.sectionHeader,
        insetHorizontal && styles.insetHorizontal,
        style,
      ]}
    >
      <Text style={styles.sectionHeaderText} numberOfLines={1}>
        {title}
      </Text>
      {rightContent ? (
        <View style={styles.rightContent}>{rightContent}</View>
      ) : null}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    backgroundColor: t.colors.background,
    paddingTop: 12,
    paddingBottom: 6,
  },
  insetHorizontal: {
    paddingHorizontal: 16,
  },
  sectionHeaderText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  rightContent: {
    flexShrink: 0,
  },
})
