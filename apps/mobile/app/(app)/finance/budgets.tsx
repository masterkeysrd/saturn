import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { PiggyBank, Calendar, Plus, Sparkles } from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  useListBudgetsQuery,
  type Budget,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { formatInterval } from "@/components/finance/finance-utils"
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
    { pageSize: 100, pageToken: "", view: "FULL" },
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
      <Stack.Screen
        options={{
          headerTitle: "Budgets",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push("/modal/manage-budget")
              }}
              style={styles.headerAddBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Plus size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
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
              const nativeColors = getNativeBudgetColors(b.color || "indigo")
              const BIcon = getBudgetIcon(b.icon, b.name)

              const spentCents = Number(b.currentPeriod?.spentAmount || "0")
              const limitCents = Number(b.limitAmount || "0")
              const actualPercentage =
                limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0
              const progressWidth = Math.min(actualPercentage, 100)
              const isOver = actualPercentage >= 100
              const isNearLimit = actualPercentage >= 85 && !isOver

              const remainingCents = Math.max(limitCents - spentCents, 0)
              const overCents = Math.max(spentCents - limitCents, 0)

              const now = new Date()
              const daysLeft = b.currentPeriod?.endDate
                ? Math.max(
                    1,
                    Math.ceil(
                      (new Date(b.currentPeriod.endDate).getTime() -
                        now.getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  )
                : Math.max(
                    1,
                    Math.ceil(
                      (new Date(
                        now.getFullYear(),
                        now.getMonth() + 1,
                        0
                      ).getTime() -
                        now.getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  )
              const dailyAllowanceCents =
                !isOver && daysLeft > 0
                  ? Math.round(remainingCents / daysLeft)
                  : 0

              const startStr = b.currentPeriod?.startDate
                ? new Date(b.currentPeriod.startDate).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    }
                  )
                : ""
              const endStr = b.currentPeriod?.endDate
                ? new Date(b.currentPeriod.endDate).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    }
                  )
                : ""
              const dateRangeStr =
                b.interval === "ONE_TIME"
                  ? "Lifetime"
                  : startStr && endStr
                    ? `${startStr} - ${endStr}`
                    : ""

              const barColor = isOver
                ? theme.colors.destructive
                : isNearLimit
                  ? "#f59e0b"
                  : nativeColors.bar

              return (
                <Card
                  key={b.id}
                  style={styles.budgetCard}
                  onPress={() => {
                    haptics.light()
                    router.push({
                      pathname: "/(app)/finance/budgets/[id]",
                      params: { id: b.id },
                    })
                  }}
                >
                  <View style={styles.budgetHeader}>
                    <View style={styles.budgetLeftGroup}>
                      <View
                        style={[
                          styles.budgetIconBadge,
                          {
                            backgroundColor: nativeColors.bg,
                            borderColor: nativeColors.border,
                          },
                        ]}
                      >
                        <BIcon size={18} color={nativeColors.bar} />
                      </View>
                      <View style={styles.budgetTitleCol}>
                        <View style={styles.budgetNameRow}>
                          <Text style={styles.budgetName} numberOfLines={1}>
                            {b.name}
                          </Text>
                          <View style={styles.intervalBadge}>
                            <Text style={styles.intervalText}>
                              {formatInterval(b.interval)}
                            </Text>
                          </View>
                        </View>
                        {dateRangeStr ? (
                          <View style={styles.periodRow}>
                            <Calendar
                              size={11}
                              color={theme.colors.textMuted}
                            />
                            <Text style={styles.periodText}>
                              {dateRangeStr}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.budgetRightGroup}>
                      <Text style={styles.limitAmountText}>
                        {formatAmount(b.limitAmount, b.currency)}
                      </Text>
                      <Badge
                        size="sm"
                        label={`${actualPercentage}%`}
                        bg={
                          isOver
                            ? theme.colors.destructiveSubtle
                            : isNearLimit
                              ? "rgba(245, 158, 11, 0.15)"
                              : nativeColors.bg
                        }
                        border={
                          isOver
                            ? "rgba(244, 63, 94, 0.3)"
                            : isNearLimit
                              ? "rgba(245, 158, 11, 0.3)"
                              : nativeColors.border
                        }
                        color={
                          isOver
                            ? theme.colors.destructive
                            : isNearLimit
                              ? "#f59e0b"
                              : nativeColors.text
                        }
                      />
                    </View>
                  </View>

                  {/* Progress Track */}
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${progressWidth}%`,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.budgetFooter}>
                    <Text style={styles.spentText}>
                      Spent:{" "}
                      <Text
                        style={[
                          styles.whiteText,
                          isOver && { color: theme.colors.destructive },
                        ]}
                      >
                        {formatAmount(String(spentCents), b.currency)}
                      </Text>
                    </Text>
                    <Text
                      style={[styles.remainingText, isOver && styles.overText]}
                    >
                      {isOver
                        ? `Over by ${formatAmount(String(overCents), b.currency)}`
                        : `${formatAmount(String(remainingCents), b.currency)} left`}
                    </Text>
                  </View>

                  {!isOver && dailyAllowanceCents > 0 ? (
                    <View style={styles.allowanceSubRow}>
                      <Sparkles size={11} color={theme.colors.primary} />
                      <Text style={styles.allowanceSubText}>
                        Pace:{" "}
                        <Text style={styles.allowanceSubBold}>
                          {formatAmount(
                            String(dailyAllowanceCents),
                            b.currency
                          )}{" "}
                          / day
                        </Text>{" "}
                        ({daysLeft}d left)
                      </Text>
                    </View>
                  ) : null}
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
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  budgetLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  budgetIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  budgetTitleCol: {
    flex: 1,
    gap: 3,
  },
  budgetNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  budgetName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  intervalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  intervalText: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  periodText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  budgetRightGroup: {
    alignItems: "flex-end",
    gap: 4,
  },
  limitAmountText: {
    fontSize: 15,
    fontWeight: "800",
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
    alignItems: "center",
  },
  spentText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  whiteText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  remainingText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.success,
  },
  overText: {
    color: theme.colors.destructive,
  },
  allowanceSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  allowanceSubText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  allowanceSubBold: {
    fontWeight: "700",
    color: theme.colors.primary,
  },
})
