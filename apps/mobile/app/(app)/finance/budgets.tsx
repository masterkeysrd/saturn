import React, { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useRouter } from "expo-router"
import { PiggyBank, Plus } from "lucide-react-native"
import { formatAmount, getBudgetColors } from "@saturn/core"
import {
  useListBudgetsQuery,
  type Budget,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { EmptyState } from "@/components/ui/empty-state"
import { haptics } from "@/lib/haptics"

export default function BudgetsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  const {
    data: budgetsData,
    isLoading,
    refetch,
  } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const budgets = budgetsData?.budgets || []

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
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
        <Caption style={styles.sectionHeader}>
          ACTIVE BUDGETS ({budgets.length})
        </Caption>

        {isLoading ? (
          <View style={{ gap: 10 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : budgets.length === 0 ? (
          <EmptyState
            icon={<PiggyBank size={28} color={theme.colors.textMuted} />}
            title="No budgets created"
            description="Create your first budget to start tracking category spending."
          />
        ) : (
          <View style={styles.budgetList}>
            {budgets.map((b: Budget) => {
              const palette = getBudgetColors(b.color)
              const spentCents = Number(b.currentPeriod?.spentAmount || "0")
              const limitCents = Number(b.limitAmount || "0")
              const percentage =
                limitCents > 0
                  ? Math.min(Math.round((spentCents / limitCents) * 100), 100)
                  : 0

              const nativeColors = getNativeBudgetColors(palette.value)
              const isOver = percentage >= 95

              return (
                <Card
                  key={b.id}
                  style={styles.budgetCard}
                  onPress={() => haptics.light()}
                >
                  <View style={styles.budgetHeader}>
                    <View style={styles.budgetTitleRow}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: nativeColors.bar },
                        ]}
                      />
                      <Text style={styles.budgetName}>{b.name}</Text>
                    </View>
                    <Badge
                      size="sm"
                      label={`${percentage}%`}
                      bg={
                        isOver
                          ? theme.colors.destructiveSubtle
                          : nativeColors.bg
                      }
                      border={
                        isOver ? "rgba(244, 63, 94, 0.3)" : nativeColors.border
                      }
                      color={
                        isOver ? theme.colors.destructive : nativeColors.text
                      }
                    />
                  </View>

                  {/* Progress Track */}
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${percentage}%`,
                          backgroundColor: isOver
                            ? theme.colors.destructive
                            : nativeColors.bar,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.budgetFooter}>
                    <Text style={styles.spentText}>
                      Spent:{" "}
                      <Text style={styles.whiteText}>
                        {formatAmount(String(spentCents), b.currency)}
                      </Text>
                    </Text>
                    <Text style={styles.limitText}>
                      Limit: {formatAmount(b.limitAmount, b.currency)}
                    </Text>
                  </View>
                </Card>
              )
            })}
          </View>
        )}
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
    paddingBottom: 80,
    gap: 14,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  budgetList: {
    gap: 12,
  },
  budgetCard: {
    padding: 16,
    gap: 12,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  budgetName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spentText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  whiteText: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  limitText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
})
