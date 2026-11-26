import { DetailChart } from "../../../../components/finance/detail-chart"
import { useBudgetAnalytics, useDetailLedger } from "@saturn/hooks/finance"
import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TextInput,
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
  AlertCircle,
  ReceiptText,
  Sparkles,
  Plus,
  PlayCircle,
  Unlock,
  Search,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  MoreVertical,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "../../../../components/ui/action-menu"
import {
  useGetBudgetQuery,
  useGetBudgetPeriodQuery,
  useListAccountsQuery,
  useGetSettingsQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  type Account,
  type Budget_Status,
} from "@saturn/api/saturn/finance/v1/finance"
import { buildCopilotEntityKey, getDaysDiff } from "@saturn/core"
import {
  invalidateFinanceQueries,
  useDebounce,
  useDateSections,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { getLocalizedIntervalLabel, type TranslationKey } from "@saturn/i18n"
import {
  useMobileCopilotView,
  useOptionalMobileCopilotSheet,
} from "../../../../lib/copilot-sheet-context"
import { useSpace } from "../../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../../lib/theme"
import { getBudgetIcon } from "../../../../lib/budget-icons"
import { haptics } from "../../../../lib/haptics"
import { AIHeaderButton } from "../../../../components/app-header"
import { Card } from "../../../../components/ui/card"
import { Badge } from "../../../../components/ui/badge"
import { MonoAmount } from "../../../../components/ui/typography"
import { EmptyState } from "../../../../components/ui/empty-state"
import { SkeletonCard } from "../../../../components/ui/skeleton-loader"
import { TransactionListItem } from "../../../../components/finance/transaction-list-item"
import { DateSectionHeader } from "../../../../components/finance/date-section-header"
import { useToast } from "../../../../components/ui/toast"

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

  // Fetch base currency settings
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const {
    data: budget,
    isLoading: isSingleBudgetLoading,
    refetch: refetchSingleBudget,
  } = useGetBudgetQuery({ id: id || "" }, { enabled: !!id && !!activeSpaceId })
  const today = tz.startOfDay(tz.now()).toISOString()
  const { data: latest } = useGetBudgetPeriodQuery(
    { budgetId: id || "", date: today },
    { enabled: !!id && !!activeSpaceId }
  )
  const { data: currentPeriod, refetch: refetchPeriod } =
    useGetBudgetPeriodQuery(
      { budgetId: id || "", date: selectedDate?.toISOString() || today },
      { enabled: !!id && !!activeSpaceId }
    )
  const isHistorical =
    selectedDate !== null &&
    (!currentPeriod || currentPeriod.startDate !== latest?.startDate)
  const chart = useBudgetAnalytics(
    activeSpaceId || undefined,
    budget,
    currentPeriod,
    latest
  )
  const periodStartDate = currentPeriod?.startDate
  const periodEndDate = currentPeriod?.endDate
  const budgetInterval = budget?.interval
  const isOneTime = budgetInterval === "ONE_TIME"
  const copilotSheet = useOptionalMobileCopilotSheet()

  useMobileCopilotView(
    budget?.id
      ? {
          viewId: "mobile.finance.budget.detail",
          title: budget.name || t("nav.budgets"),
          activeEntity: {
            key: buildCopilotEntityKey("budget", budget.id),
            kind: "budget",
            id: budget.id,
            label: budget.name || t("nav.budgets"),
            summary: {
              currency: budget.currency || baseCurrency,
              limitAmount: budget.limitAmount || "0",
              spentAmount: currentPeriod?.spentAmount || "0",
              interval: budget.interval || "MONTHLY",
            },
          },
          suggestions: [
            t("ai.copilotSheet.suggestBudget"),
            t("finance.budgets.suggestion.pacingAhead"),
            t("finance.budgets.suggestion.adjustments"),
          ],
        }
      : null
  )

  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"transactions" | "analytics">(
    "transactions"
  )
  const debouncedSearch = useDebounce(search, 300)
  const searching = debouncedSearch.trim().length > 0
  const clearSearch = () => {
    haptics.selection()
    setSearch("")
  }
  const ledger = useDetailLedger(
    activeSpaceId || undefined,
    {
      budgetId: id,
      types: ["EXPENSE"],
      searchQuery: debouncedSearch,
      startDate: periodStartDate,
      endDate: periodEndDate,
    },
    !!id && !!periodStartDate && !!periodEndDate
  )
  const { isLoading: isTxnsLoading, refetch: refetchTxns } = ledger
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
    () => ledger.data?.pages.flatMap((p) => p.transactions || []) || [],
    [ledger.data]
  )

  const sections = useDateSections(periodTransactions)

  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
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

  const handleStepPeriod = (step: -1 | 1) => {
    if (step === 1 && !periodEndDate) return handleResetCurrent()
    haptics.selection()
    if (!periodStartDate || !periodEndDate) return
    const next = new Date(
      step < 0
        ? +tz.startOfDay(periodStartDate) - 1
        : +tz.endOfDay(periodEndDate) + 1
    )
    setSelectedDate(next)
  }

  const handleResetCurrent = () => {
    haptics.selection()
    setSelectedDate(null)
  }

  if (isSingleBudgetLoading) {
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
  const Primary =
    budget.status === "PAUSED"
      ? PlayCircle
      : budget.status === "CLOSED"
        ? Unlock
        : Plus
  const BIcon = getBudgetIcon(budget.icon, budget.name)

  const spentCents = Number(
    currentPeriod?.spentAmount ??
      (!isHistorical ? budget.currentPeriod?.spentAmount : 0) ??
      0
  )

  const limitCents = Number(
    currentPeriod?.limitAmount ?? budget.limitAmount ?? 0
  )
  const actualPercentage =
    limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0
  const progressWidth = Math.min(actualPercentage, 100)
  const isOver = spentCents > limitCents
  const isNearLimit = actualPercentage >= 85 && !isOver

  const remainingCents = Math.max(limitCents - spentCents, 0)
  const overCents = Math.max(spentCents - limitCents, 0)

  const daysLeft = (getDaysDiff(currentPeriod?.endDate, tz.timezone) ?? -1) + 1
  const activePeriod =
    !isOneTime &&
    !!currentPeriod &&
    !isHistorical &&
    (!budget.status || budget.status === "ACTIVE") &&
    daysLeft > 0
  const start = periodStartDate ? +tz.startOfDay(periodStartDate) : NaN
  const end = periodEndDate ? +tz.endOfDay(periodEndDate) : NaN
  const elapsed =
    end > start ? (100 * (+tz.now() - start)) / (end - start) : null
  const dailyAllowanceCents =
    !isOver && daysLeft > 0 ? Math.round(remainingCents / daysLeft) : 0

  const dateRangeStr = isOneTime
    ? t("finance.budgets.mobile.lifetimeAllocation")
    : tz.formatDateRange(periodStartDate, periodEndDate)
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
      {budget.interval !== "ONE_TIME" ? (
        <View style={styles.periodNavControls}>
          <TouchableOpacity
            accessibilityLabel={t("finance.detail.previous")}
            onPress={() => handleStepPeriod(-1)}
            style={styles.periodNavArrow}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.periodLabelGroup}>
            <Calendar size={13} color={colors.textMuted} />
            <Text style={styles.periodRangeText} numberOfLines={1}>
              {dateRangeStr}
            </Text>
          </View>

          <TouchableOpacity
            disabled={!isHistorical}
            accessibilityLabel={t("finance.detail.next")}
            onPress={() => handleStepPeriod(1)}
            style={styles.periodNavArrow}
            hitSlop={{
              top: 8,
              bottom: 8,
              left: 8,
              right: isHistorical ? 2 : 8,
            }}
          >
            <ChevronRight
              size={16}
              opacity={isHistorical ? 1 : 0.35}
              color={isHistorical ? colors.textPrimary : colors.textMuted}
            />
          </TouchableOpacity>

          {isHistorical ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleResetCurrent}
              style={styles.periodResetBadge}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              activeOpacity={0.7}
            >
              <Text style={styles.periodResetText} numberOfLines={1}>
                {t("finance.budgets.mobile.periodResetCurrent")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <Card style={styles.heroCard}>
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
              <Text style={styles.metricLabel}>
                {t(
                  isOver
                    ? "finance.budgets.progress.overBudget"
                    : "finance.budgets.mobile.summaryLeftToSpend"
                )}
              </Text>
              <MonoAmount
                size="lg"
                color={isOver ? colors.destructive : colors.textPrimary}
              >
                {tz.formatMoney(
                  isOver ? overCents : remainingCents,
                  budget.currency
                )}
              </MonoAmount>
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
                ? colors.border
                : isNearLimit
                  ? colors.border
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
          {activePeriod && elapsed !== null && (
            <View
              accessibilityLabel={t("common.today")}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: 2,
                left: `${Math.min(99, Math.max(0, elapsed))}%`,
                backgroundColor: colors.textPrimary,
              }}
            />
          )}
        </View>
        <View style={styles.periodRow}>
          <MonoAmount size="sm">
            {t("finance.budgets.mobile.summarySpentOfLimit", {
              spent: tz.formatMoney(spentCents, budget.currency),
              limit: tz.formatMoney(limitCents, budget.currency),
            })}
          </MonoAmount>
          <Text style={styles.metaText}>
            {[
              isOneTime
                ? dateRangeStr
                : getLocalizedIntervalLabel(budget.interval, locale),
              defaultAccount?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {(budget.status === "CLOSED" || budget.status === "PAUSED") && (
            <Badge
              label={t(
                budget.status === "CLOSED"
                  ? "finance.budgets.mobile.badgeClosed"
                  : "finance.budgets.mobile.badgePaused"
              )}
            />
          )}
        </View>
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

        {isCrossCurrency && rateToBase > 0 && (
          <Text style={styles.metaText}>
            ≈{" "}
            {t("finance.budgets.mobile.summarySpentOfLimit", {
              spent: tz.formatMoney(spentInBaseCents, baseCurrency),
              limit: tz.formatMoney(limitInBaseCents, baseCurrency),
            })}{" "}
            · 1 {budget.currency} ={" "}
            {rateToBase.toLocaleString(locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}{" "}
            {baseCurrency}
          </Text>
        )}

        {/* Daily Allowance Banner */}
        {activePeriod ? (
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
                    {tz.formatMoney(
                      String(dailyAllowanceCents),
                      budget.currency
                    )}{" "}
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
        ) : isHistorical && currentPeriod ? (
          <View style={styles.allowanceBanner}>
            {isOver ? (
              <AlertTriangle size={14} color={colors.destructive} />
            ) : (
              <CheckCircle2 size={14} color={colors.success} />
            )}
            <Text style={styles.allowanceText}>
              {t(isOver ? "finance.detail.over" : "finance.detail.under", {
                amount: tz.formatMoney(
                  Math.abs(limitCents - spentCents),
                  budget.currency
                ),
              })}
            </Text>
          </View>
        ) : null}
      </Card>
      <TouchableOpacity
        style={styles.actionBtnPrimary}
        onPress={() => {
          haptics.light()
          if (budget.status === "PAUSED" || budget.status === "CLOSED") {
            void handleUpdateStatus(
              "ACTIVE",
              budget.status === "PAUSED" ? "resumed" : "reopened"
            )
            return
          }
          router.push({
            pathname: "/modal/add-transaction",
            params: {
              type: "EXPENSE",
              budgetId: budget.id,
              accountId: budget.defaultAccountId,
            },
          })
        }}
      >
        <Primary size={16} color={colors.primaryForeground} />
        <Text style={styles.actionBtnPrimaryText}>
          {t(
            budget.status === "PAUSED"
              ? "finance.budgets.resumeBudget"
              : budget.status === "CLOSED"
                ? "finance.budgets.reopenBudget"
                : "finance.budgets.mobile.addExpense"
          )}
        </Text>
      </TouchableOpacity>
      <View style={styles.underlineTabBar} accessibilityRole="tablist">
        {(
          [
            ["transactions", t("nav.transactions")],
            ["analytics", t("finance.detail.analytics")],
          ] as const
        ).map(([tabKey, tabLabel]) => {
          const isSelected = activeTab === tabKey
          return (
            <TouchableOpacity
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              activeOpacity={0.75}
              style={[
                styles.underlineTab,
                isSelected && styles.underlineTabSelected,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab(tabKey)
              }}
            >
              <Text
                style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}
                numberOfLines={1}
              >
                {tabLabel}
              </Text>
              {tabKey === "transactions" && !isTxnsLoading && (
                <View
                  style={[
                    styles.tabCountBadge,
                    isSelected && styles.tabCountBadgeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isSelected && styles.tabCountTextSelected,
                    ]}
                  >
                    {`${periodTransactions.length}${ledger.hasNextPage ? "+" : ""}`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
      {activeTab === "transactions" ? (
        <View style={styles.searchBar}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("finance.detail.search")}
            accessibilityLabel={t("finance.detail.search")}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("finance.transactions.clearSearchAria")}
              onPress={clearSearch}
              style={styles.clearSearchBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={styles.metricsGrid}>
            {(
              [
                [t("finance.budgets.thSpent"), spentCents],
                [t("finance.budgets.thLimit"), limitCents],
                [
                  t(
                    isOver
                      ? "finance.budgets.progress.overBudget"
                      : "finance.budgets.progress.remaining"
                  ),
                  isOver ? overCents : remainingCents,
                ],
              ] as const
            ).map(([label, cents]) => (
              <View key={label} style={styles.metricItem}>
                <Text style={styles.metricLabel}>{label}</Text>
                <MonoAmount size="sm">
                  {tz.formatMoney(cents, budget.currency)}
                </MonoAmount>
              </View>
            ))}
          </View>
          {(chart.query.isLoading ||
            (!isOneTime && chart.history.isLoading)) && (
            <SkeletonCard height={120} />
          )}
          {(chart.query.isError || (!isOneTime && chart.history.isError)) && (
            <Text style={styles.metaText}>{t("finance.detail.error")}</Text>
          )}
          {chart.query.isSuccess && chart.burn.length === 0 && (
            <Text style={styles.metaText}>
              {t(
                isHistorical
                  ? "finance.budgets.mobile.emptyHistoricalTitle"
                  : "finance.budgets.mobile.emptyNoExpensesTitle"
              )}
            </Text>
          )}
          {chart.query.isSuccess && chart.burn.length > 0 && (
            <DetailChart
              title={t("finance.detail.burn")}
              valueLabel={t("finance.budgets.thSpent")}
              comparisonLabel={t("finance.detail.ideal")}
              ceilingLabel={t("finance.budgets.thLimit")}
              points={chart.burn}
              currency={budget.currency}
              accent={nativeColors.bar}
            />
          )}
          {!isOneTime &&
            chart.history.isSuccess &&
            chart.periods.length > 0 && (
              <DetailChart
                title={t("finance.detail.history")}
                valueLabel={t("finance.budgets.thSpent")}
                ceilingLabel={t("finance.budgets.thLimit")}
                activeDate={currentPeriod?.startDate}
                points={chart.periods}
                currency={budget.currency}
                bars
                onSelect={(d) => setSelectedDate(tz.startOfDay(d))}
                accent={nativeColors.bar}
              />
            )}
        </>
      )}
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
                  {
                    type: "button",
                    label: t("menu.aiAssistant"),
                    icon: { type: "sfSymbol", name: "sparkles" },
                    tintColor: colors.primary,
                    sharesBackground: false,
                    onPress: () => {
                      haptics.light()
                      copilotSheet?.openCopilotSheet()
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <View style={styles.headerRightRow}>
                    <ActionMenu
                      title={budget.name}
                      colorScheme={resolvedMode}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "pause") {
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
                    <AIHeaderButton testID="budget-detail-header-ai" />
                  </View>
                ),
              }),
        }}
      />

      <View style={styles.container}>
        <SectionList
          keyboardShouldPersistTaps="handled"
          sections={activeTab === "transactions" ? sections : []}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader()}
          onEndReached={() => {
            if (
              activeTab === "transactions" &&
              ledger.hasNextPage &&
              !ledger.isFetchingNextPage
            )
              void ledger.fetchNextPage()
          }}
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
          renderSectionHeader={({ section }) => {
            const currency = section.data.every(
              (tx) => (tx.currency || baseCurrency) === budget.currency
            )
              ? budget.currency
              : baseCurrency
            const cents = section.data.reduce(
              (sum, tx) =>
                sum +
                Math.abs(
                  Number(
                    (tx.currency || baseCurrency) === currency
                      ? tx.amount
                      : tx.amountInBase || NaN
                  )
                ),
              0
            )
            return (
              <DateSectionHeader
                insetHorizontal
                title={section.title}
                rightContent={
                  Number.isFinite(cents) && (
                    <MonoAmount size="sm" color={colors.destructive}>
                      {tz.formatMoney(-cents, currency)}
                    </MonoAmount>
                  )
                }
              />
            )
          }}
          renderItem={({ item, index, section }) => (
            <TransactionListItem
              item={item}
              showDate={false}
              showBudget={false}
              showBorderBottom={index < section.data.length - 1}
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
          ListFooterComponent={
            activeTab === "transactions" && ledger.isFetchingNextPage ? (
              <ActivityIndicator
                style={{ padding: 16 }}
                color={colors.primary}
              />
            ) : undefined
          }
          ListEmptyComponent={
            activeTab === "analytics" ? undefined : isTxnsLoading ? (
              <View style={{ gap: 8, paddingHorizontal: 16 }}>
                <SkeletonCard height={60} />
                <SkeletonCard height={60} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon={<ReceiptText size={32} color={colors.textMuted} />}
                  title={
                    searching
                      ? t("finance.transactions.noMatches")
                      : isHistorical
                        ? t("finance.budgets.mobile.emptyHistoricalTitle")
                        : t("finance.budgets.mobile.emptyNoExpensesTitle")
                  }
                  description={
                    searching
                      ? t("finance.transactions.noMatchingDescription")
                      : isHistorical
                        ? t("finance.budgets.mobile.emptyHistoricalDesc")
                        : t("finance.budgets.mobile.emptyNoExpensesDesc")
                  }
                  actionLabel={
                    searching
                      ? t("finance.transactions.clearSearchAria")
                      : budget.status === "ACTIVE" || !budget.status
                        ? t("finance.budgets.mobile.addExpense")
                        : undefined
                  }
                  onAction={
                    searching
                      ? clearSearch
                      : budget.status === "ACTIVE" || !budget.status
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
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  backToBudgetsText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  headerRightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  headerDotsBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerSection: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroCard: {
    padding: 14,
    gap: 10,
    borderRadius: t.radius.lg,
    borderColor: t.colors.border,
    borderWidth: 1,
    backgroundColor: t.colors.surface,
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
    width: 38,
    height: 38,
    borderRadius: t.radius.md,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  metaText: { fontSize: 12, color: t.colors.textMuted },
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
    minHeight: 42,
    paddingHorizontal: 4,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
  },
  periodNavArrow: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  periodLabelGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    minWidth: 0,
    justifyContent: "center" as const,
  },
  periodRangeText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  periodResetBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 4,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.primary,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    flexShrink: 0,
  },
  periodResetText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  exchangeRateWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  exchangeRateWarningText: {
    fontSize: 12,
    color: t.colors.warning,
    flex: 1,
    lineHeight: 16,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceHighlight,
  },
  progressBar: {
    height: "100%" as const,
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: "center" as const,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  allowanceBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
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
  underlineTabBar: {
    flexDirection: "row" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    gap: 20,
  },
  underlineTab: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  underlineTabSelected: {
    borderBottomColor: t.colors.primary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  tabLabelSelected: {
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
  },
  tabCountBadgeSelected: {
    backgroundColor: t.colors.primarySubtle,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    fontVariant: ["tabular-nums" as const],
  },
  tabCountTextSelected: {
    color: t.colors.primary,
  },
  searchBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textPrimary,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  actionBtnPrimary: {
    minHeight: 44,
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
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
