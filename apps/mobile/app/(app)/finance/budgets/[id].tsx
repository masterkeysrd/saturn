import { useState, useMemo } from "react"
import {
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
import { ActionMenu } from "@/components/ui/action-menu"
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
import { formatAmount, parseDate } from "@saturn/core"
import {
  invalidateFinanceQueries,
  useDateSections,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { getLocalizedIntervalLabel, type TranslationKey } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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

function calculateDaysLeft(
  endDateStr: string | undefined,
  tz: ReturnType<typeof useTimezone>
): number {
  const now = tz.now()
  if (!endDateStr) {
    const parts = tz.parts(now)
    if (!parts) return 1
    const daysInMonth = new Date(
      Date.UTC(parts.year, parts.month, 0)
    ).getUTCDate()
    return Math.max(1, daysInMonth - parts.day + 1)
  }
  const end = parseDate(endDateStr)
  if (!end) return 1
  const diff = tz.endOfDay(end).getTime() - now.getTime()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

type BudgetStatusAction = "Paused" | "Resumed" | "Closed" | "Reopened"

const STATUS_ACTION_KEYS: Record<BudgetStatusAction, TranslationKey> = {
  Paused: "finance.budgets.mobile.statusAction.Paused",
  Resumed: "finance.budgets.mobile.statusAction.Resumed",
  Closed: "finance.budgets.mobile.statusAction.Closed",
  Reopened: "finance.budgets.mobile.statusAction.Reopened",
}

function capitalizeAction(action: string): BudgetStatusAction {
  return (action.charAt(0).toUpperCase() +
    action.slice(1)) as BudgetStatusAction
}

export default function BudgetDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { colors, resolvedMode, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)
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

  const periodStartDate = currentPeriod?.startDate
  const periodEndDate = currentPeriod?.endDate
  const budgetInterval = budget?.interval
  const isOneTime = budgetInterval === "ONE_TIME"

  // Fetch expense transactions for this budget and period directly from the backend
  const {
    data: txnsData,
    isLoading: isTxnsLoading,
    refetch: refetchTxns,
  } = useListTransactionsQuery(
    {
      budgetId: id || "",
      types: ["EXPENSE"],
      startDate: isOneTime ? undefined : periodStartDate || undefined,
      endDate: isOneTime ? undefined : periodEndDate || undefined,
      pageSize: 100,
      pageToken: "",
      view: "FULL",
    },
    {
      enabled:
        !!id &&
        !!activeSpaceId &&
        !!budget &&
        (isOneTime || Boolean(periodStartDate && periodEndDate)),
    }
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

  const periodTransactions = useMemo(
    () => txnsData?.transactions || [],
    [txnsData?.transactions]
  )

  const sections = useDateSections(periodTransactions)

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
      const action = t(STATUS_ACTION_KEYS[capitalizeAction(actionLabel)])
      toast.show({
        title: t("finance.budgets.mobile.toastStatusTitle", { action }),
        message: t("finance.budgets.mobile.toastStatusDesc", {
          name: budget.name,
          action,
        }),
        type: "success",
      })
      await invalidateFinanceQueries(queryClient)
      refetchBudgets()
      refetchSingleBudget()
      refetchPeriod()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("finance.budgets.mobile.toastActionFailed"),
        message:
          err instanceof Error
            ? err.message
            : t("finance.budgets.mobile.toastStatusFailed"),
        type: "error",
      })
    }
  }

  const handleDeleteBudget = () => {
    const budgetId = budget?.id
    if (!budgetId) return
    haptics.warning()
    Alert.alert(
      t("finance.budgets.mobile.menuDelete"),
      t("finance.budgets.mobile.deleteAlertDesc", { name: budget.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: budgetId,
                req: { id: budgetId, version: budget.version },
              })
              haptics.success()
              toast.show({
                title: t("finance.budgets.deletedTitle"),
                message: t("finance.budgets.mobile.toastDeletedDesc", {
                  name: budget.name,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.budgets.deleteFailedTitle"),
                message:
                  err?.message || t("finance.budgets.mobile.toastDeleteFailed"),
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
        text: t("finance.budgets.pauseBudget"),
        onPress: () => handleUpdateStatus("PAUSED", "paused"),
      })
      options.push({
        text: t("finance.budgets.closeBudget"),
        style: "destructive",
        onPress: () => handleUpdateStatus("CLOSED", "closed"),
      })
    } else if (currentStatus === "PAUSED") {
      options.push({
        text: t("finance.budgets.resumeBudget"),
        onPress: () => handleUpdateStatus("ACTIVE", "resumed"),
      })
      options.push({
        text: t("finance.budgets.closeBudget"),
        style: "destructive",
        onPress: () => handleUpdateStatus("CLOSED", "closed"),
      })
    } else if (currentStatus === "CLOSED") {
      options.push({
        text: t("finance.budgets.reopenBudget"),
        onPress: () => handleUpdateStatus("ACTIVE", "reopened"),
      })
    }

    options.push({ text: t("common.cancel"), style: "cancel" })

    Alert.alert(
      t("finance.budgets.mobile.manageStatus"),
      t("finance.budgets.mobile.manageStatusCurrent", {
        status: currentStatus,
      }),
      options
    )
  }

  // Stepping historical periods
  const handleStepPeriod = (step: -1 | 1) => {
    haptics.selection()
    const base = selectedDate || tz.now()
    const parts = tz.parts(base)
    if (!parts) return
    const interval = budget?.interval || "MONTHLY"

    let next: Date
    if (interval === "WEEKLY") {
      next = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day + step * 7, 12, 0, 0)
      )
    } else if (interval === "YEARLY") {
      next = new Date(
        Date.UTC(parts.year + step, parts.month - 1, parts.day, 12, 0, 0)
      )
    } else {
      next = new Date(
        Date.UTC(parts.year, parts.month - 1 + step, parts.day, 12, 0, 0)
      )
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!budget) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={colors.destructive} />
        <Text style={styles.errorTitle}>
          {t("finance.budgets.mobile.notFoundTitle")}
        </Text>
        <Text style={styles.errorSubtitle}>
          {t("finance.budgets.mobile.notFoundSubtitle")}
        </Text>
        <TouchableOpacity
          style={styles.backToBudgetsBtn}
          onPress={() => router.replace("/(app)/finance/budgets")}
          activeOpacity={0.7}
        >
          <Text style={styles.backToBudgetsText}>
            {t("finance.budgets.mobile.backToBudgets")}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  const nativeColors = getBudgetColors(budget.color || "indigo")
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

  const daysLeft = calculateDaysLeft(currentPeriod?.endDate, tz)
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
      ? t("finance.budgets.mobile.lifetimeAllocation")
      : startStr && endStr
        ? `${startStr} - ${endStr}`
        : t("finance.budgets.mobile.currentPeriod")

  const barColor = isOver
    ? colors.destructive
    : isNearLimit
      ? colors.warning
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
                    {getLocalizedIntervalLabel(budget.interval, locale)}
                  </Text>
                </View>

                {/* Default account badge */}
                {defaultAccount ? (
                  <View style={styles.accountBadge}>
                    <CreditCard size={11} color={colors.textMuted} />
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
                        backgroundColor: colors.destructiveSubtle,
                        borderColor: "rgba(239, 68, 68, 0.3)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.intervalBadgeText,
                        { color: colors.destructive },
                      ]}
                    >
                      {t("finance.budgets.mobile.badgeClosed")}
                    </Text>
                  </View>
                ) : budget.status === "PAUSED" ? (
                  <View
                    style={[
                      styles.intervalBadge,
                      {
                        backgroundColor: colors.warningSubtle,
                        borderColor: "rgba(245, 158, 11, 0.3)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.intervalBadgeText,
                        { color: colors.warning },
                      ]}
                    >
                      {t("finance.budgets.mobile.badgePaused")}
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
                ? colors.destructiveSubtle
                : isNearLimit
                  ? colors.warningSubtle
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
                ? colors.destructive
                : isNearLimit
                  ? colors.warning
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
              <ChevronLeft size={16} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.periodLabelGroup}>
              <Calendar size={13} color={colors.textMuted} />
              <Text style={styles.periodRangeText}>{dateRangeStr}</Text>
            </View>

            <TouchableOpacity
              onPress={() => handleStepPeriod(1)}
              style={styles.periodNavArrow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronRight size={16} color={colors.textPrimary} />
            </TouchableOpacity>

            {isHistorical ? (
              <TouchableOpacity
                onPress={handleResetCurrent}
                style={styles.periodResetBadge}
                activeOpacity={0.7}
              >
                <Text style={styles.periodResetText}>
                  {t("finance.budgets.mobile.periodResetCurrent")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.periodLabelGroup}>
            <Calendar size={13} color={colors.textMuted} />
            <Text style={styles.periodRangeText}>{dateRangeStr}</Text>
          </View>
        )}

        {/* Missing Exchange Rate Warning Banner */}
        {isRateMissing ? (
          <View style={styles.exchangeRateWarning}>
            <AlertTriangle size={14} color={colors.warning} />
            <Text style={styles.exchangeRateWarningText}>
              {t("finance.budgets.mobile.rateRequiredInline", {
                from: budget.currency,
                to: baseCurrency,
              })}
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
              {t("finance.budgets.mobile.limitSpentStrip", {
                limit: formatAmount(limitInBaseCents, baseCurrency),
                spent: formatAmount(spentInBaseCents, baseCurrency),
              })}
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
            <Text style={styles.metricLabel}>
              {t("finance.budgets.thSpent")}
            </Text>
            <Text
              style={[
                styles.metricValue,
                isOver && { color: colors.destructive },
              ]}
            >
              {formatAmount(String(spentCents), budget.currency)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>
              {t("finance.budgets.thLimit")}
            </Text>
            <Text style={styles.metricValue}>
              {formatAmount(budget.limitAmount, budget.currency)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>
              {isOver
                ? t("finance.budgets.progress.overBudget")
                : t("finance.budgets.progress.remaining")}
            </Text>
            <Text
              style={[
                styles.metricValue,
                isOver
                  ? { color: colors.destructive }
                  : { color: colors.success },
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
            color={isOver ? colors.warning : colors.primary}
          />
          <Text style={styles.allowanceText}>
            {isOver ? (
              <Text>{t("finance.budgets.mobile.limitExceeded")}</Text>
            ) : (
              <Text>
                {t("finance.budgets.mobile.dailyAllowanceLabel")}{" "}
                <Text style={styles.allowanceBold}>
                  {formatAmount(String(dailyAllowanceCents), budget.currency)}{" "}
                  {t("finance.budgets.mobile.perDay")}
                </Text>{" "}
                {t("finance.budgets.mobile.allowanceDaysLeft", {
                  days: daysLeft,
                  unit:
                    daysLeft === 1
                      ? t("finance.budgets.mobile.daysUnitOne")
                      : t("finance.budgets.mobile.daysUnitMany"),
                })}
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
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
            {t("finance.budgets.mobile.addExpense")}
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
          <Edit3 size={16} color={colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            {t("common.edit")}
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
              <Unlock size={16} color={colors.success} />
              <Text
                style={[
                  styles.actionBtnSecondaryText,
                  { color: colors.success },
                ]}
                numberOfLines={1}
              >
                {t("finance.budgets.mobile.actionReopen")}
              </Text>
            </>
          ) : budget.status === "PAUSED" ? (
            <>
              <Play size={16} color={colors.primary} />
              <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
                {t("finance.budgets.mobile.actionResume")}
              </Text>
            </>
          ) : (
            <>
              <Pause size={16} color={colors.textMuted} />
              <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
                {t("finance.budgets.mobile.actionStatus")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        {t("finance.budgets.mobile.transactionsN", {
          count: periodTransactions.length,
        })}
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: budget.name,
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "menu",
                    label: t("finance.budgets.mobile.menuActions"),
                    icon: { type: "sfSymbol", name: "ellipsis" },
                    menu: {
                      title: budget.name,
                      items: [
                        ...(budget.status === "ACTIVE" || !budget.status
                          ? [
                              {
                                type: "action" as const,
                                label: t("finance.budgets.recordExpense"),
                                icon: {
                                  type: "sfSymbol" as const,
                                  name: "plus.circle" as const,
                                },
                                onPress: () => {
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
                                },
                              },
                            ]
                          : []),
                        ...(budget.status === "PAUSED"
                          ? [
                              {
                                type: "action" as const,
                                label: t("finance.budgets.resumeBudget"),
                                icon: {
                                  type: "sfSymbol" as const,
                                  name: "play.circle" as const,
                                },
                                onPress: () =>
                                  handleUpdateStatus("ACTIVE", "resumed"),
                              },
                            ]
                          : budget.status === "CLOSED"
                            ? []
                            : [
                                {
                                  type: "action" as const,
                                  label: t("finance.budgets.pauseBudget"),
                                  icon: {
                                    type: "sfSymbol" as const,
                                    name: "pause.circle" as const,
                                  },
                                  onPress: () =>
                                    handleUpdateStatus("PAUSED", "paused"),
                                },
                              ]),
                        ...(budget.status === "CLOSED"
                          ? [
                              {
                                type: "action" as const,
                                label: t("finance.budgets.reopenBudget"),
                                icon: {
                                  type: "sfSymbol" as const,
                                  name: "arrow.uturn.backward.circle" as const,
                                },
                                onPress: () =>
                                  handleUpdateStatus("ACTIVE", "reopened"),
                              },
                            ]
                          : [
                              {
                                type: "action" as const,
                                label: t("finance.budgets.closeBudget"),
                                icon: {
                                  type: "sfSymbol" as const,
                                  name: "xmark.circle" as const,
                                },
                                onPress: () =>
                                  handleUpdateStatus("CLOSED", "closed"),
                              },
                            ]),
                        {
                          type: "action",
                          label: t("finance.budgets.mobile.menuEdit"),
                          icon: { type: "sfSymbol", name: "pencil" } as const,
                          onPress: () => {
                            haptics.light()
                            router.push({
                              pathname: "/modal/manage-budget",
                              params: { id: budget.id },
                            })
                          },
                        },
                        {
                          type: "action",
                          label: t("finance.budgets.mobile.menuDelete"),
                          icon: { type: "sfSymbol", name: "trash" } as const,
                          destructive: true,
                          onPress: handleDeleteBudget,
                        },
                      ],
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <ActionMenu
                    title={budget.name}
                    colorScheme={resolvedMode}
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
                              title: t("finance.budgets.recordExpense"),
                              image: addExpenseIcon,
                            },
                          ]
                        : []),
                      ...(budget.status === "PAUSED"
                        ? [
                            {
                              id: "resume",
                              title: t("finance.budgets.resumeBudget"),
                              image: resumeIcon,
                            },
                          ]
                        : budget.status === "CLOSED"
                          ? []
                          : [
                              {
                                id: "pause",
                                title: t("finance.budgets.pauseBudget"),
                                image: pauseIcon,
                              },
                            ]),
                      ...(budget.status === "CLOSED"
                        ? [
                            {
                              id: "reopen",
                              title: t("finance.budgets.reopenBudget"),
                              image: reopenIcon,
                            },
                          ]
                        : [
                            {
                              id: "close",
                              title: t("finance.budgets.closeBudget"),
                              image: closeIcon,
                            },
                          ]),
                      {
                        id: "edit",
                        title: t("finance.budgets.mobile.menuEdit"),
                        image: editIcon,
                      },
                      {
                        id: "delete",
                        title: t("finance.budgets.mobile.menuDelete"),
                        image: deleteIcon,
                        attributes: { destructive: true },
                      },
                    ]}
                  >
                    <View style={styles.headerDotsBtn}>
                      <MoreVertical size={20} color={colors.textPrimary} />
                    </View>
                  </ActionMenu>
                ),
              }),
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
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceElevated}
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
                  icon={<ReceiptText size={32} color={colors.textMuted} />}
                  title={
                    isHistorical
                      ? t("finance.budgets.mobile.emptyHistoricalTitle")
                      : t("finance.budgets.mobile.emptyNoExpensesTitle")
                  }
                  description={
                    isHistorical
                      ? t("finance.budgets.mobile.emptyHistoricalDesc")
                      : t("finance.budgets.mobile.emptyNoExpensesDesc")
                  }
                  actionLabel={
                    budget.status === "ACTIVE" || !budget.status
                      ? t("finance.budgets.mobile.addExpense")
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

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: "center" as const,
  },
  backToBudgetsBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  backToBudgetsText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  headerDotsBtn: {
    padding: 6,
    marginRight: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
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
    backgroundColor: t.colors.surfaceElevated,
  },
  heroTopRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  heroLeftGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  budgetName: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: t.colors.textPrimary,
  },
  periodRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flexWrap: "wrap" as const,
    marginTop: 2,
  },
  periodNavControls: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  periodNavArrow: {
    padding: 4,
  },
  periodLabelGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    justifyContent: "center" as const,
  },
  periodRangeText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  periodResetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.primary,
  },
  periodResetText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  accountBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    maxWidth: 120,
  },
  accountBadgeText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  intervalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  intervalBadgeText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  exchangeRateWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  exchangeRateWarningText: {
    fontSize: 12,
    color: t.colors.warning,
    flex: 1,
    lineHeight: 16,
  },
  crossCurrencyStrip: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  crossCurrencyRateText: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: t.colors.textMuted,
  },
  crossCurrencyValuesText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceHighlight,
    marginTop: 14,
    overflow: "hidden" as const,
  },
  progressBar: {
    height: "100%" as const,
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  metricItem: {
    flex: 1,
    alignItems: "center" as const,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: t.colors.border,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    marginTop: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  allowanceBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  allowanceText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    flex: 1,
  },
  allowanceBold: {
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 14,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 12,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.primary,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 12,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  ledgerHeader: {
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
