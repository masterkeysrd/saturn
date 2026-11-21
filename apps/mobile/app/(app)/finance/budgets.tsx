import { useState, useMemo } from "react"
import {
  StyleSheet,
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
import {
  PiggyBank,
  Calendar,
  Plus,
  Sparkles,
  PieChart,
  Search,
  X,
  CreditCard,
  AlertTriangle,
  MoreVertical,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "@/components/ui/action-menu"
import { formatAmount, parseDate } from "@saturn/core"
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
import { invalidateFinanceQueries, useI18n, useTimezone } from "@saturn/hooks"
import { getLocalizedIntervalLabel, type TranslationKey } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { Card } from "@/components/ui/card"
import { Caption, MonoAmount } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

// Cross-platform menu icons
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

export default function BudgetsScreen() {
  const router = useRouter()
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
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch settings & base currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch accounts to resolve default accounts
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

  const statusesParam = useMemo<Budget_Status[]>(() => {
    if (statusFilter === "ALL") return ["ACTIVE", "PAUSED", "CLOSED"]
    return [statusFilter]
  }, [statusFilter])

  const {
    data: budgetsData,
    isLoading,
    refetch,
  } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL", statuses: statusesParam },
    { enabled: !!activeSpaceId }
  )

  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )

  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  // Summary Metrics across active budgets in base currency
  const { totalLimitBaseCents, totalSpentBaseCents, activeBudgetsCount } =
    useMemo(() => {
      let totalLimit = 0
      let totalSpent = 0
      let activeCount = 0

      budgets.forEach((b) => {
        const isActive = b.status === "ACTIVE" || !b.status
        if (!isActive) return
        activeCount++

        // Limit in base currency
        if (b.currentPeriod?.limitInBase) {
          totalLimit += Number(b.currentPeriod.limitInBase)
        } else {
          totalLimit += Number(b.limitAmount || "0")
        }

        // Spent in base currency
        if (b.currentPeriod?.spentInBase) {
          totalSpent += Number(b.currentPeriod.spentInBase)
        } else if (b.currentPeriod?.spentAmount) {
          totalSpent += Number(b.currentPeriod.spentAmount)
        }
      })

      return {
        totalLimitBaseCents: totalLimit,
        totalSpentBaseCents: totalSpent,
        activeBudgetsCount: activeCount,
      }
    }, [budgets])

  const overallUtilization =
    totalLimitBaseCents > 0
      ? Math.min(
          100,
          Math.round((totalSpentBaseCents / totalLimitBaseCents) * 100)
        )
      : 0

  // Filter budgets by search query
  const filteredBudgets = useMemo(() => {
    if (!searchQuery.trim()) return budgets
    const q = searchQuery.toLowerCase().trim()
    return budgets.filter((b) => {
      const matchName = b.name.toLowerCase().includes(q)
      const matchCurrency = b.currency?.toLowerCase().includes(q)
      const accountName = b.defaultAccountId
        ? accountsMap.get(b.defaultAccountId)?.name?.toLowerCase()
        : ""
      const matchAccount = accountName?.includes(q)
      return matchName || matchCurrency || matchAccount
    })
  }, [budgets, searchQuery, accountsMap])

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
                    label: t("finance.budgets.mobile.menuNew"),
                    icon: { type: "sfSymbol", name: "plus" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push("/modal/manage-budget")
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light()
                      router.push("/modal/manage-budget")
                    }}
                    style={styles.headerAddBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Plus size={20} color={colors.primary} />
                  </TouchableOpacity>
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
        {/* 1. Summary Dashboard Header Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryIconBadge}>
              <PieChart size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>
                {t("finance.budgets.mobile.summaryActiveLimits")}
              </Text>
              <MonoAmount size="lg" color={colors.textPrimary}>
                {formatAmount(totalLimitBaseCents, baseCurrency)}
              </MonoAmount>
            </View>
            <Badge
              size="sm"
              label={baseCurrency}
              bg={colors.primarySubtle}
              color={colors.primary}
            />
          </View>

          {/* Utilization Bar */}
          <View style={styles.summaryProgressSection}>
            <View style={styles.summaryProgressHeader}>
              <Text style={styles.summaryProgressSpent}>
                {t("finance.budgets.mobile.summarySpent", {
                  amount: formatAmount(totalSpentBaseCents, baseCurrency),
                })}
              </Text>
              <Text style={styles.summaryProgressPercent}>
                {t("finance.budgets.mobile.summaryUtilized", {
                  pct: overallUtilization,
                })}
              </Text>
            </View>
            <View style={styles.summaryProgressTrack}>
              <View
                style={[
                  styles.summaryProgressBar,
                  {
                    width: `${overallUtilization}%`,
                    backgroundColor:
                      overallUtilization >= 100
                        ? colors.destructive
                        : overallUtilization >= 85
                          ? colors.warning
                          : colors.primary,
                  },
                ]}
              />
            </View>
          </View>

          {/* Meta footer row */}
          <View style={styles.summaryFooterRow}>
            <Text style={styles.summaryFooterText}>
              {t("finance.budgets.mobile.summaryTemplates", {
                total: budgets.length,
                active: activeBudgetsCount,
              })}
            </Text>
            <Text style={styles.summaryFooterBase}>
              {t("finance.budgets.mobile.summaryBase", {
                currency: baseCurrency,
              })}
            </Text>
          </View>
        </Card>

        {/* 2. Search Bar */}
        <View style={styles.searchBar}>
          <Search size={16} color={colors.textMuted} />
          <RNTextInput
            style={styles.searchInput}
            placeholder={t("finance.budgets.mobile.searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={isDark ? "dark" : "light"}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 3. Status Filter Pills */}
        <View style={styles.filterRow}>
          {(
            [
              {
                key: "ACTIVE",
                labelKey: "finance.budgets.mobile.filterActive",
              },
              {
                key: "PAUSED",
                labelKey: "finance.budgets.mobile.filterPaused",
              },
              {
                key: "CLOSED",
                labelKey: "finance.budgets.mobile.filterClosed",
              },
              { key: "ALL", labelKey: "common.all" },
            ] as const
          ).map((filter) => {
            const isSelected = statusFilter === filter.key
            return (
              <TouchableOpacity
                key={filter.key}
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
                  {t(filter.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Caption style={styles.sectionHeader}>
          {statusFilter === "ALL"
            ? t("finance.budgets.mobile.headerAll")
            : statusFilter === "PAUSED"
              ? t("finance.budgets.mobile.headerPaused")
              : statusFilter === "CLOSED"
                ? t("finance.budgets.mobile.headerClosed")
                : t("finance.budgets.mobile.headerActive")}{" "}
          ({filteredBudgets.length})
        </Caption>

        {isLoading ? (
          <View style={{ gap: 10 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : filteredBudgets.length === 0 ? (
          <EmptyState
            icon={<PiggyBank size={28} color={colors.textMuted} />}
            title={
              searchQuery.trim()
                ? t("finance.budgets.mobile.emptyNoMatch")
                : t("finance.budgets.mobile.emptyNone")
            }
            description={
              searchQuery.trim()
                ? t("finance.budgets.mobile.emptyNoMatchDesc", {
                    query: searchQuery,
                  })
                : t("finance.budgets.mobile.emptyNoneDesc")
            }
          />
        ) : (
          <View style={styles.budgetList}>
            {filteredBudgets.map((b: Budget) => {
              const nativeColors = getBudgetColors(b.color || "indigo")
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

              const now = tz.now()
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

              const startStr = b.currentPeriod?.startDate
                ? tz.format(b.currentPeriod.startDate, {
                    month: "short",
                    day: "numeric",
                  })
                : ""
              const endStr = b.currentPeriod?.endDate
                ? tz.format(b.currentPeriod.endDate, {
                    month: "short",
                    day: "numeric",
                  })
                : ""
              const dateRangeStr =
                b.interval === "ONE_TIME"
                  ? t("finance.budgets.progress.lifetime")
                  : startStr && endStr
                    ? `${startStr} - ${endStr}`
                    : ""

              const barColor = isOver
                ? colors.destructive
                : isNearLimit
                  ? colors.warning
                  : nativeColors.bar

              // Cross-currency conversion check
              const isCrossCurrency = Boolean(
                b.currency &&
                baseCurrency &&
                b.currency.toUpperCase() !== baseCurrency.toUpperCase()
              )
              const rateToBase = b.currentPeriod?.exchangeRateToBase ?? 0
              const isRateMissing =
                isCrossCurrency && Boolean(b.currentPeriod) && rateToBase <= 0
              const limitInBaseCents = Math.round(limitCents * rateToBase)

              // Default Account resolution
              const defaultAccount = b.defaultAccountId
                ? accountsMap.get(b.defaultAccountId)
                : undefined

              const navigateToDetails = () => {
                haptics.light()
                router.push({
                  pathname: "/(app)/finance/budgets/[id]",
                  params: { id: b.id },
                })
              }

              return (
                <Card key={b.id} style={styles.budgetCard}>
                  <View style={styles.budgetHeader}>
                    <TouchableOpacity
                      style={styles.budgetHeaderMain}
                      activeOpacity={0.7}
                      onPress={navigateToDetails}
                    >
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
                                {getLocalizedIntervalLabel(b.interval, locale)}
                              </Text>
                            </View>
                            {b.status === "CLOSED" ? (
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
                                    styles.intervalText,
                                    { color: colors.destructive },
                                  ]}
                                >
                                  {t("finance.budgets.mobile.badgeClosed")}
                                </Text>
                              </View>
                            ) : b.status === "PAUSED" ? (
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
                                    styles.intervalText,
                                    { color: colors.warning },
                                  ]}
                                >
                                  {t("finance.budgets.mobile.badgePaused")}
                                </Text>
                              </View>
                            ) : null}

                            {/* Default Account badge */}
                            {defaultAccount ? (
                              <View style={styles.accountBadge}>
                                <CreditCard
                                  size={10}
                                  color={colors.textMuted}
                                />
                                <Text
                                  style={styles.accountBadgeText}
                                  numberOfLines={1}
                                >
                                  {defaultAccount.name}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {dateRangeStr ? (
                            <View style={styles.periodRow}>
                              <Calendar size={11} color={colors.textMuted} />
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
                    </TouchableOpacity>

                    {/* Native 3-Dots Quick Action Menu (sibling of TouchableOpacity) */}
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
                    {/* Missing Exchange Rate Warning Banner */}
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

                    {/* Cross-Currency Conversion Strip */}
                    {isCrossCurrency && rateToBase > 0 ? (
                      <View style={styles.crossCurrencyStrip}>
                        <Text style={styles.crossCurrencyRateText}>
                          1 {b.currency} = {rateToBase.toFixed(4)}{" "}
                          {baseCurrency}
                        </Text>
                        <Text style={styles.crossCurrencyLimitText}>
                          {t("finance.budgets.mobile.limitInBase", {
                            currency: baseCurrency,
                            amount: formatAmount(
                              limitInBaseCents,
                              baseCurrency
                            ),
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
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.budgetFooter}>
                      <Text style={styles.spentText}>
                        {t("finance.budgets.mobile.spentLabel")}{" "}
                        <Text
                          style={[
                            styles.whiteText,
                            isOver && { color: colors.destructive },
                          ]}
                        >
                          {formatAmount(String(spentCents), b.currency)}
                        </Text>
                      </Text>
                      <Text
                        style={[
                          styles.remainingText,
                          isOver && styles.overText,
                        ]}
                      >
                        {isOver
                          ? t("finance.budgets.mobile.overBy", {
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
                      </Text>
                    </View>

                    {!isOver && dailyAllowanceCents > 0 ? (
                      <View style={styles.allowanceSubRow}>
                        <Sparkles size={11} color={colors.primary} />
                        <Text style={styles.allowanceSubText}>
                          {t("finance.budgets.mobile.paceLabel")}{" "}
                          <Text style={styles.allowanceSubBold}>
                            {formatAmount(
                              String(dailyAllowanceCents),
                              b.currency
                            )}{" "}
                            {t("finance.budgets.mobile.perDay")}
                          </Text>{" "}
                          (
                          {t("finance.budgets.progress.daysLeft", {
                            days: daysLeft,
                          })}
                          )
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 14,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceElevated,
    gap: 12,
  },
  summaryTopRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  summaryIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: "uppercase" as const,
  },
  summaryProgressSection: {
    gap: 6,
    marginTop: 4,
  },
  summaryProgressHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  summaryProgressSpent: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  summaryProgressPercent: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  summaryProgressTrack: {
    height: 6,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  summaryProgressBar: {
    height: "100%" as const,
    borderRadius: 3,
  },
  summaryFooterRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  summaryFooterText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  summaryFooterBase: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
  },
  searchBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: t.colors.textPrimary,
    padding: 0,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    textTransform: "uppercase" as const,
  },
  budgetList: {
    gap: 12,
  },
  budgetCard: {
    padding: 16,
    gap: 12,
  },
  budgetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  budgetHeaderMain: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    flex: 1,
    gap: 10,
  },
  budgetBodyPressable: {
    gap: 12,
  },
  budgetLeftGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  budgetIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  budgetTitleCol: {
    flex: 1,
    gap: 3,
  },
  budgetNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flexWrap: "wrap" as const,
  },
  budgetName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  intervalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  intervalText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
  },
  accountBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    maxWidth: 120,
  },
  accountBadgeText: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  periodRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  periodText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  budgetRightGroup: {
    alignItems: "flex-end" as const,
    gap: 4,
  },
  limitAmountText: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: t.colors.textPrimary,
  },
  menuTriggerWrapper: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dotsBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  exchangeRateWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  exchangeRateWarningText: {
    fontSize: 11,
    color: t.colors.warning,
    flex: 1,
    lineHeight: 15,
  },
  crossCurrencyStrip: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  crossCurrencyRateText: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: t.colors.textMuted,
  },
  crossCurrencyLimitText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  progressBar: {
    height: "100%" as const,
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  spentText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  whiteText: {
    color: t.colors.textPrimary,
    fontWeight: "700" as const,
  },
  remainingText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.success,
  },
  overText: {
    color: t.colors.destructive,
  },
  allowanceSubRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  allowanceSubText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  allowanceSubBold: {
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  filterRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 4,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
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
})
