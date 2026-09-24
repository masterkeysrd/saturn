import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
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
import { MenuView } from "@expo/ui/community/menu"
import {
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  useUpdateRecurringTransactionMutation,
  useDeleteRecurringTransactionMutation,
  useSkipScheduledTransactionMutation,
  useGetFinanceSettingsQuery,
  type RecurringTransaction,
  type ScheduledTransaction,
  type ListScheduledTransactionsRequest,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatCents,
  formatAmount,
  formatInterval,
  formatNextDueDate,
  isStatusActive,
} from "@saturn/core"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

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

function getDueDateBadge(dueDateStr?: string) {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr)
  if (isNaN(due.getTime())) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate())

  const diffMs = dueDateOnly.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays)
    return {
      label: overdueDays === 1 ? "Overdue (1d)" : `Overdue (${overdueDays}d)`,
      isOverdue: true,
      isToday: false,
    }
  } else if (diffDays === 0) {
    return {
      label: "Due Today",
      isOverdue: false,
      isToday: true,
    }
  } else if (diffDays === 1) {
    return {
      label: "Due Tomorrow",
      isOverdue: false,
      isToday: false,
    }
  } else if (diffDays <= 7) {
    return {
      label: `In ${diffDays} days`,
      isOverdue: false,
      isToday: false,
    }
  }
  return null
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getScheduledTitle(st: ScheduledTransaction) {
  return (
    st.metadata?.name ||
    st.recurringTransaction?.name ||
    st.metadata?.description ||
    (st.type === "INCOME" ? "Scheduled Income" : "Scheduled Bill")
  )
}

type TabType = "upcoming" | "templates"
type TypeFilter = "ALL" | "EXPENSE" | "INCOME"

export default function RecurringScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("upcoming")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL")

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
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
  const convertToBase = (amountVal: number, fromCurrency: string) => {
    if (!baseCurrency || fromCurrency === baseCurrency) {
      return amountVal
    }
    const preview = getConversionPreview(amountVal.toString(), fromCurrency)
    if (preview && "amount" in preview && typeof preview.amount === "number") {
      return preview.amount
    }
    return amountVal
  }

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
    }, [recurringList, scheduledList, baseCurrency, getConversionPreview])

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
      "Skip Upcoming Cycle?",
      `Are you sure you want to skip "${getScheduledTitle(st)}"? It will not be logged as an expense.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip Cycle",
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
                title: "Cycle Skipped",
                message: "Scheduled cycle has been skipped.",
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Skip Failed",
                message: err?.message || "Could not skip cycle.",
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
        title: nextStatus === "ACTIVE" ? "Template Resumed" : "Template Paused",
        message: `"${rt.name}" is now ${nextStatus.toLowerCase()}.`,
        type: "success",
      })
      await invalidateFinanceQueries(queryClient)
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Update Failed",
        message: err?.message || "Could not update status.",
        type: "error",
      })
    }
  }

  // Quick Action: Delete Template
  const promptDeleteTemplate = (rt: RecurringTransaction) => {
    if (!rt.id) return
    haptics.warning()

    Alert.alert(
      "Delete Recurring Template?",
      `Are you sure you want to delete "${rt.name}"? Future scheduled instances will no longer generate.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
                title: "Template Deleted",
                message: `"${rt.name}" was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete template.",
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
          headerTitle: "Recurring & Bills",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push("/modal/manage-recurring")
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
        {/* Overview Metric Cards */}
        <View style={styles.overviewGrid}>
          <Card style={styles.overviewCard}>
            <View style={styles.overviewHeaderRow}>
              <View
                style={[
                  styles.metricIconCircle,
                  { backgroundColor: theme.colors.successSubtle },
                ]}
              >
                <TrendingUp size={16} color={theme.colors.success} />
              </View>
              <Caption style={styles.overviewLabel}>RECURRING INCOME</Caption>
            </View>
            <Text
              style={[styles.overviewAmount, { color: theme.colors.success }]}
            >
              +
              {monthlyIncomes.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.overviewUnit}>{baseCurrency} / month</Text>
          </Card>

          <Card style={styles.overviewCard}>
            <View style={styles.overviewHeaderRow}>
              <View
                style={[
                  styles.metricIconCircle,
                  { backgroundColor: theme.colors.destructiveSubtle },
                ]}
              >
                <TrendingDown size={16} color={theme.colors.destructive} />
              </View>
              <Caption style={styles.overviewLabel}>FIXED OVERHEAD</Caption>
            </View>
            <Text
              style={[
                styles.overviewAmount,
                { color: theme.colors.textPrimary },
              ]}
            >
              -
              {monthlyExpenses.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.overviewUnit}>{baseCurrency} / month</Text>
          </Card>
        </View>

        {/* 30-Day Outflow Highlight */}
        <Card style={styles.forecastCard}>
          <View style={styles.forecastLeft}>
            <Calendar size={18} color={theme.colors.warning} />
            <View>
              <Text style={styles.forecastTitle}>Next 30 Days Outflows</Text>
              <Text style={styles.forecastSubtitle}>
                Estimated upcoming fixed commitments
              </Text>
            </View>
          </View>
          <MonoAmount size="md" color={theme.colors.warning}>
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
                activeTab === "upcoming"
                  ? theme.colors.primary
                  : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "upcoming" && styles.tabTextActive,
              ]}
            >
              Upcoming Cycles ({scheduledList.length})
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
                activeTab === "templates"
                  ? theme.colors.primary
                  : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "templates" && styles.tabTextActive,
              ]}
            >
              Recurring Rules ({recurringList.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(
            [
              { key: "ALL", label: "All" },
              { key: "EXPENSE", label: "Bills & Expenses" },
              { key: "INCOME", label: "Salaries & Income" },
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
              icon={<CalendarClock size={32} color={theme.colors.textMuted} />}
              title="No upcoming scheduled items"
              description={
                typeFilter === "ALL"
                  ? "All upcoming recurring bills and deposits are up to date."
                  : `No upcoming ${typeFilter.toLowerCase()} scheduled items.`
              }
            />
          ) : (
            <Card style={styles.listCard}>
              {filteredScheduled.map((st, idx) => {
                const isIncome = st.type === "INCOME"
                const dueBadge = getDueDateBadge(st.dueDate)
                const title = getScheduledTitle(st)

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
                                ? theme.colors.successSubtle
                                : theme.colors.primarySubtle,
                            },
                          ]}
                        >
                          {isIncome ? (
                            <ArrowDownLeft
                              size={16}
                              color={theme.colors.success}
                            />
                          ) : (
                            <CalendarClock
                              size={16}
                              color={theme.colors.primary}
                            />
                          )}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.txName} numberOfLines={1}>
                            {title}
                          </Text>
                          <View style={styles.badgeRow}>
                            {st.dueDate ? (
                              <Text style={styles.txMeta}>
                                {formatDate(st.dueDate)}
                              </Text>
                            ) : null}
                            {isIncome ? (
                              <Badge
                                size="sm"
                                label="Deposit Due"
                                bg={theme.colors.successSubtle}
                                border="rgba(16, 185, 129, 0.3)"
                                color={theme.colors.success}
                              />
                            ) : dueBadge ? (
                              <Badge
                                size="sm"
                                label={dueBadge.label}
                                bg={
                                  dueBadge.isOverdue
                                    ? theme.colors.destructiveSubtle
                                    : dueBadge.isToday
                                      ? theme.colors.warningSubtle
                                      : theme.colors.surfaceHighlight
                                }
                                border={
                                  dueBadge.isOverdue
                                    ? "rgba(244, 63, 94, 0.3)"
                                    : dueBadge.isToday
                                      ? "rgba(245, 158, 11, 0.3)"
                                      : theme.colors.border
                                }
                                color={
                                  dueBadge.isOverdue
                                    ? theme.colors.destructive
                                    : dueBadge.isToday
                                      ? theme.colors.warning
                                      : theme.colors.textMuted
                                }
                              />
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <MonoAmount
                        size="sm"
                        color={
                          isIncome
                            ? theme.colors.success
                            : theme.colors.textPrimary
                        }
                      >
                        {isIncome ? "+" : "-"}
                        {formatAmount(st.amount, st.currency || baseCurrency)}
                      </MonoAmount>
                    </TouchableOpacity>

                    <MenuView
                      title={title}
                      colorScheme="dark"
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
                          title: isIncome ? "Confirm Deposit" : "Confirm / Pay",
                          image: isIncome ? depositIcon : confirmIcon,
                        },
                        {
                          id: "skip",
                          title: "Skip Cycle",
                          attributes: {
                            destructive: true,
                          },
                          image: skipIcon,
                        },
                      ]}
                    >
                      <View style={styles.dotsBtn}>
                        <MoreVertical
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </View>
                    </MenuView>
                  </View>
                )
              })}
            </Card>
          )
        ) : /* TAB 2: Recurring Rules / Templates */
        filteredRecurring.length === 0 ? (
          <EmptyState
            icon={<Layers size={32} color={theme.colors.textMuted} />}
            title="No recurring templates"
            description={
              typeFilter === "ALL"
                ? "Tap the '+' button at the top to create a recurring rule."
                : `No ${typeFilter.toLowerCase()} recurring rules configured.`
            }
          />
        ) : (
          <Card style={styles.listCard}>
            {filteredRecurring.map((rt, idx) => {
              const isIncome = rt.type === "INCOME"
              const isActive = rt.status === "ACTIVE" || !rt.status
              const nextDueStr = formatNextDueDate(
                rt.executionState?.nextDueDate
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
                              ? theme.colors.successSubtle
                              : theme.colors.primarySubtle,
                          },
                        ]}
                      >
                        {isIncome ? (
                          <ArrowDownLeft
                            size={16}
                            color={theme.colors.success}
                          />
                        ) : (
                          <Layers size={16} color={theme.colors.primary} />
                        )}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.txName} numberOfLines={1}>
                          {rt.name}
                        </Text>
                        <View style={styles.badgeRow}>
                          <Badge
                            size="sm"
                            label={formatInterval(rt.interval)}
                            bg={theme.colors.surfaceHighlight}
                            border={theme.colors.border}
                            color={theme.colors.textSecondary}
                          />
                          {nextDueStr !== "N/A" ? (
                            <Text style={styles.txMeta}>
                              Next: {nextDueStr}
                            </Text>
                          ) : null}
                          <Badge
                            size="sm"
                            label={isActive ? "Active" : "Paused"}
                            bg={
                              isActive
                                ? theme.colors.primarySubtle
                                : theme.colors.surfaceElevated
                            }
                            border={
                              isActive
                                ? "rgba(99, 102, 241, 0.3)"
                                : theme.colors.border
                            }
                            color={
                              isActive
                                ? theme.colors.primary
                                : theme.colors.textMuted
                            }
                          />
                        </View>
                      </View>
                    </View>

                    <MonoAmount
                      size="sm"
                      color={
                        isIncome
                          ? theme.colors.success
                          : theme.colors.textPrimary
                      }
                    >
                      {isIncome ? "+" : "-"}
                      {formatAmount(rt.amount, rt.currency || baseCurrency)}
                    </MonoAmount>
                  </TouchableOpacity>

                  <MenuView
                    title={rt.name}
                    colorScheme="dark"
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
                        title: "Edit Template",
                        image: editIcon,
                      },
                      {
                        id: "toggle-status",
                        title: isActive ? "Pause Rule" : "Resume Rule",
                        image: isActive ? pauseIcon : resumeIcon,
                      },
                      {
                        id: "delete",
                        title: "Delete",
                        attributes: {
                          destructive: true,
                        },
                        image: deleteIcon,
                      },
                    ]}
                  >
                    <View style={styles.dotsBtn}>
                      <MoreVertical size={18} color={theme.colors.textMuted} />
                    </View>
                  </MenuView>
                </View>
              )
            })}
          </Card>
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
    paddingBottom: 48,
    gap: 16,
  },
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overviewGrid: {
    flexDirection: "row",
    gap: 12,
  },
  overviewCard: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  overviewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  overviewLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  overviewAmount: {
    fontSize: 18,
    fontWeight: "800",
  },
  overviewUnit: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  forecastCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
  },
  forecastLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  forecastTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  forecastSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  tabTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  filterPillTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  listCard: {
    padding: 0,
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  txMainPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
  },
  menuTriggerWrapper: {
    paddingRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    gap: 4,
    flex: 1,
  },
  txName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  txMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
})
