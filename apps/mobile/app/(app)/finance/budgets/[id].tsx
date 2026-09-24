import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import {
  Calendar,
  Plus,
  Edit3,
  AlertCircle,
  ReceiptText,
  Sparkles,
} from "lucide-react-native"
import {
  useGetBudgetQuery,
  useGetBudgetPeriodQuery,
  useListBudgetsQuery,
  useListTransactionsQuery,
  useListAccountsQuery,
  useGetFinanceSettingsQuery,
  type Account,
  type Budget,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatAmount,
  formatInterval,
  groupTransactionsByDate,
} from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { DateSectionHeader } from "@/components/finance/date-section-header"

function calculateDaysLeft(endDateStr?: string): number {
  const now = new Date()
  if (!endDateStr) {
    // Default to days left in current month
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const diff = endOfMonth.getTime() - now.getTime()
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }
  const end = new Date(endDateStr)
  if (isNaN(end.getTime())) return 1
  const diff = end.getTime() - now.getTime()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function BudgetDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  // Fetch base currency settings
  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch budgets list (view: FULL populates currentPeriod with spentAmount & dates)
  const {
    data: budgetsData,
    isLoading: isBudgetsLoading,
    refetch: refetchBudgets,
  } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL" },
    { enabled: !!activeSpaceId }
  )

  const budgetFromList = useMemo(
    () => budgetsData?.budgets?.find((b: Budget) => b.id === id),
    [budgetsData, id]
  )

  // Fallback to single get query
  const {
    data: budgetFromGet,
    isLoading: isSingleBudgetLoading,
    refetch: refetchSingleBudget,
  } = useGetBudgetQuery(
    { id: id || "" },
    { enabled: !!id && !!activeSpaceId && !budgetFromList }
  )

  const budget = budgetFromList || budgetFromGet

  // Fallback to fetch budget period if not provided on budget
  const { data: periodData, refetch: refetchPeriod } = useGetBudgetPeriodQuery(
    { budgetId: id || "", date: new Date().toISOString() },
    { enabled: !!id && !!activeSpaceId && !budgetFromList?.currentPeriod }
  )

  const currentPeriod = budget?.currentPeriod || periodData

  // Fetch transactions for this budget
  const {
    data: txnsData,
    isLoading: isTxnsLoading,
    refetch: refetchTxns,
  } = useListTransactionsQuery(
    {
      budgetId: id || "",
      types: [],
      pageSize: 100,
      pageToken: "",
      view: "FULL",
    },
    { enabled: !!id && !!activeSpaceId }
  )

  // Fetch accounts to map account info
  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts = accountsData?.accounts || []
  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((a) => {
      if (a.id) map.set(a.id, a)
    })
    return map
  }, [accounts])

  const transactions = txnsData?.transactions || []

  const sections = useMemo(
    () => groupTransactionsByDate(transactions),
    [transactions]
  )

  const transactionsSpentInPeriodCents = useMemo(() => {
    const periodId =
      currentPeriod && "id" in currentPeriod ? currentPeriod.id : undefined
    const startDate = currentPeriod?.startDate
    const endDate = currentPeriod?.endDate

    return transactions
      .filter((t) => {
        if (t.type !== "EXPENSE") return false
        if (budget?.interval === "ONE_TIME") return true
        if (periodId && t.periodId) {
          return t.periodId === periodId
        }
        if (!startDate || !endDate || !t.transactionDate) return false
        const tTime = new Date(t.transactionDate).getTime()
        const start = new Date(startDate).getTime()
        const end = new Date(endDate).getTime()
        return tTime >= start && tTime <= end
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || "0")), 0)
  }, [
    transactions,
    budget?.interval,
    currentPeriod && "id" in currentPeriod ? currentPeriod.id : undefined,
    currentPeriod?.startDate,
    currentPeriod?.endDate,
  ])

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchBudgets(),
        refetchSingleBudget(),
        refetchPeriod(),
        refetchTxns(),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const isInitialLoading =
    (!budget && isBudgetsLoading) || (!budget && isSingleBudgetLoading)

  if (isInitialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!budget) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={theme.colors.destructive} />
        <Text style={styles.errorTitle}>Budget Not Found</Text>
        <Text style={styles.errorSubtitle}>
          The requested budget allocation could not be loaded.
        </Text>
        <TouchableOpacity
          style={styles.backToBudgetsBtn}
          onPress={() => router.replace("/(app)/finance/budgets")}
          activeOpacity={0.7}
        >
          <Text style={styles.backToBudgetsText}>Back to Budgets</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const nativeColors = getNativeBudgetColors(budget.color || "indigo")
  const BIcon = getBudgetIcon(budget.icon, budget.name)

  const periodSpentStr = currentPeriod?.spentAmount
  const periodSpentNum =
    periodSpentStr !== undefined && periodSpentStr !== ""
      ? Number(periodSpentStr)
      : undefined

  const spentCents =
    periodSpentNum !== undefined
      ? periodSpentNum
      : transactionsSpentInPeriodCents

  const limitCents = Number(budget.limitAmount || "0")
  const actualPercentage =
    limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0
  const progressWidth = Math.min(actualPercentage, 100)
  const isOver = actualPercentage >= 100
  const isNearLimit = actualPercentage >= 85 && !isOver

  const remainingCents = Math.max(limitCents - spentCents, 0)
  const overCents = Math.max(spentCents - limitCents, 0)

  const daysLeft = calculateDaysLeft(currentPeriod?.endDate)
  const dailyAllowanceCents =
    !isOver && daysLeft > 0 ? Math.round(remainingCents / daysLeft) : 0

  const startStr = currentPeriod?.startDate
    ? new Date(currentPeriod.startDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : ""
  const endStr = currentPeriod?.endDate
    ? new Date(currentPeriod.endDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : ""
  const dateRangeStr =
    budget.interval === "ONE_TIME"
      ? "Lifetime Allocation"
      : startStr && endStr
        ? `${startStr} - ${endStr}`
        : "Current Period"

  const barColor = isOver
    ? theme.colors.destructive
    : isNearLimit
      ? "#f59e0b"
      : nativeColors.bar

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Hero Budget Card */}
      <Card style={[styles.heroCard, { borderColor: nativeColors.border }]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroLeftGroup}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: nativeColors.bg,
                  borderColor: nativeColors.border,
                },
              ]}
            >
              <BIcon size={22} color={nativeColors.bar} />
            </View>
            <View style={styles.heroTitleCol}>
              <Text style={styles.budgetName} numberOfLines={1}>
                {budget.name}
              </Text>
              <View style={styles.periodRow}>
                <Calendar size={12} color={theme.colors.textMuted} />
                <Text style={styles.periodText}>{dateRangeStr}</Text>
                <View style={styles.intervalBadge}>
                  <Text style={styles.intervalBadgeText}>
                    {formatInterval(budget.interval)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <Badge
            size="md"
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

        {/* Progress Track */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${progressWidth}%`,
                minWidth: progressWidth > 0 ? 6 : 0,
                backgroundColor: barColor,
              },
            ]}
          />
        </View>

        {/* Financial Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Spent</Text>
            <Text
              style={[
                styles.metricValue,
                isOver && { color: theme.colors.destructive },
              ]}
            >
              {formatAmount(String(spentCents), budget.currency)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Limit</Text>
            <Text style={styles.metricValue}>
              {formatAmount(budget.limitAmount, budget.currency)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>
              {isOver ? "Over Budget" : "Remaining"}
            </Text>
            <Text
              style={[
                styles.metricValue,
                isOver
                  ? { color: theme.colors.destructive }
                  : { color: theme.colors.success },
              ]}
            >
              {isOver
                ? `+${formatAmount(String(overCents), budget.currency)}`
                : formatAmount(String(remainingCents), budget.currency)}
            </Text>
          </View>
        </View>

        {/* Daily Allowance Banner */}
        <View style={styles.allowanceBanner}>
          <Sparkles
            size={14}
            color={isOver ? "#f59e0b" : theme.colors.primary}
          />
          <Text style={styles.allowanceText}>
            {isOver ? (
              <Text>Limit exceeded. Spending paused for this cycle.</Text>
            ) : (
              <Text>
                Daily Allowance:{" "}
                <Text style={styles.allowanceBold}>
                  {formatAmount(String(dailyAllowanceCents), budget.currency)} /
                  day
                </Text>{" "}
                ({daysLeft} {daysLeft === 1 ? "day" : "days"} left)
              </Text>
            )}
          </Text>
        </View>
      </Card>

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "EXPENSE",
                budgetId: budget.id,
                ...(budget.defaultAccountId
                  ? { accountId: budget.defaultAccountId }
                  : {}),
              },
            })
          }}
          style={styles.actionBtnPrimary}
        >
          <Plus size={16} color={theme.colors.primaryForeground} />
          <Text style={styles.actionBtnPrimaryText}>Add Expense</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/manage-budget",
              params: { id: budget.id },
            })
          }}
          style={styles.actionBtnSecondary}
        >
          <Edit3 size={16} color={theme.colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText}>Edit Budget</Text>
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        TRANSACTIONS ({transactions.length})
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: budget.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/modal/manage-budget",
                  params: { id: budget.id },
                })
              }}
              style={styles.headerEditBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.headerEditBtnText}>Edit</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surfaceElevated}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <DateSectionHeader title={title} />
          )}
          renderItem={({ item }) => (
            <TransactionListItem
              item={item}
              account={
                item.accountId ? accountsMap.get(item.accountId) : undefined
              }
              budget={budget}
              baseCurrency={baseCurrency}
              showDate={false}
              showBudget={false}
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/(app)/finance/transactions/[id]",
                  params: { id: item.id },
                })
              }}
            />
          )}
          ListEmptyComponent={
            isTxnsLoading ? (
              <View style={{ gap: 10, paddingHorizontal: 16 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <EmptyState
                  icon={
                    <ReceiptText size={28} color={theme.colors.textMuted} />
                  }
                  title="No transactions booked"
                  description="Expenses assigned to this budget category will appear here."
                />
              </View>
            )
          }
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  backToBudgetsBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backToBudgetsText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerEditBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  headerSection: {
    padding: 16,
  },
  heroCard: {
    padding: 16,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitleCol: {
    flex: 1,
  },
  budgetName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  periodText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  intervalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  intervalBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceHighlight,
    marginTop: 16,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  allowanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  allowanceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  allowanceBold: {
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  ledgerHeader: {
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
})
