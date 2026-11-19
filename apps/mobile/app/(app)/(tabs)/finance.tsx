import { useState, useMemo, useRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import BottomSheet from "@gorhom/bottom-sheet"
import { useQueryClient } from "@tanstack/react-query"
import {
  ReceiptText,
  PiggyBank,
  Landmark,
  ChevronRight,
  ArrowDownLeft,
  Wallet,
  ArrowRight,
  Plus,
  CalendarClock,
  HandCoins,
  MoreVertical,
  Inbox,
  AlertTriangle,
} from "lucide-react-native"
import {
  formatAmount,
  calculateAccountMetrics,
  getScheduledDisplayName,
  parseDate,
  resolveFinancePeriodBounds,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import {
  useListTransactionsQuery,
  useGetInsightsQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetSettingsQuery,
  useListScheduledTransactionsQuery,
  useListRecurringTransactionsQuery,
  useSkipScheduledTransactionMutation,
  useListBorrowingsQuery,
  useListInboxItemsQuery,
  type Transaction,
  type Budget,
  type Account,
  type Account_InstitutionInfo,
  type ScheduledTransaction,
  type Borrowing,
  type ListScheduledTransactionsRequest,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { SpaceAvatarButton, AIHeaderButton } from "@/components/app-header"
import {
  QuickCaptureFab,
  QuickCaptureSheet,
} from "@/components/ui/quick-capture-sheet"
import {
  canWriteWorkspace,
  getFinanceQuickCaptureActions,
} from "@/lib/quick-capture"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Icon } from "@expo/ui"
import { ActionMenu } from "@/components/ui/action-menu"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { CardAccountItem } from "@/components/finance/card-account-item"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

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

const paymentIcon = Icon.select({
  ios: "dollarsign.circle",
  android: require("@expo/material-symbols/payments.xml"),
})

const detailsIcon = Icon.select({
  ios: "info.circle",
  android: require("@expo/material-symbols/info.xml"),
})

export default function FinanceHubScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { activeSpaceId, activeSpaceRole } = useSpace()
  const isViewer = !canWriteWorkspace(activeSpaceRole)
  const quickActionsRef = useRef<BottomSheet>(null)
  const tz = useTimezone()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [refreshing, setRefreshing] = useState(false)
  const financeQuickActions = useMemo(
    () => getFinanceQuickCaptureActions(activeSpaceRole),
    [activeSpaceRole]
  )

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Exchange Rates & Multi-Currency Conversion
  const { exchangeRates, getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  // 3. Accounts for Net Worth & Accounts Summary
  const { data: accountsData, isLoading: accountsLoading } =
    useListAccountsQuery({ activeOnly: true }, { enabled: !!activeSpaceId })

  // 4. Recent Transactions Preview (limit 4)
  const { data: txData, isLoading: txLoading } = useListTransactionsQuery(
    { pageSize: 4, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  // 5. Monthly Insights (Current Month Budget Usage & Overall Spending)
  const thisMonthBounds = useMemo(
    () =>
      resolveFinancePeriodBounds(
        { period: "this_month", month: "", dateFrom: "", dateTo: "" },
        tz.now(),
        tz.timezone,
        tz.locale
      ),
    [tz]
  )

  const { data: insightsData, isLoading: insightsLoading } =
    useGetInsightsQuery(
      {
        granularity: "MONTHLY",
        startDate: thisMonthBounds.startISO,
        endDate: thisMonthBounds.endISO,
      },
      { enabled: !!activeSpaceId }
    )

  // 6. Institutions for Logo & Info
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions = useMemo(
    () => instData?.institutions || [],
    [instData?.institutions]
  )
  const instMap = useMemo(() => {
    const map = new Map<string, Account_InstitutionInfo>()
    institutions.forEach((inst) => {
      if (inst.id) map.set(inst.id, inst as Account_InstitutionInfo)
    })
    return map
  }, [institutions])

  // 7. Pending Scheduled Transactions (Urgent Recurring)
  const { data: scheduledData, isLoading: scheduledLoading } =
    useListScheduledTransactionsQuery(
      {
        pageSize: 20,
        pageToken: "",
        status: "PENDING",
        startDate: "",
        endDate: "",
        view: "FULL",
      } as unknown as ListScheduledTransactionsRequest,
      { enabled: !!activeSpaceId }
    )

  // 8. Active Borrowings (Debts & Loans)
  const { data: borrowingsData, isLoading: borrowingsLoading } =
    useListBorrowingsQuery(
      { pageSize: 20, pageToken: "", status: "ACTIVE" },
      { enabled: !!activeSpaceId }
    )

  // 9. Pending Inbox Items (Forwarded emails & notifications for web triage)
  const { data: inboxData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 50,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: !!activeSpaceId }
  )
  const pendingInboxCount = inboxData?.inboxItems?.length ?? 0

  // 10. Recurring Transaction Templates (for scheduled item name resolution)
  const { data: recurringData } = useListRecurringTransactionsQuery(
    {
      pageSize: 100,
      pageToken: "",
      status: "STATUS_UNSPECIFIED",
    },
    { enabled: !!activeSpaceId }
  )
  const recurringTemplates = useMemo(
    () => recurringData?.recurringTransactions || [],
    [recurringData]
  )

  const skipScheduledMutation = useSkipScheduledTransactionMutation()
  const toast = useToast()

  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )
  const transactions = txData?.transactions || []

  // Compute live multi-currency metrics
  const metrics = useMemo(() => {
    return calculateAccountMetrics(accounts, baseCurrency, exchangeRates)
  }, [accounts, baseCurrency, exchangeRates])

  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((a) => {
      if (a.id) map.set(a.id, a)
    })
    return map
  }, [accounts])

  // Pre-aggregated budget metrics & category usage from backend Insights
  const budgetStats = useMemo(() => {
    const spentInfo = insightsData?.spent
    const totalLimitCents = Number(spentInfo?.totalLimit || "0")
    const totalSpentCents = Number(spentInfo?.totalSpent || "0")
    const remainingCents = Number(spentInfo?.remainingBudget || "0")
    const distributions = spentInfo?.distributions || []

    const hasBudgets = totalLimitCents > 0 || distributions.length > 0
    const rawPercentage =
      totalLimitCents > 0
        ? Math.round((totalSpentCents / totalLimitCents) * 100)
        : 0
    const progressPercentage = Math.min(Math.max(rawPercentage, 0), 100)
    const isOver = totalSpentCents > totalLimitCents && totalLimitCents > 0
    const isWarning = rawPercentage >= 85 && !isOver

    const onTrackCount = distributions.filter(
      (d) => (d.usagePercentage || 0) < 85
    ).length
    const warningCount = distributions.filter(
      (d) => (d.usagePercentage || 0) >= 85 && (d.usagePercentage || 0) <= 100
    ).length
    const overCount = distributions.filter(
      (d) => (d.usagePercentage || 0) > 100
    ).length

    // Critical budget callout (highest usage with >= 85%)
    const sortedByUsage = [...distributions].sort(
      (a, b) => (b.usagePercentage || 0) - (a.usagePercentage || 0)
    )
    const topCritical =
      sortedByUsage.length > 0 && (sortedByUsage[0].usagePercentage || 0) >= 85
        ? sortedByUsage[0]
        : null

    return {
      hasBudgets,
      totalLimitCents,
      totalSpentCents,
      remainingCents,
      rawPercentage,
      progressPercentage,
      isOver,
      isWarning,
      onTrackCount,
      warningCount,
      overCount,
      topCritical,
    }
  }, [insightsData])

  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    const distributions = insightsData?.spent?.distributions || []
    distributions.forEach((d) => {
      if (d.budgetId) {
        map.set(d.budgetId, {
          id: d.budgetId,
          name: d.budgetName,
          color: d.budgetColor,
          icon: d.budgetIcon,
        } as Budget)
      }
    })
    return map
  }, [insightsData])

  const scheduledList = useMemo(() => {
    const list = scheduledData?.scheduledTransactions || []
    return [...list].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : 0
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : 0
      return timeA - timeB
    })
  }, [scheduledData])

  const borrowingsList = useMemo(() => {
    return borrowingsData?.borrowings || []
  }, [borrowingsData])

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const firstKey = query.queryKey[0]
          return (
            typeof firstKey === "string" &&
            firstKey.startsWith("/api/v1/finance")
          )
        },
      })
    } finally {
      setRefreshing(false)
    }
  }

  const navigateTo = (path: string) => {
    haptics.light()
    router.push(path as never)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ""
    return tz.format(dateStr, { month: "short", day: "numeric" })
  }

  const getDueDateBadge = (dueDateStr?: string) => {
    if (!dueDateStr) return null
    const due = parseDate(dueDateStr)
    if (!due) return null
    const now = new Date()

    const startToday = tz.startOfDay(now)
    const startDue = tz.startOfDay(due)
    const diffDays = Math.round(
      (startDue.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays)
      return {
        label: absDays === 1 ? "Overdue 1 day" : `Overdue ${absDays} days`,
        isOverdue: true,
        isToday: false,
      }
    }
    if (diffDays === 0) {
      return {
        label: "Due Today",
        isOverdue: false,
        isToday: true,
      }
    }
    return {
      label: diffDays === 1 ? "Due tomorrow" : `Due in ${diffDays} days`,
      isOverdue: false,
      isToday: false,
    }
  }

  const promptSkipScheduled = (st: ScheduledTransaction) => {
    const title = getScheduledDisplayName(st, recurringTemplates)
    Alert.alert(
      "Skip Scheduled Cycle?",
      `Are you sure you want to skip this cycle for "${title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: async () => {
            try {
              await skipScheduledMutation.mutateAsync({
                id: st.id || "",
                req: { id: st.id || "" },
              })
              haptics.success()
              toast.show({
                title: "Cycle Skipped",
                message: "The scheduled cycle was skipped.",
                type: "info",
              })
              await handleRefresh()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Failed to Skip",
                message: err?.message || "Could not skip cycle.",
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
      {/* Single-Row Safe-Area Finance Header */}
      <View
        style={[styles.topHeader, { paddingTop: Math.max(insets.top, 10) + 4 }]}
      >
        <View style={styles.topHeaderLeft}>
          <Text style={styles.topHeaderTitle} numberOfLines={1}>
            Finance
          </Text>
          <Badge size="sm" label={baseCurrency} />
        </View>
        <View style={styles.topHeaderRight}>
          <AIHeaderButton />
          <SpaceAvatarButton size={30} />
        </View>
      </View>

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
        {/* Amazon-style Sub-Navigation Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/transactions")}
          >
            <ReceiptText size={15} color={colors.primary} />
            <Text style={styles.navPillText}>Transactions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/budgets")}
          >
            <PiggyBank size={15} color={colors.accent} />
            <Text style={styles.navPillText}>Budgets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/accounts")}
          >
            <Landmark size={15} color={colors.success} />
            <Text style={styles.navPillText}>Accounts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/recurring")}
          >
            <CalendarClock size={15} color={colors.warning} />
            <Text style={styles.navPillText}>Recurring</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/borrowing")}
          >
            <HandCoins size={15} color={colors.primary} />
            <Text style={styles.navPillText}>Borrowing</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/inbox")}
            testID="finance-pill-review"
          >
            <Inbox size={15} color={colors.brandSecondary} />
            <Text style={styles.navPillText}>Review</Text>
            {pendingInboxCount > 0 && (
              <Badge
                variant="primary"
                size="sm"
                label={String(pendingInboxCount)}
              />
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Pending Inbox Items Banner */}
        {pendingInboxCount > 0 && (
          <TouchableOpacity
            style={styles.inboxBanner}
            activeOpacity={0.8}
            onPress={() => navigateTo("/(app)/finance/inbox")}
            testID="finance-pending-inbox-banner"
          >
            <View style={styles.inboxBannerIconContainer}>
              <Inbox size={18} color={colors.primary} />
            </View>
            <View style={styles.inboxBannerTextContainer}>
              <Text style={styles.inboxBannerTitle}>
                {pendingInboxCount === 1
                  ? "1 Pending Inbox Item"
                  : `${pendingInboxCount} Pending Inbox Items`}
              </Text>
              <Text style={styles.inboxBannerSubtitle}>
                Tap to review and approve into your ledger
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Primary Net Liquidity Card */}
        <Card style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <View style={styles.netWorthHeaderLeft}>
              <Wallet size={15} color={colors.primary} />
              <Caption style={styles.netWorthTitle}>NET LIQUIDITY</Caption>
            </View>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/accounts")}
            >
              <Text style={styles.seeAllText}>Accounts</Text>
              <ChevronRight size={13} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <MonoAmount size="xl" style={styles.netWorthAmount}>
            {formatAmount(String(metrics.netWorthCents), baseCurrency)}
          </MonoAmount>

          <View style={styles.assetsLiabilitiesRow}>
            <View style={styles.assetItem}>
              <Caption>Total Assets</Caption>
              <MonoAmount size="sm" color={colors.success}>
                +{formatAmount(String(metrics.totalAssetsCents), baseCurrency)}
              </MonoAmount>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.assetItem}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/borrowing")}
            >
              <View style={styles.assetItemHeader}>
                <Caption>Total Debt</Caption>
                <ChevronRight size={11} color={colors.textMuted} />
              </View>
              <MonoAmount size="sm" color={colors.destructive}>
                -
                {formatAmount(
                  String(metrics.totalLiabilitiesCents),
                  baseCurrency
                )}
              </MonoAmount>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Section 1: Recent Transactions Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>RECENT TRANSACTIONS</Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/transactions")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {txLoading ? (
            <SkeletonCard />
          ) : transactions.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent transactions</Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                activeOpacity={0.7}
                onPress={() => {
                  haptics.medium()
                  router.push("/modal/add-transaction")
                }}
              >
                <Plus size={14} color={colors.primary} />
                <Text style={styles.emptyActionText}>Add Transaction</Text>
              </TouchableOpacity>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {transactions.map((tx: Transaction, idx) => (
                <TransactionListItem
                  key={tx.id || idx}
                  item={tx}
                  baseCurrency={baseCurrency}
                  account={
                    tx.accountId ? accountsMap.get(tx.accountId) : undefined
                  }
                  budget={tx.budgetId ? budgetsMap.get(tx.budgetId) : undefined}
                  onPress={() =>
                    tx.id
                      ? navigateTo(`/(app)/finance/transactions/${tx.id}`)
                      : navigateTo("/(app)/finance/transactions")
                  }
                  showBorderBottom={idx < transactions.length - 1}
                />
              ))}
              <TouchableOpacity
                style={styles.cardFooterAction}
                activeOpacity={0.7}
                onPress={() => {
                  haptics.medium()
                  router.push("/modal/add-transaction")
                }}
              >
                <Plus size={14} color={colors.primary} />
                <Text style={styles.cardFooterActionText}>Add Transaction</Text>
              </TouchableOpacity>
            </Card>
          )}
        </View>

        {/* Section 2: Accounts Summary Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>ACCOUNTS SUMMARY</Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/accounts")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {accountsLoading ? (
            <SkeletonCard height={190} />
          ) : accounts.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No accounts connected</Text>
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalAccountsScroll}
              contentContainerStyle={styles.horizontalAccountsContainer}
            >
              {accounts.map((acc: Account) => {
                const balanceCents = acc.currentBalance || "0"
                const balanceNum = Number(balanceCents)
                const isDifferentCurrency =
                  acc.currency && acc.currency !== baseCurrency

                let convertedStr = ""
                if (isDifferentCurrency) {
                  const preview = getConversionPreview(
                    String(Math.abs(balanceNum) / 100),
                    acc.currency
                  )
                  if (preview && "amount" in preview) {
                    convertedStr = `≈ ${formatAmount(
                      Math.round(preview.amount * 100),
                      baseCurrency
                    )}`
                  }
                }

                return (
                  <CardAccountItem
                    key={acc.id}
                    acc={acc}
                    institution={
                      acc.institutionId
                        ? instMap.get(acc.institutionId)
                        : undefined
                    }
                    baseCurrency={baseCurrency}
                    convertedText={convertedStr}
                    width={300}
                    onPress={() =>
                      acc.id
                        ? navigateTo(`/(app)/finance/accounts/${acc.id}`)
                        : navigateTo("/(app)/finance/accounts")
                    }
                  />
                )
              })}
            </ScrollView>
          )}
        </View>

        {/* Section 3: Budget Health Overview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>BUDGET HEALTH</Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/budgets")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {insightsLoading ? (
            <SkeletonCard height={140} />
          ) : !budgetStats.hasBudgets ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active budgets configured</Text>
            </Card>
          ) : (
            <Card
              style={styles.budgetStatsCard}
              onPress={() => navigateTo("/(app)/finance/budgets")}
            >
              {/* Header row: Total Spent / Limit & Percentage Badge */}
              <View style={styles.budgetStatsHeader}>
                <View style={styles.budgetStatsSpendCol}>
                  <View style={styles.budgetStatsLabelRow}>
                    <PiggyBank size={15} color={colors.accent} />
                    <Caption style={styles.budgetStatsCaption}>
                      TOTAL SPENT THIS MONTH
                    </Caption>
                  </View>
                  <View style={styles.budgetStatsAmountRow}>
                    <MonoAmount size="lg" style={styles.budgetStatsSpentAmount}>
                      {formatAmount(
                        String(budgetStats.totalSpentCents),
                        baseCurrency
                      )}
                    </MonoAmount>
                    <Text style={styles.budgetStatsLimitText}>
                      {" "}
                      of{" "}
                      {formatAmount(
                        String(budgetStats.totalLimitCents),
                        baseCurrency
                      )}
                    </Text>
                  </View>
                </View>

                <Badge
                  size="md"
                  label={`${budgetStats.rawPercentage}%`}
                  bg={
                    budgetStats.isOver
                      ? colors.destructiveSubtle
                      : budgetStats.isWarning
                        ? colors.warningSubtle
                        : colors.primarySubtle
                  }
                  border={
                    budgetStats.isOver
                      ? "rgba(244, 63, 94, 0.3)"
                      : budgetStats.isWarning
                        ? "rgba(245, 158, 11, 0.3)"
                        : "rgba(56, 189, 248, 0.3)"
                  }
                  color={
                    budgetStats.isOver
                      ? colors.destructive
                      : budgetStats.isWarning
                        ? colors.warning
                        : colors.primary
                  }
                />
              </View>

              {/* Progress Bar */}
              <View style={styles.budgetStatsProgressTrack}>
                <View
                  style={[
                    styles.budgetStatsProgressBar,
                    {
                      width: `${budgetStats.progressPercentage}%`,
                      backgroundColor: budgetStats.isOver
                        ? colors.destructive
                        : budgetStats.isWarning
                          ? colors.warning
                          : colors.primary,
                    },
                  ]}
                />
              </View>

              {/* Remaining & Breakdown row */}
              <View style={styles.budgetStatsFooterRow}>
                <View style={styles.budgetStatsRemaining}>
                  <Caption>
                    {budgetStats.isOver
                      ? "Over budget by"
                      : "Remaining allowance"}
                  </Caption>
                  <MonoAmount
                    size="sm"
                    color={
                      budgetStats.isOver ? colors.destructive : colors.success
                    }
                  >
                    {budgetStats.isOver ? "-" : "+"}
                    {formatAmount(
                      String(
                        budgetStats.isOver
                          ? budgetStats.totalSpentCents -
                              budgetStats.totalLimitCents
                          : budgetStats.remainingCents
                      ),
                      baseCurrency
                    )}
                  </MonoAmount>
                </View>

                {/* Health Pills */}
                <View style={styles.budgetHealthPills}>
                  {budgetStats.onTrackCount > 0 && (
                    <View style={styles.healthPill}>
                      <View
                        style={[
                          styles.healthDot,
                          { backgroundColor: colors.success },
                        ]}
                      />
                      <Text style={styles.healthPillText}>
                        {budgetStats.onTrackCount} on track
                      </Text>
                    </View>
                  )}
                  {budgetStats.warningCount > 0 && (
                    <View style={styles.healthPill}>
                      <View
                        style={[
                          styles.healthDot,
                          { backgroundColor: colors.warning },
                        ]}
                      />
                      <Text style={styles.healthPillText}>
                        {budgetStats.warningCount} warning
                      </Text>
                    </View>
                  )}
                  {budgetStats.overCount > 0 && (
                    <View style={styles.healthPill}>
                      <View
                        style={[
                          styles.healthDot,
                          { backgroundColor: colors.destructive },
                        ]}
                      />
                      <Text style={styles.healthPillText}>
                        {budgetStats.overCount} over
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Top Alert Callout if a category is warning or over budget */}
              {budgetStats.topCritical && (
                <View
                  style={[
                    styles.criticalCalloutRow,
                    budgetStats.topCritical.usagePercentage > 100 &&
                      styles.criticalCalloutRowOver,
                  ]}
                >
                  <View style={styles.criticalCalloutLeft}>
                    <AlertTriangle
                      size={13}
                      color={
                        budgetStats.topCritical.usagePercentage > 100
                          ? colors.destructive
                          : colors.warning
                      }
                    />
                    <Text
                      style={[
                        styles.criticalCalloutText,
                        budgetStats.topCritical.usagePercentage > 100 &&
                          styles.criticalCalloutTextOver,
                      ]}
                      numberOfLines={1}
                    >
                      {budgetStats.topCritical.budgetName} is at{" "}
                      {Math.round(budgetStats.topCritical.usagePercentage || 0)}
                      % (
                      {formatAmount(
                        budgetStats.topCritical.spentInBase ||
                          budgetStats.topCritical.spent,
                        baseCurrency
                      )}{" "}
                      of{" "}
                      {formatAmount(
                        budgetStats.topCritical.limit,
                        baseCurrency
                      )}
                      )
                    </Text>
                  </View>
                  <ChevronRight size={13} color={colors.textMuted} />
                </View>
              )}
            </Card>
          )}
        </View>

        {/* Section 4: Pending Scheduled / Recurring */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>
              PENDING SCHEDULED ({scheduledList.length})
            </Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/recurring")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {scheduledLoading ? (
            <SkeletonCard />
          ) : scheduledList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No pending scheduled transactions
              </Text>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {scheduledList
                .slice(0, 3)
                .map((st: ScheduledTransaction, idx) => {
                  const isIncome = st.type === "INCOME"
                  const dueBadge = getDueDateBadge(st.dueDate)

                  return (
                    <View
                      key={st.id || idx}
                      style={[
                        styles.txRow,
                        idx < Math.min(scheduledList.length, 3) - 1 &&
                          styles.rowBorder,
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
                              {getScheduledDisplayName(st, recurringTemplates)}
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
                                  bg={colors.successSubtle}
                                  border="rgba(16, 185, 129, 0.3)"
                                  color={colors.success}
                                />
                              ) : dueBadge ? (
                                <Badge
                                  size="sm"
                                  label={dueBadge.label}
                                  bg={
                                    dueBadge.isOverdue
                                      ? colors.destructiveSubtle
                                      : dueBadge.isToday
                                        ? colors.warningSubtle
                                        : colors.surfaceHighlight
                                  }
                                  border={
                                    dueBadge.isOverdue
                                      ? "rgba(244, 63, 94, 0.3)"
                                      : dueBadge.isToday
                                        ? "rgba(245, 158, 11, 0.3)"
                                        : colors.border
                                  }
                                  color={
                                    dueBadge.isOverdue
                                      ? colors.destructive
                                      : dueBadge.isToday
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
                        title={getScheduledDisplayName(st, recurringTemplates)}
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
                              ? "Confirm Deposit"
                              : "Confirm / Pay",
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
                          <MoreVertical size={18} color={colors.textMuted} />
                        </View>
                      </ActionMenu>
                    </View>
                  )
                })}
            </Card>
          )}
        </View>

        {/* Section 5: Debts & Loans */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>
              DEBTS & LOANS ({borrowingsList.length})
            </Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/borrowing")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {borrowingsLoading ? (
            <SkeletonCard />
          ) : borrowingsList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active debts or loans</Text>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {borrowingsList.slice(0, 3).map((b: Borrowing, idx) => {
                const isLent = b.direction === "LENT"

                return (
                  <View
                    key={b.id || idx}
                    style={[
                      styles.txRow,
                      idx < Math.min(borrowingsList.length, 3) - 1 &&
                        styles.rowBorder,
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.txMainPressable}
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light()
                        if (b.id) {
                          router.push(`/(app)/finance/borrowing/${b.id}`)
                        } else {
                          navigateTo("/(app)/finance/borrowing")
                        }
                      }}
                    >
                      <View style={styles.txLeft}>
                        <View
                          style={[
                            styles.actionIconBadge,
                            {
                              backgroundColor: isLent
                                ? colors.successSubtle
                                : colors.destructiveSubtle,
                            },
                          ]}
                        >
                          <HandCoins
                            size={16}
                            color={isLent ? colors.success : colors.destructive}
                          />
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.txName} numberOfLines={1}>
                            {b.counterparty || "Borrowing"}
                          </Text>
                          <View style={styles.badgeRow}>
                            <Badge
                              size="sm"
                              label={isLent ? "Owed to you" : "You owe"}
                              bg={
                                isLent
                                  ? colors.successSubtle
                                  : colors.destructiveSubtle
                              }
                              border={
                                isLent
                                  ? "rgba(16, 185, 129, 0.3)"
                                  : "rgba(244, 63, 94, 0.3)"
                              }
                              color={
                                isLent ? colors.success : colors.destructive
                              }
                            />
                            {b.dueAt ? (
                              <Text style={styles.txMeta}>
                                Due {formatDate(b.dueAt)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <MonoAmount
                        size="sm"
                        color={isLent ? colors.success : colors.destructive}
                      >
                        {formatAmount(
                          b.remainingAmount || b.totalAmount,
                          b.currency || baseCurrency
                        )}
                      </MonoAmount>
                    </TouchableOpacity>

                    <ActionMenu
                      title={b.counterparty || "Borrowing"}
                      colorScheme={resolvedMode}
                      style={styles.menuTriggerWrapper}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "pay") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "BORROWING",
                              borrowingId: b.id,
                            },
                          })
                        } else if (nativeEvent.event === "details") {
                          if (b.id) {
                            router.push(`/(app)/finance/borrowing/${b.id}`)
                          } else {
                            navigateTo("/(app)/finance/borrowing")
                          }
                        }
                      }}
                      actions={[
                        {
                          id: "pay",
                          title: isLent
                            ? "Record Payment Received"
                            : "Log Repayment",
                          image: paymentIcon,
                        },
                        {
                          id: "details",
                          title: "View Details",
                          image: detailsIcon,
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
        </View>
      </ScrollView>

      {!isViewer && (
        <>
          <QuickCaptureFab
            testID="finance-fab-add"
            accessibilityLabel="Add transaction"
            accessibilityHint="Tap to record an expense, or long press for more finance actions"
            onPress={() => router.push("/modal/add-transaction?type=EXPENSE")}
            onLongPress={() => quickActionsRef.current?.expand()}
          />
          <QuickCaptureSheet
            ref={quickActionsRef}
            title="Finance Quick Actions"
            actions={financeQuickActions}
            onClose={() => quickActionsRef.current?.close()}
          />
        </>
      )}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  topHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  topHeaderRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 96,
    gap: 18,
  },
  pillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  navPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: t.radius.full,
  },
  navPillText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  netWorthCard: {
    padding: 18,
    gap: 12,
  },
  netWorthHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  netWorthHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  netWorthTitle: {
    letterSpacing: 0.8,
    fontWeight: "600" as const,
  },
  netWorthAmount: {
    marginTop: 2,
  },
  assetsLiabilitiesRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  assetItem: {
    flex: 1,
    gap: 3,
  },
  assetItemHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: t.colors.border,
    marginHorizontal: 12,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 4,
  },
  sectionHeader: {
    letterSpacing: 0.8,
  },
  seeAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  listCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
  txRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  txMainPressable: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    flex: 1,
    marginRight: 6,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  txLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  txIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  actionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 2,
  },
  menuTriggerWrapper: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  horizontalAccountsScroll: {
    marginHorizontal: -16,
  },
  horizontalAccountsContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  txName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  txMeta: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    padding: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  emptyActionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  cardFooterAction: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 12,
    backgroundColor: t.colors.surfaceSubtle,
  },
  cardFooterActionText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  budgetStatsCard: {
    padding: 16,
    gap: 12,
  },
  budgetStatsHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
  },
  budgetStatsSpendCol: {
    flex: 1,
    gap: 2,
    marginRight: 10,
  },
  budgetStatsLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  budgetStatsCaption: {
    letterSpacing: 0.8,
    fontWeight: "600" as const,
  },
  budgetStatsAmountRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    flexWrap: "wrap" as const,
    marginTop: 2,
  },
  budgetStatsSpentAmount: {
    marginRight: 4,
  },
  budgetStatsLimitText: {
    fontSize: 13,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  budgetStatsProgressTrack: {
    height: 8,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  budgetStatsProgressBar: {
    height: "100%" as const,
    borderRadius: 4,
  },
  budgetStatsFooterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  budgetStatsRemaining: {
    gap: 2,
  },
  budgetHealthPills: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end" as const,
  },
  healthPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: t.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthPillText: {
    fontSize: 11,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  criticalCalloutRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 2,
    gap: 8,
  },
  criticalCalloutRowOver: {
    backgroundColor: t.colors.destructiveSubtle,
    borderColor: "rgba(244, 63, 94, 0.25)",
  },
  criticalCalloutLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    marginRight: 4,
  },
  criticalCalloutText: {
    fontSize: 11,
    color: t.colors.warning,
    fontWeight: "500" as const,
    flex: 1,
  },
  criticalCalloutTextOver: {
    color: t.colors.destructive,
  },
  inboxBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    borderRadius: t.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
  },
  inboxBannerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  inboxBannerTextContainer: {
    flex: 1,
    gap: 2,
  },
  inboxBannerTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  inboxBannerSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
})
