import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
} from "react-native"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { FinanceSummaryWidget } from "@/components/widgets/finance-summary-widget"

export default function OverviewScreen() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { refetchSpaces } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
  }, [])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const firstName = user?.name?.split(" ")[0] || "there"

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchSpaces(),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const firstKey = query.queryKey[0]
            return typeof firstKey === "string" && firstKey.startsWith("/api/v1/")
          },
        }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
          />
        }
      >
        {/* Daily Greeting & Date Header */}
        <View style={styles.greetingHeader}>
          <Text style={styles.dateLabel}>{formattedDate}</Text>
          <Text style={styles.greetingTitle}>
            {getGreeting()}, {firstName}
          </Text>
        </View>

        {/* Existing Feature Widgets */}
        <FinanceSummaryWidget />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 80,
    gap: 16,
  },
  greetingHeader: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 3,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
})
