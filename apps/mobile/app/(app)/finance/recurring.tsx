import { useState, useMemo, useCallback } from "react"
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  CalendarClock,
  Plus,
  ArrowDownLeft,
  TrendingDown,
  TrendingUp,
  MoreVertical,
  Clock,
  Layers,
  Calendar,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "@/components/ui/action-menu"
import {
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  useUpdateRecurringTransactionMutation,
  useDeleteRecurringTransactionMutation,
  useSkipScheduledTransactionMutation,
  useGetSettingsQuery,
  type RecurringTransaction,
  type ScheduledTransaction,
  type ListScheduledTransactionsRequest,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatCents,
  formatAmount,
  formatNextDueDate,
  getScheduledDisplayName,
  isStatusActive,
  parseDate,
  getStartOfDay,
} from "@saturn/core"
import { invalidateFinanceQueries, useI18n, useTimezone } from "@saturn/hooks"
import {
  getLocalizedEnumLabel,
  getLocalizedIntervalLabel,
  type TranslationKey,
} from "@saturn/i18n"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"

const WEEKS_IN_YEAR = 52
const MONTHS_IN_YEAR = 12

// Cross-platform menu icons
const depositIcon = Icon.select({
  ios: "arrow.down.left",
  android: require("@expo/material-symbols/arrow_downward.xml"),
})

const confirmIcon = Icon.select({
  ios: "checkmark.circle",
  android: require("@expo/material-symbols/check_circle.xml"),
})

const skipIcon = Icon.select({
  ios: "forward.fill",
  android: require("@expo/material-symbols/fast_forward.xml"),
})

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const pauseIcon = Icon.select({
  ios: "pause.circle",
  android: require("@expo/material-symbols/pause_circle.xml"),
})

const resumeIcon = Icon.select({
  ios: "play.circle",
  android: require("@expo/material-symbols/play_circle.xml"),
})

const deleteIcon = Icon.select({
  ios: "trash",
  android: require("@expo/material-symbols/delete.xml"),
})

type DueBadge =
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "soon"; days: number }

function getDueDateBadge(
  dueDateStr?: string,
  timezone: string = "UTC"
): DueBadge | null {
  if (!dueDateStr) return null
  const due = parseDate(dueDateStr)
  if (!due) return null

  const now = new Date()
  const startToday = getStartOfDay(now, timezone)
  const startDue = getStartOfDay(due, timezone)

  const diffMs = startDue.getTime() - startToday.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { kind: "overdue", days: Math.abs(diffDays) }
  } else if (diffDays === 0) {
    return { kind: "today" }
  } else if (diffDays === 1) {
    return { kind: "tomorrow" }
  } else if (diffDays <= 7) {
    return { kind: "soon", days: diffDays }
  }
  return null
}

function getDueBadgeLabel(
  badge: DueBadge,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  switch (badge.kind) {
    case "overdue":
      return t("finance.tab.overdueBadge", { days: badge.days })
    case "today":
      return t("finance.tab.dueToday")
    case "tomorrow":
      return t("finance.tab.dueTomorrow")
    default:
      return t("finance.recurring.mobile.inDays", { count: badge.days })
  }
}

type TabType = "upcoming" | "templates"
type TypeFilter = "ALL" | "EXPENSE" | "INCOME"

export default function RecurringScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)

  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("upcoming")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL")

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Multi-Currency Conversion
  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  // 3. Recurring Templates
  const {
    data: recurringData,
    isLoading: isRecurringLoading,
    refetch: refetchRecurring,
  } = useListRecurringTransactionsQuery(
    {
      pageSize: 100,
      pageToken: "",
      status: "STATUS_UNSPECIFIED",
      view: "FULL",
    },
    { enabled: !!activeSpaceId }
  )

  // 4. Scheduled Transactions (Pending)
  const {
    data: scheduledData,
    isLoading: isScheduledLoading,
    refetch: refetchScheduled,
  } = useListScheduledTransactionsQuery(
    {
      pageSize: 100,
      pageToken: "",
      status: "PENDING",
      startDate: "",
      endDate: "",
      view: "FULL",
    } as unknown as ListScheduledTransactionsRequest,
    { enabled: !!activeSpaceId }
  )

  // Mutations
  const updateRecurringMutation = useUpdateRecurringTransactionMutation()
  const deleteRecurringMutation = useDeleteRecurringTransactionMutation()
  const skipScheduledMutation = useSkipScheduledTransactionMutation()

  const recurringList = useMemo(() => {
    return recurringData?.recurringTransactions || []
  }, [recurringData])

  const scheduledList = useMemo(() => {
    const list = scheduledData?.scheduledTransactions || []
    return [...list].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : 0
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : 0
      return timeA - timeB
    })
  }, [scheduledData])

  // Convert amount to base currency
  const convertToBase = useCallback(
    (amountVal: number, fromCurrency: string) => {
      if (!baseCurrency || fromCurrency === baseCurrency) {
        return amountVal
      }
      const preview = getConversionPreview(amountVal.toString(), fromCurrency)
      if (
        preview &&
        "amount" in preview &&
        typeof preview.amount === "number"
      ) {
        return preview.amount
      }
      return amountVal
    },
    [baseCurrency, getConversionPreview]
  )

  // Calculate Monthly Recurring Metrics
  const { monthlyExpenses, monthlyIncomes, next30DaysOutflows } =
    useMemo(() => {
      let expTotal = 0
      let incTotal = 0

      recurringList.forEach((rt) => {
        if (!isStatusActive(rt.status)) return

        const cents = formatCents(rt.amount)
        const converted = convertToBase(cents, rt.currency || baseCurrency)
        let normalized = converted

        const intervalStr = (rt.interval || "").toUpperCase()
        if (intervalStr === "WEEKLY" || intervalStr === "INTERVAL_WEEKLY") {
          normalized = converted * (WEEKS_IN_YEAR / MONTHS_IN_YEAR)
        } else if (
          intervalStr === "YEARLY" ||
          intervalStr === "INTERVAL_YEARLY"
        ) {
          normalized = converted / MONTHS_IN_YEAR
        }

        if (rt.type === "INCOME") {
          incTotal += normalized
        } else {
          expTotal += normalized
        }
      })

      // Next 30 days scheduled outflows
      const now = new Date()
      const future30 = new Date()
      future30.setDate(now.getDate() + 30)

      const upcomingOutflows = scheduledList.reduce((acc, st) => {
        if (st.type === "INCOME") return acc
        if (!st.dueDate) return acc
        const due = new Date(st.dueDate)
        if (due <= future30) {
          const val = formatCents(st.amount)
          return acc + convertToBase(val, st.currency || baseCurrency)
        }
        return acc
      }, 0)

      return {
        monthlyExpenses: expTotal,
        monthlyIncomes: incTotal,
        next30DaysOutflows: upcomingOutflows,
      }
    }, [recurringList, scheduledList, baseCurrency, convertToBase])

  // Filtered lists
  const filteredScheduled = useMemo(() => {
    return scheduledList.filter((st) => {
      if (typeFilter === "ALL") return true
      return st.type === typeFilter
    })
  }, [scheduledList, typeFilter])

  const filteredRecurring = useMemo(() => {
    return recurringList.filter((rt) => {
      if (typeFilter === "ALL") return true
      return rt.type === typeFilter
    })
  }, [recurringList, typeFilter])

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([refetchRecurring(), refetchScheduled()])
    } finally {
      setRefreshing(false)
    }
  }

  // Quick Action: Skip Scheduled Cycle
  const promptSkipScheduled = (st: ScheduledTransaction) => {
    haptics.warning()
    Alert.alert(
      t("finance.tab.skipCycleConfirmTitle"),
      t("finance.tab.skipCycleConfirmDesc", {
        name: getScheduledDisplayName(st, recurringList),
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("finance.recurring.skipCycle"),
          style: "destructive",
          onPress: async () => {
            try {
              if (!st.id) return
              await skipScheduledMutation.mutateAsync({
                id: st.id,
                req: { id: st.id },
              })
              haptics.success()
              toast.show({
                title: t("finance.tab.cycleSkipped"),
                message: t("finance.tab.cycleSkippedDesc"),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.tab.cycleSkipFailed"),
                message:
                  err?.message || t("finance.tab.cycleSkipFailedDefault"),
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  // Quick Action: Toggle Pause / Resume Template
  const handleToggleTemplateStatus = async (rt: RecurringTransaction) => {
    if (!rt.id) return
    const isCurrentlyActive = rt.status === "ACTIVE" || !rt.status
    const nextStatus = isCurrentlyActive ? "PAUSED" : "ACTIVE"

    try {
      haptics.light()
      await updateRecurringMutation.mutateAsync({
        id: rt.id,
        req: {
          id: rt.id,
          version: rt.version,
          recurringTransaction: {
            ...rt,
            status: nextStatus,
          },
        },
      })
      haptics.success()
      toast.show({
        title:
          nextStatus === "ACTIVE"
            ? t("finance.recurring.mobile.toastResumed")
            : t("finance.recurring.mobile.toastPaused"),
        message: t("finance.recurring.mobile.toastStatusDesc", {
          name: rt.name,
          status: getLocalizedEnumLabel(
            "finance",
            "status",
            nextStatus,
            locale
          ).toLowerCase(),
        }),
        type: "success",
      })
      await invalidateFinanceQueries(queryClient)
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("finance.recurring.mobile.toastUpdateFailed"),
        message:
          err?.message || t("finance.recurring.mobile.toastStatusFailed"),
        type: "error",
      })
    }
  }

  // Quick Action: Delete Template
  const promptDeleteTemplate = (rt: RecurringTransaction) => {
    if (!rt.id) return
    haptics.warning()

    Alert.alert(
      t("finance.recurring.delete.title"),
      t("finance.recurring.delete.descriptionExpense", { name: rt.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRecurringMutation.mutateAsync({
                id: rt.id!,
                req: {
                  id: rt.id!,
                  version: rt.version,
                },
              })
              haptics.success()
              toast.show({
                title: t("finance.recurring.delete.deletedTitle"),
                message: t("finance.recurring.mobile.toastDeletedDesc", {
                  name: rt.name,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.recurring.delete.failedTitle"),
                message:
                  err?.message ||
                  t("finance.recurring.delete.failedDescription"),
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  const isLoading = isRecurringLoading || isScheduledLoading

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: t("finance.recurring.mobile.headerTitle"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: t("finance.recurring.mobile.newRecurring"),
                    icon: { type: "sfSymbol", name: "plus" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push("/modal/manage-recurring")
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light()
                      router.push("/modal/manage-recurring")
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
        {/* Overview Metric Cards */}
        <View style={styles.overviewGrid}>
          <Card style={styles.overviewCard}>
            <View style={styles.overviewHeaderRow}>
              <View
                style={[
                  styles.metricIconCircle,
                  { backgroundColor: colors.successSubtle },
                ]}
              >
                <TrendingUp size={16} color={colors.success} />
              </View>
              <Caption style={styles.overviewLabel}>
                {t("finance.recurring.mobile.recurringIncome").toUpperCase()}
              </Caption>
            </View>
            <Text style={[styles.overviewAmount, { color: colors.success }]}>
              +
              {monthlyIncomes.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.overviewUnit}>
              {t("finance.recurring.mobile.perMonth", {
                currency: baseCurrency,
              })}
            </Text>
          </Card>

          <Card style={styles.overviewCard}>
            <View style={styles.overviewHeaderRow}>
              <View
                style={[
                  styles.metricIconCircle,
                  { backgroundColor: colors.destructiveSubtle },
                ]}
              >
                <TrendingDown size={16} color={colors.destructive} />
              </View>
              <Caption style={styles.overviewLabel}>
                {t("finance.recurring.mobile.fixedOverhead").toUpperCase()}
              </Caption>
            </View>
            <Text
              style={[styles.overviewAmount, { color: colors.textPrimary }]}
            >
              -
              {monthlyExpenses.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.overviewUnit}>
              {t("finance.recurring.mobile.perMonth", {
                currency: baseCurrency,
              })}
            </Text>
          </Card>
        </View>

        {/* 30-Day Outflow Highlight */}
        <Card style={styles.forecastCard}>
          <View style={styles.forecastLeft}>
            <Calendar size={18} color={colors.warning} />
            <View>
              <Text style={styles.forecastTitle}>
                {t("finance.recurring.mobile.next30Outflows")}
              </Text>
              <Text style={styles.forecastSubtitle}>
                {t("finance.recurring.mobile.next30Subtitle")}
              </Text>
            </View>
          </View>
          <MonoAmount size="md" color={colors.warning}>
            {next30DaysOutflows.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {baseCurrency}
          </MonoAmount>
        </Card>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === "upcoming" && styles.tabBtnActive,
            ]}
            onPress={() => {
              haptics.selection()
              setActiveTab("upcoming")
            }}
            activeOpacity={0.8}
          >
            <Clock
              size={14}
              color={
                activeTab === "upcoming" ? colors.primary : colors.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "upcoming" && styles.tabTextActive,
              ]}
            >
              {t("finance.recurring.mobile.tabUpcoming", {
                count: scheduledList.length,
              })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === "templates" && styles.tabBtnActive,
            ]}
            onPress={() => {
              haptics.selection()
              setActiveTab("templates")
            }}
            activeOpacity={0.8}
          >
            <Layers
              size={14}
              color={
                activeTab === "templates" ? colors.primary : colors.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "templates" && styles.tabTextActive,
              ]}
            >
              {t("finance.recurring.mobile.tabRules", {
                count: recurringList.length,
              })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(
            [
              { key: "ALL", label: t("common.all") },
              {
                key: "EXPENSE",
                label: t("finance.recurring.mobile.filterBills"),
              },
              {
                key: "INCOME",
                label: t("finance.recurring.mobile.filterIncome"),
              },
            ] as const
          ).map((filter) => {
            const isSelected = typeFilter === filter.key
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                ]}
                onPress={() => {
                  haptics.selection()
                  setTypeFilter(filter.key)
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
        </View>

        {/* Main List Content */}
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <SkeletonCard height={90} />
            <SkeletonCard height={90} />
            <SkeletonCard height={90} />
          </View>
        ) : activeTab === "upcoming" ? (
          /* TAB 1: Upcoming Scheduled Instances */
          filteredScheduled.length === 0 ? (
            <EmptyState
              icon={<CalendarClock size={32} color={colors.textMuted} />}
              title={t("finance.recurring.mobile.emptyUpcomingTitle")}
              description={
                typeFilter === "ALL"
                  ? t("finance.recurring.mobile.emptyUpcomingAll")
                  : t("finance.recurring.mobile.emptyUpcomingType", {
                      type: t(
                        typeFilter === "INCOME"
                          ? "finance.recurring.mobile.typeIncome"
                          : "finance.recurring.mobile.typeExpense"
                      ),
                    })
              }
            />
          ) : (
            <Card style={styles.listCard}>
              {filteredScheduled.map((st, idx) => {
                const isIncome = st.type === "INCOME"
                const dueBadge = getDueDateBadge(st.dueDate, tz.timezone)
                const title = getScheduledDisplayName(st, recurringList)

                return (
                  <View
                    key={st.id || idx}
                    style={[
                      styles.txRow,
                      idx < filteredScheduled.length - 1 && styles.rowBorder,
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.txMainPressable}
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light()
                        router.push({
                          pathname: "/modal/add-transaction",
                          params: {
                            type: "SCHEDULED",
                            scheduledTransactionId: st.id,
                          },
                        })
                      }}
                    >
                      <View style={styles.txLeft}>
                        <View
                          style={[
                            styles.actionIconBadge,
                            {
                              backgroundColor: isIncome
                                ? colors.successSubtle
                                : colors.primarySubtle,
                            },
                          ]}
                        >
                          {isIncome ? (
                            <ArrowDownLeft size={16} color={colors.success} />
                          ) : (
                            <CalendarClock size={16} color={colors.primary} />
                          )}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.txName} numberOfLines={1}>
                            {title}
                          </Text>
                          <View style={styles.badgeRow}>
                            {st.dueDate ? (
                              <Text style={styles.txMeta}>
                                {tz.format(st.dueDate, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Text>
                            ) : null}
                            {isIncome ? (
                              <Badge
                                size="sm"
                                label={t("finance.tab.depositDue")}
                                bg={colors.successSubtle}
                                border="rgba(16, 185, 129, 0.3)"
                                color={colors.success}
                              />
                            ) : dueBadge ? (
                              <Badge
                                size="sm"
                                label={getDueBadgeLabel(dueBadge, t)}
                                bg={
                                  dueBadge.kind === "overdue"
                                    ? colors.destructiveSubtle
                                    : dueBadge.kind === "today"
                                      ? colors.warningSubtle
                                      : colors.surfaceHighlight
                                }
                                border={
                                  dueBadge.kind === "overdue"
                                    ? "rgba(244, 63, 94, 0.3)"
                                    : dueBadge.kind === "today"
                                      ? "rgba(245, 158, 11, 0.3)"
                                      : colors.border
                                }
                                color={
                                  dueBadge.kind === "overdue"
                                    ? colors.destructive
                                    : dueBadge.kind === "today"
                                      ? colors.warning
                                      : colors.textMuted
                                }
                              />
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <MonoAmount
                        size="sm"
                        color={isIncome ? colors.success : colors.textPrimary}
                      >
                        {isIncome ? "+" : "-"}
                        {formatAmount(st.amount, st.currency || baseCurrency)}
                      </MonoAmount>
                    </TouchableOpacity>

                    <ActionMenu
                      title={title}
                      colorScheme={resolvedMode}
                      style={styles.menuTriggerWrapper}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "confirm") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "SCHEDULED",
                              scheduledTransactionId: st.id,
                            },
                          })
                        } else if (nativeEvent.event === "skip") {
                          promptSkipScheduled(st)
                        }
                      }}
                      actions={[
                        {
                          id: "confirm",
                          title: isIncome
                            ? t("finance.transactions.scheduled.confirmDeposit")
                            : t("finance.tab.confirmPay"),
                          image: isIncome ? depositIcon : confirmIcon,
                        },
                        {
                          id: "skip",
                          title: t("finance.recurring.skipCycle"),
                          attributes: {
                            destructive: true,
                          },
                          image: skipIcon,
                        },
                      ]}
                    >
                      <View style={styles.dotsBtn}>
                        <MoreVertical size={18} color={colors.textMuted} />
                      </View>
                    </ActionMenu>
                  </View>
                )
              })}
            </Card>
          )
        ) : /* TAB 2: Recurring Rules / Templates */
        filteredRecurring.length === 0 ? (
          <EmptyState
            icon={<Layers size={32} color={colors.textMuted} />}
            title={t("finance.recurring.mobile.emptyTemplatesTitle")}
            description={
              typeFilter === "ALL"
                ? t("finance.recurring.mobile.emptyTemplatesDesc")
                : t("finance.recurring.mobile.emptyTemplatesType", {
                    type: t(
                      typeFilter === "INCOME"
                        ? "finance.recurring.mobile.typeIncome"
                        : "finance.recurring.mobile.typeExpense"
                    ),
                  })
            }
          />
        ) : (
          <Card style={styles.listCard}>
            {filteredRecurring.map((rt, idx) => {
              const isIncome = rt.type === "INCOME"
              const isActive = rt.status === "ACTIVE" || !rt.status
              const nextDueStr = formatNextDueDate(
                rt.executionState?.nextDueDate,
                tz.timezone
              )

              return (
                <View
                  key={rt.id || idx}
                  style={[
                    styles.txRow,
                    idx < filteredRecurring.length - 1 && styles.rowBorder,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.txMainPressable}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.light()
                      router.push({
                        pathname: "/modal/manage-recurring",
                        params: { id: rt.id },
                      })
                    }}
                  >
                    <View style={styles.txLeft}>
                      <View
                        style={[
                          styles.actionIconBadge,
                          {
                            backgroundColor: isIncome
                              ? colors.successSubtle
                              : colors.primarySubtle,
                          },
                        ]}
                      >
                        {isIncome ? (
                          <ArrowDownLeft size={16} color={colors.success} />
                        ) : (
                          <Layers size={16} color={colors.primary} />
                        )}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.txName} numberOfLines={1}>
                          {rt.name}
                        </Text>
                        <View style={styles.badgeRow}>
                          <Badge
                            size="sm"
                            label={getLocalizedIntervalLabel(
                              rt.interval,
                              locale
                            )}
                            bg={colors.surfaceHighlight}
                            border={colors.border}
                            color={colors.textSecondary}
                          />
                          {nextDueStr !== "N/A" ? (
                            <Text style={styles.txMeta}>
                              {t("finance.recurring.nextLabel")} {nextDueStr}
                            </Text>
                          ) : null}
                          <Badge
                            size="sm"
                            label={
                              isActive
                                ? t("finance.recurring.mobile.badgeActive")
                                : t("finance.recurring.mobile.badgePaused")
                            }
                            bg={
                              isActive
                                ? colors.primarySubtle
                                : colors.surfaceElevated
                            }
                            border={
                              isActive
                                ? "rgba(99, 102, 241, 0.3)"
                                : colors.border
                            }
                            color={isActive ? colors.primary : colors.textMuted}
                          />
                        </View>
                      </View>
                    </View>

                    <MonoAmount
                      size="sm"
                      color={isIncome ? colors.success : colors.textPrimary}
                    >
                      {isIncome ? "+" : "-"}
                      {formatAmount(rt.amount, rt.currency || baseCurrency)}
                    </MonoAmount>
                  </TouchableOpacity>

                  <ActionMenu
                    title={rt.name}
                    colorScheme={resolvedMode}
                    style={styles.menuTriggerWrapper}
                    onPressAction={({ nativeEvent }) => {
                      if (nativeEvent.event === "edit") {
                        haptics.light()
                        router.push({
                          pathname: "/modal/manage-recurring",
                          params: { id: rt.id },
                        })
                      } else if (nativeEvent.event === "toggle-status") {
                        handleToggleTemplateStatus(rt)
                      } else if (nativeEvent.event === "delete") {
                        promptDeleteTemplate(rt)
                      }
                    }}
                    actions={[
                      {
                        id: "edit",
                        title: t("finance.budgets.editTemplate"),
                        image: editIcon,
                      },
                      {
                        id: "toggle-status",
                        title: isActive
                          ? t("finance.recurring.mobile.pauseRule")
                          : t("finance.recurring.mobile.resumeRule"),
                        image: isActive ? pauseIcon : resumeIcon,
                      },
                      {
                        id: "delete",
                        title: t("common.delete"),
                        attributes: {
                          destructive: true,
                        },
                        image: deleteIcon,
                      },
                    ]}
                  >
                    <View style={styles.dotsBtn}>
                      <MoreVertical size={18} color={colors.textMuted} />
                    </View>
                  </ActionMenu>
                </View>
              )
            })}
          </Card>
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
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overviewGrid: {
    flexDirection: "row" as const,
    gap: 12,
  },
  overviewCard: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  overviewHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  overviewLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  overviewAmount: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  overviewUnit: {
    fontSize: 11,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  forecastCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.warning,
  },
  forecastLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  forecastTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  forecastSubtitle: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surface,
    padding: 4,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  tabTextActive: {
    color: t.colors.textPrimary,
    fontWeight: "700" as const,
  },
  filterRow: {
    flexDirection: "row" as const,
    gap: 8,
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
  listCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
  txRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  txMainPressable: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
  },
  menuTriggerWrapper: {
    paddingRight: 10,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  txLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  itemInfo: {
    gap: 4,
    flex: 1,
  },
  txName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  badgeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flexWrap: "wrap" as const,
  },
  txMeta: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
})
