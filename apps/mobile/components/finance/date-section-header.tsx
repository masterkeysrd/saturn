import React from "react"
import { Text, View, type ViewStyle } from "react-native"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export interface DateSectionHeaderProps {
  title: string
  insetHorizontal?: boolean
  style?: ViewStyle
}

export function DateSectionHeader({
  title,
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
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  sectionHeader: {
    backgroundColor: t.colors.background,
    paddingTop: 12,
    paddingBottom: 6,
  },
  insetHorizontal: {
    paddingHorizontal: 16,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
})
