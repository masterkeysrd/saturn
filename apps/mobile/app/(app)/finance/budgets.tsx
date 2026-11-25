import { useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput as RNTextInput,
  Alert,
  Platform,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  PiggyBank,
  Plus,
  Search,
  X,
  AlertTriangle,
  MoreVertical,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "../../../components/ui/action-menu"
import { convertCentsToBase, formatAmount, parseDate } from "@saturn/core"
import {
  useListBudgetsQuery,
  useGetSettingsQuery,
  useListAccountsQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  type Budget,
  type Budget_Status,
  type Account,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  invalidateFinanceQueries,
  useCurrencyConversionPreview,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { getLocalizedIntervalLabel, type TranslationKey } from "@saturn/i18n"
import {
  useMobileCopilotView,
  useOptionalMobileCopilotSheet,
} from "../../../lib/copilot-sheet-context"
import { useSpace } from "../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../lib/theme"
import { BudgetCategoryIcon } from "../../../lib/budget-icons"
import { AIHeaderButton } from "../../../components/app-header"
import { Card } from "../../../components/ui/card"
import { MonoAmount } from "../../../components/ui/typography"
import { SkeletonCard } from "../../../components/ui/skeleton-loader"
import { EmptyState } from "../../../components/ui/empty-state"
import { QuickCaptureFab } from "../../../components/ui/quick-capture-sheet"
import { useToast } from "../../../components/ui/toast"
import { haptics } from "../../../lib/haptics"

const detailsIcon = Icon.select({
  ios: "info.circle",
  android: require("@expo/material-symbols/info.xml"),
})

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

type BudgetStatusAction = "Paused" | "Resumed" | "Closed" | "Reopened"

const STATUS_ACTION_KEYS: Record<BudgetStatusAction, TranslationKey> = {
  Paused: "finance.budgets.mobile.statusAction.Paused",
  Resumed: "finance.budgets.mobile.statusAction.Resumed",
  Closed: "finance.budgets.mobile.statusAction.Closed",
  Reopened: "finance.budgets.mobile.statusAction.Reopened",
}

export function computeBudgetPacePercent(
  budget: Budget,
  now: Date
): number | null {
  if (budget.interval === "ONE_TIME" || budget.status === "CLOSED") {
    return null
  }
  const period = budget.currentPeriod
  if (!period?.startDate || !period?.endDate) {
    return null
  }
  const startMs = new Date(period.startDate).getTime()
  const endMs = new Date(period.endDate).getTime()
  const totalMs = endMs - startMs
  if (isNaN(startMs) || isNaN(endMs) || totalMs <= 0) {
    return null
  }
  const raw = ((now.getTime() - startMs) / totalMs) * 100
  return Math.min(Math.max(raw, 0), 100)
}

export default function BudgetsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { colors, resolvedMode, isDark, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<
    "ACTIVE" | "PAUSED" | "CLOSED" | "ALL"
  >("ACTIVE")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const copilotSheet = useOptionalMobileCopilotSheet()

  useMobileCopilotView({
    viewId: "mobile.finance.budgets",
    title: t("nav.budgets"),
    suggestions: [
      t("finance.budgets.suggestion.pacingAhead"),
      t("finance.budgets.suggestion.activeLimits"),
      t("finance.budgets.suggestion.adjustments"),
    ],
  })

  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { exchangeRates } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

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

  const {
    data: budgetsData,
    isLoading,
    refetch,
  } = useListBudgetsQuery(
    {
      pageSize: 100,
      pageToken: "",
      view: "FULL",
      statuses: ["ACTIVE", "PAUSED", "CLOSED"],
    },
    { enabled: !!activeSpaceId }
  )

  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )

  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const statusCounts = useMemo(() => {
    let active = 0
    let paused = 0
    let closed = 0
    for (const b of budgets) {
      if (b.status === "PAUSED") paused++
      else if (b.status === "CLOSED") closed++
      else active++
    }
    return { active, paused, closed, all: budgets.length }
  }, [budgets])

  const summaryStats = useMemo(() => {
    const now = tz.now()
    let totalLimitBaseCents = 0
    let totalSpentBaseCents = 0
    let activeBudgetsCount = 0
    let onTrackCount = 0
    let aheadOfPaceCount = 0
    let weightedPaceSum = 0
    let paceWeightTotal = 0

    for (const b of budgets) {
      const isActive = b.status === "ACTIVE" || !b.status
      if (!isActive) continue
      activeBudgetsCount++

      const limitBase = b.currentPeriod?.limitInBase
        ? Number(b.currentPeriod.limitInBase)
        : convertCentsToBase(
            b.limitAmount,
            b.currency,
            baseCurrency,
            exchangeRates
          )

      const spentBase = b.currentPeriod?.spentInBase
        ? Number(b.currentPeriod.spentInBase)
        : convertCentsToBase(
            b.currentPeriod?.spentAmount || 0,
            b.currency,
            baseCurrency,
            exchangeRates
          )

      totalLimitBaseCents += limitBase
      totalSpentBaseCents += spentBase

      const limitLocal = Number(b.limitAmount || "0")
      const spentLocal = Number(b.currentPeriod?.spentAmount || "0")
      const actualLocalPct =
        limitLocal > 0 ? (spentLocal / limitLocal) * 100 : 0
      const pacePct = computeBudgetPacePercent(b, now)

      if (
        (limitLocal > 0 && spentLocal > limitLocal) ||
        (pacePct !== null && actualLocalPct - pacePct > 5)
      ) {
        aheadOfPaceCount++
      } else {
        onTrackCount++
      }

      if (pacePct !== null) {
        const weight = limitBase > 0 ? limitBase : 1
        weightedPaceSum += pacePct * weight
        paceWeightTotal += weight
      }
    }

    const isOver =
      totalLimitBaseCents > 0 && totalSpentBaseCents > totalLimitBaseCents
    const remainingBaseCents = Math.max(
      totalLimitBaseCents - totalSpentBaseCents,
      0
    )
    const overBaseCents = Math.max(totalSpentBaseCents - totalLimitBaseCents, 0)
    const overallUtilization =
      totalLimitBaseCents > 0
        ? Math.min(
            100,
            Math.round((totalSpentBaseCents / totalLimitBaseCents) * 100)
          )
        : 0
    const isWarning = !isOver && overallUtilization >= 85
    const aggregatePacePercent =
      paceWeightTotal > 0 ? weightedPaceSum / paceWeightTotal : null

    return {
      totalLimitBaseCents,
      totalSpentBaseCents,
      remainingBaseCents,
      overBaseCents,
      isOver,
      isWarning,
      overallUtilization,
      activeBudgetsCount,
      onTrackCount,
      aheadOfPaceCount,
      aggregatePacePercent,
    }
  }, [budgets, baseCurrency, exchangeRates, tz])

  const filteredBudgets = useMemo(() => {
    const byStatus = budgets.filter((b) => {
      if (statusFilter === "ALL") return true
      if (statusFilter === "ACTIVE") return b.status === "ACTIVE" || !b.status
      return b.status === statusFilter
    })

    if (!searchQuery.trim()) return byStatus
    const q = searchQuery.toLowerCase().trim()
    return byStatus.filter((b) => {
      const matchName = b.name.toLowerCase().includes(q)
      const matchCurrency = b.currency?.toLowerCase().includes(q)
      const accountName = b.defaultAccountId
        ? accountsMap.get(b.defaultAccountId)?.name?.toLowerCase()
        : ""
      const matchAccount = accountName?.includes(q)
      return matchName || matchCurrency || matchAccount
    })
  }, [budgets, statusFilter, searchQuery, accountsMap])

  const isSearchVisible = searchOpen || searchQuery.trim().length > 0

  const toggleSearch = () => {
    haptics.selection()
    if (isSearchVisible) {
      setSearchOpen(false)
      setSearchQuery("")
    } else {
      setSearchOpen(true)
    }
  }

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
      await invalidateFinanceQueries(queryClient)
    } finally {
      setRefreshing(false)
    }
  }

  const handleUpdateStatus = async (
    b: Budget,
    newStatus: Budget_Status,
    actionLabel: BudgetStatusAction
  ) => {
    if (!b.id) return
    haptics.medium()
    try {
      await updateMutation.mutateAsync({
        id: b.id,
        req: {
          id: b.id,
          version: b.version,
          budget: {
            ...b,
            status: newStatus,
          },
          propagation: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
          updateMask: { paths: ["status"] },
        },
      })
      haptics.success()
      toast.show({
        title: t("finance.budgets.mobile.toastStatusTitle", {
          action: t(STATUS_ACTION_KEYS[actionLabel]),
        }),
        message: t("finance.budgets.mobile.toastStatusDesc", {
          name: b.name,
          action: t(STATUS_ACTION_KEYS[actionLabel]),
        }),
        type: "success",
      })
      await invalidateFinanceQueries(queryClient)
      refetch()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("finance.budgets.mobile.toastActionFailed"),
        message: err?.message || t("finance.budgets.mobile.toastStatusFailed"),
        type: "error",
      })
    }
  }

  const handleDeleteBudget = (b: Budget) => {
    const budgetId = b.id
    if (!budgetId) return
    haptics.warning()
    Alert.alert(
      t("finance.budgets.mobile.menuDelete"),
      t("finance.budgets.mobile.deleteAlertDesc", { name: b.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: budgetId,
                req: { id: budgetId, version: b.version },
              })
              haptics.success()
              toast.show({
                title: t("finance.budgets.deletedTitle"),
                message: t("finance.budgets.mobile.toastDeletedDesc", {
                  name: b.name,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              refetch()
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

  const now = tz.now()

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: t("nav.budgets"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: t("finance.budgets.mobile.searchToggleAria"),
                    icon: {
                      type: "sfSymbol",
                      name: isSearchVisible ? "xmark" : "magnifyingglass",
                    },
                    tintColor: isSearchVisible
                      ? colors.primary
                      : colors.textPrimary,
                    onPress: toggleSearch,
                  },
                  {
                    type: "button",
                    label: t("finance.budgets.mobile.menuNew"),
                    icon: { type: "sfSymbol", name: "plus" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push("/modal/manage-budget")
                    },
                  },
                  {
                    type: "button",
                    label: t("menu.aiAssistant"),
                    icon: { type: "sfSymbol", name: "sparkles" },
                    tintColor: colors.primary,
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
                    <TouchableOpacity
                      testID="budgets-search-toggle"
                      accessibilityLabel={t(
                        "finance.budgets.mobile.searchToggleAria"
                      )}
                      onPress={toggleSearch}
                      style={styles.headerIconBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {isSearchVisible ? (
                        <X size={20} color={colors.primary} />
                      ) : (
                        <Search size={20} color={colors.textPrimary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="budgets-header-add"
                      accessibilityLabel={t("finance.budgets.mobile.menuNew")}
                      onPress={() => {
                        haptics.light()
                        router.push("/modal/manage-budget")
                      }}
                      style={styles.headerIconBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Plus size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <AIHeaderButton testID="budgets-header-ai" />
                  </View>
                ),
              }),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      >
        {/* 1. Hero Summary Card (Always reflects active period workspace totals in baseCurrency) */}
        <Card style={styles.summaryCard} testID="budgets-hero-summary">
          <View style={styles.summaryHeroRow}>
            <View style={styles.summaryHeroMain}>
              <Text style={styles.summaryLabel}>
                {summaryStats.isOver
                  ? t("finance.budgets.progress.overBudget")
                  : t("finance.budgets.mobile.summaryLeftToSpend")}
              </Text>
              <MonoAmount
                size="lg"
                color={
                  summaryStats.isOver ? colors.destructive : colors.textPrimary
                }
                testID="budgets-hero-amount"
              >
                {summaryStats.isOver
                  ? t("finance.budgets.mobile.amountOver", {
                      amount: formatAmount(
                        summaryStats.overBaseCents,
                        baseCurrency
                      ),
                    })
                  : formatAmount(summaryStats.remainingBaseCents, baseCurrency)}
              </MonoAmount>
            </View>
            <Text style={styles.summaryOfLimitText} numberOfLines={1}>
              {t("finance.budgets.mobile.summarySpentOfLimit", {
                spent: formatAmount(
                  summaryStats.totalSpentBaseCents,
                  baseCurrency
                ),
                limit: formatAmount(
                  summaryStats.totalLimitBaseCents,
                  baseCurrency
                ),
              })}
            </Text>
          </View>

          <View style={styles.summaryProgressWrap}>
            <View style={styles.summaryProgressTrack}>
              <View
                style={[
                  styles.summaryProgressBar,
                  {
                    width: `${summaryStats.overallUtilization}%`,
                    backgroundColor: summaryStats.isOver
                      ? colors.destructive
                      : summaryStats.isWarning
                        ? colors.warning
                        : colors.primary,
                  },
                ]}
              />
            </View>
            {summaryStats.aggregatePacePercent !== null ? (
              <View
                testID="summary-pace-tick"
                accessibilityLabel={t("finance.budgets.paceTick", {
                  pct: Math.round(summaryStats.aggregatePacePercent),
                })}
                style={[
                  styles.paceTickSummary,
                  { left: `${summaryStats.aggregatePacePercent}%` },
                ]}
              />
            ) : null}
          </View>

          {summaryStats.activeBudgetsCount > 0 ? (
            <Text style={styles.summaryPaceText} numberOfLines={1}>
              {summaryStats.aheadOfPaceCount > 0
                ? t("finance.budgets.mobile.summaryPaceSummary", {
                    onTrack: summaryStats.onTrackCount,
                    ahead: summaryStats.aheadOfPaceCount,
                  })
                : t("finance.budgets.mobile.summaryOnTrackOnly", {
                    count: summaryStats.onTrackCount,
                  })}
            </Text>
          ) : null}
        </Card>

        {/* 2. Compact Status Filter Pills + Optional Inline Search Toggle */}
        <View style={styles.filterToolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                {
                  key: "ACTIVE",
                  label: `${t("finance.budgets.mobile.filterActive")} (${statusCounts.active})`,
                },
                {
                  key: "PAUSED",
                  label:
                    statusCounts.paused > 0
                      ? `${t("finance.budgets.mobile.filterPaused")} (${statusCounts.paused})`
                      : t("finance.budgets.mobile.filterPaused"),
                },
                {
                  key: "CLOSED",
                  label:
                    statusCounts.closed > 0
                      ? `${t("finance.budgets.mobile.filterClosed")} (${statusCounts.closed})`
                      : t("finance.budgets.mobile.filterClosed"),
                },
                {
                  key: "ALL",
                  label: t("common.all"),
                },
              ] as const
            ).map((filter) => {
              const isSelected = statusFilter === filter.key
              return (
                <TouchableOpacity
                  key={filter.key}
                  testID={`budgets-filter-${filter.key.toLowerCase()}`}
                  style={[
                    styles.filterPill,
                    isSelected && styles.filterPillActive,
                  ]}
                  onPress={() => {
                    haptics.selection()
                    setStatusFilter(filter.key)
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      isSelected && styles.filterPillTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <TouchableOpacity
            testID="budgets-inline-search-toggle"
            accessibilityLabel={t("finance.budgets.mobile.searchToggleAria")}
            style={[
              styles.inlineSearchBtn,
              isSearchVisible && styles.inlineSearchBtnActive,
            ]}
            onPress={toggleSearch}
            activeOpacity={0.7}
          >
            {isSearchVisible ? (
              <X size={15} color={colors.primary} />
            ) : (
              <Search size={15} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        {isSearchVisible ? (
          <View style={styles.searchBar} testID="budgets-search-bar">
            <Search size={15} color={colors.textMuted} />
            <RNTextInput
              style={styles.searchInput}
              placeholder={t("finance.budgets.mobile.searchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={searchOpen}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* 3. Budgets List or Actionable Empty State */}
        {isLoading ? (
          <View style={styles.skeletonStack}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : filteredBudgets.length === 0 ? (
          <EmptyState
            icon={<PiggyBank size={28} color={colors.textMuted} />}
            title={
              budgets.length === 0
                ? t("finance.budgets.mobile.emptyNone")
                : t("finance.budgets.mobile.emptyNoMatch")
            }
            description={
              budgets.length === 0
                ? t("finance.budgets.mobile.emptyNoneDesc")
                : searchQuery.trim()
                  ? t("finance.budgets.mobile.emptyNoMatchDesc", {
                      query: searchQuery,
                    })
                  : t("finance.budgets.mobile.emptyNoneDesc")
            }
            actionLabel={
              budgets.length === 0
                ? t("finance.budgets.mobile.createSubmit")
                : t("finance.budgets.mobile.clearFilters")
            }
            onAction={() => {
              haptics.light()
              if (budgets.length === 0) {
                router.push("/modal/manage-budget")
              } else {
                setSearchQuery("")
                setSearchOpen(false)
                setStatusFilter(statusFilter === "ACTIVE" ? "ALL" : "ACTIVE")
              }
            }}
          />
        ) : (
          <View style={styles.budgetList}>
            {filteredBudgets.map((b: Budget) => {
              const nativeColors = getBudgetColors(b.color || "indigo")

              const spentCents = Number(b.currentPeriod?.spentAmount || "0")
              const limitCents = Number(b.limitAmount || "0")
              const actualPercentage =
                limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0
              const progressWidth = Math.min(actualPercentage, 100)
              const isOver = limitCents > 0 && spentCents > limitCents
              const isNearLimit = !isOver && actualPercentage >= 85

              const remainingCents = Math.max(limitCents - spentCents, 0)
              const overCents = Math.max(spentCents - limitCents, 0)

              const endParsed = b.currentPeriod?.endDate
                ? parseDate(b.currentPeriod.endDate)
                : null
              let daysLeft = 1
              if (endParsed) {
                const diff = tz.endOfDay(endParsed).getTime() - now.getTime()
                daysLeft = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
              } else {
                const parts = tz.parts(now)
                if (parts) {
                  const daysInMonth = new Date(
                    Date.UTC(parts.year, parts.month, 0)
                  ).getUTCDate()
                  daysLeft = Math.max(1, daysInMonth - parts.day + 1)
                }
              }
              const dailyAllowanceCents =
                !isOver && daysLeft > 0
                  ? Math.round(remainingCents / daysLeft)
                  : 0

              const dateRangeStr =
                b.interval === "ONE_TIME"
                  ? t("finance.budgets.progress.lifetime")
                  : b.currentPeriod?.startDate && b.currentPeriod?.endDate
                    ? tz.formatDateRange(
                        b.currentPeriod.startDate,
                        b.currentPeriod.endDate
                      )
                    : ""

              const intervalStr = getLocalizedIntervalLabel(b.interval, locale)
              const subtitleText = dateRangeStr
                ? `${dateRangeStr} · ${intervalStr}`
                : intervalStr

              const pacePercent = computeBudgetPacePercent(b, now)

              const barColor = isOver
                ? colors.destructive
                : isNearLimit
                  ? colors.warning
                  : nativeColors.bar

              const isCrossCurrency = Boolean(
                b.currency &&
                baseCurrency &&
                b.currency.toUpperCase() !== baseCurrency.toUpperCase()
              )
              const rateToBase = b.currentPeriod?.exchangeRateToBase ?? 0
              const isRateMissing =
                isCrossCurrency && Boolean(b.currentPeriod) && rateToBase <= 0

              const navigateToDetails = () => {
                haptics.light()
                router.push({
                  pathname: "/(app)/finance/budgets/[id]",
                  params: { id: b.id },
                })
              }

              return (
                <Card
                  key={b.id}
                  style={styles.budgetCard}
                  testID={`budget-card-${b.id}`}
                >
                  {/* Row 1: Icon + Name/Subtitle on left, Left/Over amount + ActionMenu on right */}
                  <View style={styles.budgetRowTop}>
                    <TouchableOpacity
                      style={styles.budgetHeaderMain}
                      activeOpacity={0.7}
                      onPress={navigateToDetails}
                    >
                      <View
                        style={[
                          styles.budgetIconBadge,
                          {
                            backgroundColor: nativeColors.bg,
                            borderColor: nativeColors.border,
                          },
                        ]}
                      >
                        <BudgetCategoryIcon
                          icon={b.icon}
                          name={b.name}
                          size={18}
                          color={nativeColors.bar}
                        />
                      </View>

                      <View style={styles.budgetTitleCol}>
                        <View style={styles.budgetNameRow}>
                          <Text style={styles.budgetName} numberOfLines={1}>
                            {b.name}
                          </Text>
                          {b.status === "CLOSED" ? (
                            <View
                              style={[
                                styles.statusChip,
                                {
                                  backgroundColor: colors.destructiveSubtle,
                                  borderColor: colors.destructiveBorder,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusChipText,
                                  { color: colors.destructive },
                                ]}
                              >
                                {t("finance.budgets.mobile.badgeClosed")}
                              </Text>
                            </View>
                          ) : b.status === "PAUSED" ? (
                            <View
                              style={[
                                styles.statusChip,
                                {
                                  backgroundColor: colors.warningSubtle,
                                  borderColor: colors.warningBorder,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusChipText,
                                  { color: colors.warning },
                                ]}
                              >
                                {t("finance.budgets.mobile.badgePaused")}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={styles.budgetSubtitle} numberOfLines={1}>
                          {subtitleText}
                        </Text>
                      </View>

                      <MonoAmount
                        size="sm"
                        color={isOver ? colors.destructive : colors.textPrimary}
                        style={styles.heroRemainingAmount}
                      >
                        {isOver
                          ? t("finance.budgets.mobile.amountOver", {
                              amount: formatAmount(
                                String(overCents),
                                b.currency
                              ),
                            })
                          : t("finance.budgets.mobile.amountLeft", {
                              amount: formatAmount(
                                String(remainingCents),
                                b.currency
                              ),
                            })}
                      </MonoAmount>
                    </TouchableOpacity>

                    <ActionMenu
                      title={b.name}
                      colorScheme={resolvedMode}
                      style={styles.menuTriggerWrapper}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "details") {
                          haptics.light()
                          router.push(`/(app)/finance/budgets/${b.id}`)
                        } else if (nativeEvent.event === "expense") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "EXPENSE",
                              budgetId: b.id,
                              ...(b.defaultAccountId
                                ? { accountId: b.defaultAccountId }
                                : {}),
                            },
                          })
                        } else if (nativeEvent.event === "pause") {
                          handleUpdateStatus(b, "PAUSED", "Paused")
                        } else if (nativeEvent.event === "resume") {
                          handleUpdateStatus(b, "ACTIVE", "Resumed")
                        } else if (nativeEvent.event === "close") {
                          handleUpdateStatus(b, "CLOSED", "Closed")
                        } else if (nativeEvent.event === "reopen") {
                          handleUpdateStatus(b, "ACTIVE", "Reopened")
                        } else if (nativeEvent.event === "edit") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/manage-budget",
                            params: { id: b.id },
                          })
                        } else if (nativeEvent.event === "delete") {
                          handleDeleteBudget(b)
                        }
                      }}
                      actions={[
                        {
                          id: "details",
                          title: t("finance.budgets.mobile.menuViewDetails"),
                          image: detailsIcon,
                        },
                        ...(b.status === "ACTIVE" || !b.status
                          ? [
                              {
                                id: "expense",
                                title: t("finance.budgets.recordExpense"),
                                image: addExpenseIcon,
                              },
                            ]
                          : []),
                        ...(b.status === "PAUSED"
                          ? [
                              {
                                id: "resume",
                                title: t("finance.budgets.resumeBudget"),
                                image: resumeIcon,
                              },
                            ]
                          : b.status === "CLOSED"
                            ? []
                            : [
                                {
                                  id: "pause",
                                  title: t("finance.budgets.pauseBudget"),
                                  image: pauseIcon,
                                },
                              ]),
                        ...(b.status === "CLOSED"
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
                      <View style={styles.dotsBtn}>
                        <MoreVertical size={18} color={colors.textMuted} />
                      </View>
                    </ActionMenu>
                  </View>

                  <TouchableOpacity
                    style={styles.budgetBodyPressable}
                    activeOpacity={0.75}
                    onPress={navigateToDetails}
                  >
                    {isRateMissing ? (
                      <View style={styles.exchangeRateWarning}>
                        <AlertTriangle size={13} color={colors.warning} />
                        <Text style={styles.exchangeRateWarningText}>
                          {t("finance.budgets.mobile.rateRequiredInline", {
                            from: b.currency,
                            to: baseCurrency,
                          })}
                        </Text>
                      </View>
                    ) : null}

                    {/* Row 2: 6px Progress Track with Today elapsed-period pace tick */}
                    <View style={styles.progressWrap}>
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
                      {pacePercent !== null ? (
                        <View
                          testID={`budget-pace-tick-${b.id}`}
                          accessibilityLabel={t(
                            "finance.budgets.progress.paceTickAria",
                            { pct: Math.round(pacePercent) }
                          )}
                          style={[styles.paceTick, { left: `${pacePercent}%` }]}
                        />
                      ) : null}
                    </View>

                    {/* Row 3: $Spent of $Limit on left + condensed $X/day safe on right */}
                    <View style={styles.budgetFooter}>
                      <Text style={styles.spentOfLimitText} numberOfLines={1}>
                        {t("finance.budgets.mobile.summarySpentOfLimit", {
                          spent: formatAmount(String(spentCents), b.currency),
                          limit: formatAmount(String(limitCents), b.currency),
                        })}
                      </Text>

                      {isOver ? (
                        <Text style={styles.exceededText} numberOfLines={1}>
                          {t("finance.budgets.progress.exceeded")}
                        </Text>
                      ) : b.status !== "CLOSED" && dailyAllowanceCents > 0 ? (
                        <Text style={styles.dailySafeText} numberOfLines={1}>
                          {t("finance.budgets.mobile.perDaySafe", {
                            amount: formatAmount(
                              String(dailyAllowanceCents),
                              b.currency
                            ),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>

      <QuickCaptureFab
        testID="budgets-fab-add"
        accessibilityLabel={t("finance.budgets.mobile.menuNew")}
        onPress={() => router.push("/modal/manage-budget")}
        style={{ bottom: Math.max(insets.bottom, 16) + 4 }}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  headerRightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  headerIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 96,
    gap: 12,
  },
  summaryCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 10,
  },
  summaryHeroRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  summaryHeroMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  summaryOfLimitText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
    fontVariant: ["tabular-nums"] as const,
    flexShrink: 0,
  },
  summaryProgressWrap: {
    position: "relative" as const,
    justifyContent: "center" as const,
    paddingVertical: 2,
  },
  summaryProgressTrack: {
    height: 7,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  summaryProgressBar: {
    height: "100%" as const,
    borderRadius: 4,
  },
  paceTickSummary: {
    position: "absolute" as const,
    top: -1,
    width: 2,
    height: 13,
    borderRadius: 1,
    backgroundColor: t.colors.textPrimary,
    marginLeft: -1,
  },
  summaryPaceText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  filterToolbar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  filterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  filterPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterPillActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  filterPillTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  inlineSearchBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  inlineSearchBtnActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  searchBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: t.colors.textPrimary,
    padding: 0,
  },
  skeletonStack: {
    gap: 10,
  },
  budgetList: {
    gap: 10,
  },
  budgetCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 10,
  },
  budgetRowTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 4,
  },
  budgetHeaderMain: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  budgetIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  budgetTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  budgetNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  budgetName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radius.xs,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: "600" as const,
  },
  budgetSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  heroRemainingAmount: {
    flexShrink: 0,
    marginLeft: 4,
  },
  menuTriggerWrapper: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  dotsBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  budgetBodyPressable: {
    gap: 8,
  },
  exchangeRateWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: t.colors.warningBorder,
  },
  exchangeRateWarningText: {
    fontSize: 11,
    color: t.colors.warning,
    flex: 1,
    lineHeight: 15,
  },
  progressWrap: {
    position: "relative" as const,
    justifyContent: "center" as const,
    paddingVertical: 2,
  },
  progressTrack: {
    height: 6,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  progressBar: {
    height: "100%" as const,
    borderRadius: 3,
  },
  paceTick: {
    position: "absolute" as const,
    top: 0,
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: t.colors.textPrimary,
    marginLeft: -1,
  },
  budgetFooter: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  spentOfLimitText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontVariant: ["tabular-nums"] as const,
    flexShrink: 1,
  },
  dailySafeText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontVariant: ["tabular-nums"] as const,
    flexShrink: 0,
  },
  exceededText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.destructive,
    flexShrink: 0,
  },
})
