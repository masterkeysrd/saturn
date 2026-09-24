import React from "react"
import { StyleSheet, Text, View, type ViewStyle } from "react-native"
import { theme } from "@/lib/theme"

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

const styles = StyleSheet.create({
  sectionHeader: {
    backgroundColor: theme.colors.background,
    paddingTop: 12,
    paddingBottom: 6,
  },
  insetHorizontal: {
    paddingHorizontal: 16,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
})
