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
  Alert,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  Calendar,
  Plus,
  Edit3,
  AlertCircle,
  ReceiptText,
  Sparkles,
  Pause,
  Play,
  Unlock,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  AlertTriangle,
  MoreVertical,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { MenuView } from "@expo/ui/community/menu"
import {
  useGetBudgetQuery,
  useGetBudgetPeriodQuery,
  useListBudgetsQuery,
  useListTransactionsQuery,
  useListAccountsQuery,
  useGetSettingsQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  type Account,
  type Budget,
  type Budget_Status,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatAmount,
  formatInterval,
  groupTransactionsByDate,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
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
import { useToast } from "@/components/ui/toast"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

// Cross-platform menu icons
const addExpenseIcon = Icon.select({
  ios: "plus.circle",
  android: require("@expo/material-symbols/add_circle.xml"),
})

const pauseIcon = Icon.select({
  ios: "pause.circle",
  android: require("@expo/material-symbols/pause_circle.xml"),
})

const resumeIcon = Icon.select({
  ios: "play.circle",
  android: require("@expo/material-symbols/play_circle.xml"),
})

const closeIcon = Icon.select({
  ios: "lock",
  android: require("@expo/material-symbols/lock.xml"),
})

const reopenIcon = Icon.select({
  ios: "lock.open",
  android: require("@expo/material-symbols/lock_open.xml"),
})

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const deleteIcon = Icon.select({
  ios: "trash",
  android: require("@expo/material-symbols/delete.xml"),
})

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
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const isHistorical = selectedDate !== null

  // Fetch base currency settings
  const { data: settingsData } = useGetSettingsQuery(
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

  // Fetch budget period (for selected historical date or fallback when currentPeriod not populated)
  const { data: periodData, refetch: refetchPeriod } = useGetBudgetPeriodQuery(
    {
      budgetId: id || "",
      date: (selectedDate || new Date()).toISOString(),
    },
    {
      enabled:
        !!id &&
        !!activeSpaceId &&
        (isHistorical || !budgetFromList?.currentPeriod),
    }
  )

  const currentPeriod = isHistorical
    ? periodData
    : budget?.currentPeriod || periodData

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
    { activeOnly: false },
    { enabled: !!activeSpaceId }
  )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )
  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((a) => {
      if (a.id) map.set(a.id, a)
    })
    return map
  }, [accounts])

  const transactions = useMemo(
    () => txnsData?.transactions || [],
    [txnsData?.transactions]
  )

  const periodId =
    currentPeriod && "id" in currentPeriod ? currentPeriod.id : undefined
  const periodStartDate = currentPeriod?.startDate
  const periodEndDate = currentPeriod?.endDate
  const budgetInterval = budget?.interval

  // Filter transactions to the displayed period
  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.type !== "EXPENSE") return false
      if (budgetInterval === "ONE_TIME") return true
      if (periodId && t.periodId) {
        return t.periodId === periodId
      }
      if (!periodStartDate || !periodEndDate || !t.transactionDate) return false
      const tTime = new Date(t.transactionDate).getTime()
      const start = new Date(periodStartDate).getTime()
      const end = new Date(periodEndDate).getTime()
      return tTime >= start && tTime <= end
    })
  }, [transactions, budgetInterval, periodId, periodStartDate, periodEndDate])

  const sections = useMemo(
    () => groupTransactionsByDate(periodTransactions, tz.timezone),
    [periodTransactions, tz.timezone]
  )

  const transactionsSpentInPeriodCents = useMemo(() => {
    return periodTransactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount || "0")),
      0
    )
  }, [periodTransactions])

  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchBudgets(),
        refetchSingleBudget(),
        refetchPeriod(),
        refetchTxns(),
        invalidateFinanceQueries(queryClient),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const handleUpdateStatus = async (
    newStatus: Budget_Status,
    actionLabel: string
  ) => {
    if (!budget?.id) return
    haptics.medium()
    try {
      await updateMutation.mutateAsync({
        id: budget.id,
        req: {
          id: budget.id,
          version: budget.version,
          budget: {
            ...budget,
            status: newStatus,
          },
          propagation: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
          updateMask: { paths: ["status"] },
        },
      })
      haptics.success()
      toast.show({
        title: `Budget ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`,
        message: `"${budget.name}" has been ${actionLabel}.`,
        type: "success",
      })
      await invalidateFinanceQueries(queryClient)
      refetchBudgets()
      refetchSingleBudget()
      refetchPeriod()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Action Failed",
        message:
          err instanceof Error ? err.message : "Failed to update budget status",
        type: "error",
      })
    }
  }

  const handleDeleteBudget = () => {
    const budgetId = budget?.id
    if (!budgetId) return
    haptics.warning()
    Alert.alert(
      "Delete Budget",
      `Are you sure you want to delete budget "${budget.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: budgetId,
                req: { id: budgetId, version: budget.version },
              })
              haptics.success()
              toast.show({
                title: "Budget Deleted",
                message: `"${budget.name}" was removed.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete budget.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  const handleStatusOptions = () => {
    if (!budget) return
    haptics.light()
    const currentStatus = budget.status || "ACTIVE"
    const options: {
      text: string
      style?: "default" | "cancel" | "destructive"
      onPress?: () => void
    }[] = []

    if (currentStatus === "ACTIVE") {
      options.push({
        text: "Pause Budget",
        onPress: () => handleUpdateStatus("PAUSED", "paused"),
      })
      options.push({
        text: "Close Budget",
        style: "destructive",
        onPress: () => handleUpdateStatus("CLOSED", "closed"),
      })
    } else if (currentStatus === "PAUSED") {
      options.push({
        text: "Resume Budget",
        onPress: () => handleUpdateStatus("ACTIVE", "resumed"),
      })
      options.push({
        text: "Close Budget",
        style: "destructive",
        onPress: () => handleUpdateStatus("CLOSED", "closed"),
      })
    } else if (currentStatus === "CLOSED") {
      options.push({
        text: "Reopen Budget",
        onPress: () => handleUpdateStatus("ACTIVE", "reopened"),
      })
    }

    options.push({ text: "Cancel", style: "cancel" })

    Alert.alert("Manage Status", `Current: ${currentStatus}`, options)
  }

  // Stepping historical periods
  const handleStepPeriod = (step: -1 | 1) => {
    haptics.selection()
    const base = selectedDate || new Date()
    const next = new Date(base)
    const interval = budget?.interval || "MONTHLY"

    if (interval === "WEEKLY") {
      next.setDate(next.getDate() + step * 7)
    } else if (interval === "YEARLY") {
      next.setFullYear(next.getFullYear() + step)
    } else {
      next.setMonth(next.getMonth() + step)
    }
    setSelectedDate(next)
  }

  const handleResetCurrent = () => {
    haptics.selection()
    setSelectedDate(null)
  }

  if (isBudgetsLoading || isSingleBudgetLoading) {
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
    ? tz.format(currentPeriod.startDate, {
        month: "short",
        day: "numeric",
      })
    : ""
  const endStr = currentPeriod?.endDate
    ? tz.format(currentPeriod.endDate, {
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

  // Cross-currency conversion details
  const isCrossCurrency = Boolean(
    budget.currency &&
    baseCurrency &&
    budget.currency.toUpperCase() !== baseCurrency.toUpperCase()
  )
  const rateToBase = currentPeriod?.exchangeRateToBase ?? 0
  const isRateMissing =
    isCrossCurrency && Boolean(currentPeriod) && rateToBase <= 0
  const limitInBaseCents = Math.round(limitCents * rateToBase)
  const spentInBaseCents = currentPeriod?.spentInBase
    ? Number(currentPeriod.spentInBase)
    : Math.round(spentCents * rateToBase)

  // Default Account
  const defaultAccount = budget.defaultAccountId
    ? accountsMap.get(budget.defaultAccountId)
    : undefined

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
                <View style={styles.intervalBadge}>
                  <Text style={styles.intervalBadgeText}>
                    {formatInterval(budget.interval)}
                  </Text>
                </View>

                {/* Default account badge */}
                {defaultAccount ? (
                  <View style={styles.accountBadge}>
                    <CreditCard size={11} color={theme.colors.textMuted} />
                    <Text style={styles.accountBadgeText} numberOfLines={1}>
                      {defaultAccount.name}
                    </Text>
                  </View>
                ) : null}

                {budget.status === "CLOSED" ? (
                  <View
                    style={[
                      styles.intervalBadge,
                      {
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.intervalBadgeText,
                        { color: theme.colors.destructive },
                      ]}
                    >
                      Closed
                    </Text>
                  </View>
                ) : budget.status === "PAUSED" ? (
                  <View
                    style={[
                      styles.intervalBadge,
                      {
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        borderColor: "rgba(245, 158, 11, 0.3)",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.intervalBadgeText, { color: "#f59e0b" }]}
                    >
                      Paused
                    </Text>
                  </View>
                ) : null}
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

        {/* Historical Period Navigation Controls */}
        {budget.interval !== "ONE_TIME" ? (
          <View style={styles.periodNavControls}>
            <TouchableOpacity
              onPress={() => handleStepPeriod(-1)}
              style={styles.periodNavArrow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft size={16} color={theme.colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.periodLabelGroup}>
              <Calendar size={13} color={theme.colors.textMuted} />
              <Text style={styles.periodRangeText}>{dateRangeStr}</Text>
            </View>

            <TouchableOpacity
              onPress={() => handleStepPeriod(1)}
              style={styles.periodNavArrow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronRight size={16} color={theme.colors.textPrimary} />
            </TouchableOpacity>

            {isHistorical ? (
              <TouchableOpacity
                onPress={handleResetCurrent}
                style={styles.periodResetBadge}
                activeOpacity={0.7}
              >
                <Text style={styles.periodResetText}>Current</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.periodLabelGroup}>
            <Calendar size={13} color={theme.colors.textMuted} />
            <Text style={styles.periodRangeText}>{dateRangeStr}</Text>
          </View>
        )}

        {/* Missing Exchange Rate Warning Banner */}
        {isRateMissing ? (
          <View style={styles.exchangeRateWarning}>
            <AlertTriangle size={14} color="#f59e0b" />
            <Text style={styles.exchangeRateWarningText}>
              Exchange Rate Required: No conversion rate configured from{" "}
              {budget.currency} to {baseCurrency}.
            </Text>
          </View>
        ) : null}

        {/* Cross-Currency Conversion Strip */}
        {isCrossCurrency && rateToBase > 0 ? (
          <View style={styles.crossCurrencyStrip}>
            <Text style={styles.crossCurrencyRateText}>
              1 {budget.currency} = {rateToBase.toFixed(4)} {baseCurrency}
            </Text>
            <Text style={styles.crossCurrencyValuesText}>
              Limit: {formatAmount(limitInBaseCents, baseCurrency)} • Spent:{" "}
              {formatAmount(spentInBaseCents, baseCurrency)}
            </Text>
          </View>
        ) : null}

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
          disabled={budget.status === "CLOSED" || budget.status === "PAUSED"}
          style={[
            styles.actionBtnPrimary,
            (budget.status === "CLOSED" || budget.status === "PAUSED") && {
              opacity: 0.5,
            },
          ]}
        >
          <Plus size={16} color={theme.colors.primaryForeground} />
          <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
            Add Expense
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/manage-budget",
              params: { id: budget.id },
            })
          }}
          style={[
            styles.actionBtnSecondary,
            { flex: 0, paddingHorizontal: 16 },
          ]}
        >
          <Edit3 size={16} color={theme.colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            Edit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleStatusOptions}
          style={[
            styles.actionBtnSecondary,
            { flex: 0, paddingHorizontal: 16 },
          ]}
        >
          {budget.status === "CLOSED" ? (
            <>
              <Unlock size={16} color={theme.colors.success} />
              <Text
                style={[
                  styles.actionBtnSecondaryText,
                  { color: theme.colors.success },
                ]}
                numberOfLines={1}
              >
                Reopen
              </Text>
            </>
          ) : budget.status === "PAUSED" ? (
            <>
              <Play size={16} color={theme.colors.primary} />
              <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
                Resume
              </Text>
            </>
          ) : (
            <>
              <Pause size={16} color={theme.colors.textMuted} />
              <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
                Status
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        TRANSACTIONS ({periodTransactions.length})
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: budget.name,
          headerRight: () => (
            <MenuView
              title={budget.name}
              colorScheme="dark"
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "expense") {
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
                } else if (nativeEvent.event === "pause") {
                  handleUpdateStatus("PAUSED", "paused")
                } else if (nativeEvent.event === "resume") {
                  handleUpdateStatus("ACTIVE", "resumed")
                } else if (nativeEvent.event === "close") {
                  handleUpdateStatus("CLOSED", "closed")
                } else if (nativeEvent.event === "reopen") {
                  handleUpdateStatus("ACTIVE", "reopened")
                } else if (nativeEvent.event === "edit") {
                  haptics.light()
                  router.push({
                    pathname: "/modal/manage-budget",
                    params: { id: budget.id },
                  })
                } else if (nativeEvent.event === "delete") {
                  handleDeleteBudget()
                }
              }}
              actions={[
                ...(budget.status === "ACTIVE" || !budget.status
                  ? [
                      {
                        id: "expense",
                        title: "Record Expense",
                        image: addExpenseIcon,
                      },
                    ]
                  : []),
                ...(budget.status === "PAUSED"
                  ? [
                      {
                        id: "resume",
                        title: "Resume Budget",
                        image: resumeIcon,
                      },
                    ]
                  : budget.status === "CLOSED"
                    ? []
                    : [
                        {
                          id: "pause",
                          title: "Pause Budget",
                          image: pauseIcon,
                        },
                      ]),
                ...(budget.status === "CLOSED"
                  ? [
                      {
                        id: "reopen",
                        title: "Reopen Budget",
                        image: reopenIcon,
                      },
                    ]
                  : [
                      {
                        id: "close",
                        title: "Close Budget",
                        image: closeIcon,
                      },
                    ]),
                {
                  id: "edit",
                  title: "Edit Budget",
                  image: editIcon,
                },
                {
                  id: "delete",
                  title: "Delete Budget",
                  image: deleteIcon,
                  attributes: { destructive: true },
                },
              ]}
            >
              <View style={styles.headerDotsBtn}>
                <MoreVertical size={20} color={theme.colors.textPrimary} />
              </View>
            </MenuView>
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
          renderSectionHeader={({ section }) => (
            <DateSectionHeader title={section.title} />
          )}
          renderItem={({ item }) => (
            <TransactionListItem
              item={item}
              baseCurrency={baseCurrency}
              account={
                item.accountId ? accountsMap.get(item.accountId) : undefined
              }
              budget={budget}
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
              <View style={{ gap: 8, paddingHorizontal: 16 }}>
                <SkeletonCard height={60} />
                <SkeletonCard height={60} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon={
                    <ReceiptText size={32} color={theme.colors.textMuted} />
                  }
                  title={
                    isHistorical
                      ? "No transactions in this period"
                      : "No expenses recorded"
                  }
                  description={
                    isHistorical
                      ? "There were no expenses logged for this historical budget cycle."
                      : "Add expenses to this category to track your progress against the budget limit."
                  }
                  actionLabel={
                    budget.status === "ACTIVE" || !budget.status
                      ? "Add Expense"
                      : undefined
                  }
                  onAction={
                    budget.status === "ACTIVE" || !budget.status
                      ? () =>
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
                      : undefined
                  }
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
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backToBudgetsText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  headerDotsBtn: {
    padding: 6,
    marginRight: 4,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: theme.colors.surfaceElevated,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  budgetName: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  periodNavControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  periodNavArrow: {
    padding: 4,
  },
  periodLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
  },
  periodRangeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  periodResetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  periodResetText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  accountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: 120,
  },
  accountBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  intervalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  exchangeRateWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  exchangeRateWarningText: {
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
    lineHeight: 16,
  },
  crossCurrencyStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  crossCurrencyRateText: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: theme.colors.textMuted,
  },
  crossCurrencyValuesText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceHighlight,
    marginTop: 14,
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
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
