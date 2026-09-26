import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native"
import { useRouter } from "expo-router"
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
import { formatAmount, calculateAccountMetrics } from "@saturn/core"
import {
  useListTransactionsQuery,
  useGetInsightsQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
  useListScheduledTransactionsQuery,
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
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Icon } from "@expo/ui"
import { MenuView } from "@expo/ui/community/menu"
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
  const queryClient = useQueryClient()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
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

  // 5. Monthly Insights (Aggregated Budget Usage & Overall Spending)
  const { data: insightsData, isLoading: insightsLoading } =
    useGetInsightsQuery(
      {
        granularity: "MONTHLY",
        startDate: "",
        endDate: "",
      },
      { enabled: !!activeSpaceId }
    )

  // 6. Institutions for Logo & Info
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions = instData?.institutions || []
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

  const getScheduledTitle = (st: ScheduledTransaction) =>
    st.metadata?.name ||
    st.recurringTransaction?.name ||
    st.metadata?.description ||
    (st.type === "INCOME" ? "Scheduled Income" : "Scheduled Bill")

  const skipScheduledMutation = useSkipScheduledTransactionMutation()
  const toast = useToast()

  const accounts = accountsData?.accounts || []
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
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const getDueDateBadge = (dueDateStr?: string) => {
    if (!dueDateStr) return null
    const due = new Date(dueDateStr)
    if (isNaN(due.getTime())) return null
    const now = new Date()

    const utcDue = Date.UTC(
      due.getUTCFullYear(),
      due.getUTCMonth(),
      due.getUTCDate()
    )
    const utcNow = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    )
    const diffDays = Math.round((utcDue - utcNow) / (1000 * 60 * 60 * 24))

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
    const title = getScheduledTitle(st)
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

  const showInboxInfo = () => {
    haptics.light()
    const itemWord = pendingInboxCount === 1 ? "item" : "items"
    Alert.alert(
      "Pending Inbox Items",
      `You have ${pendingInboxCount} forwarded ${itemWord} waiting for review.\n\nPlease log in to the Saturn web app on your desktop browser to review, link, and approve or discard them.`,
      [{ text: "Got it" }]
    )
  }

  return (
    <View style={styles.safeArea}>
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
            <ReceiptText size={15} color={theme.colors.primary} />
            <Text style={styles.navPillText}>Transactions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/budgets")}
          >
            <PiggyBank size={15} color={theme.colors.accent} />
            <Text style={styles.navPillText}>Budgets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/accounts")}
          >
            <Landmark size={15} color={theme.colors.success} />
            <Text style={styles.navPillText}>Accounts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/recurring")}
          >
            <CalendarClock size={15} color={theme.colors.warning} />
            <Text style={styles.navPillText}>Recurring</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/finance/borrowing")}
          >
            <HandCoins size={15} color={theme.colors.primary} />
            <Text style={styles.navPillText}>Borrowing</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Pending Inbox Items Banner (Web Review Notice) */}
        {pendingInboxCount > 0 && (
          <TouchableOpacity
            style={styles.inboxBanner}
            activeOpacity={0.8}
            onPress={showInboxInfo}
          >
            <View style={styles.inboxBannerIconContainer}>
              <Inbox size={18} color="#818cf8" />
            </View>
            <View style={styles.inboxBannerTextContainer}>
              <View style={styles.inboxBannerHeaderRow}>
                <Text style={styles.inboxBannerTitle}>
                  {pendingInboxCount === 1
                    ? "1 Pending Inbox Item"
                    : `${pendingInboxCount} Pending Inbox Items`}
                </Text>
                <View style={styles.inboxBannerBadge}>
                  <Text style={styles.inboxBannerBadgeText}>Web Only</Text>
                </View>
              </View>
              <Text style={styles.inboxBannerSubtitle}>
                Review and resolve on the web app
              </Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Primary Net Liquidity Card */}
        <Card style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <View style={styles.netWorthHeaderLeft}>
              <Wallet size={15} color={theme.colors.primary} />
              <Caption style={styles.netWorthTitle}>NET LIQUIDITY</Caption>
            </View>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/accounts")}
            >
              <Text style={styles.seeAllText}>Accounts</Text>
              <ChevronRight size={13} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <MonoAmount size="xl" style={styles.netWorthAmount}>
            {formatAmount(String(metrics.netWorthCents), baseCurrency)}
          </MonoAmount>

          <View style={styles.assetsLiabilitiesRow}>
            <View style={styles.assetItem}>
              <Caption>Total Assets</Caption>
              <MonoAmount size="sm" color={theme.colors.success}>
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
                <ChevronRight size={11} color={theme.colors.textMuted} />
              </View>
              <MonoAmount size="sm" color={theme.colors.destructive}>
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
              <ArrowRight size={13} color={theme.colors.primary} />
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
                <Plus size={14} color={theme.colors.primary} />
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
                <Plus size={14} color={theme.colors.primary} />
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
              <ArrowRight size={13} color={theme.colors.primary} />
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
              <ArrowRight size={13} color={theme.colors.primary} />
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
                    <PiggyBank size={15} color={theme.colors.accent} />
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
                      ? theme.colors.destructiveSubtle
                      : budgetStats.isWarning
                        ? theme.colors.warningSubtle
                        : theme.colors.primarySubtle
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
                      ? theme.colors.destructive
                      : budgetStats.isWarning
                        ? theme.colors.warning
                        : theme.colors.primary
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
                        ? theme.colors.destructive
                        : budgetStats.isWarning
                          ? theme.colors.warning
                          : theme.colors.primary,
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
                      budgetStats.isOver
                        ? theme.colors.destructive
                        : theme.colors.success
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
                          { backgroundColor: theme.colors.success },
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
                          { backgroundColor: theme.colors.warning },
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
                          { backgroundColor: theme.colors.destructive },
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
                          ? theme.colors.destructive
                          : theme.colors.warning
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
                        budgetStats.topCritical.spent ||
                          budgetStats.topCritical.spentInBase,
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
                  <ChevronRight size={13} color={theme.colors.textMuted} />
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
              <ArrowRight size={13} color={theme.colors.primary} />
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
                              {getScheduledTitle(st)}
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
                        title={getScheduledTitle(st)}
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
              <ArrowRight size={13} color={theme.colors.primary} />
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
                        router.push({
                          pathname: "/modal/add-transaction",
                          params: {
                            type: "BORROWING",
                            borrowingId: b.id,
                          },
                        })
                      }}
                    >
                      <View style={styles.txLeft}>
                        <View
                          style={[
                            styles.actionIconBadge,
                            {
                              backgroundColor: isLent
                                ? theme.colors.successSubtle
                                : theme.colors.destructiveSubtle,
                            },
                          ]}
                        >
                          <HandCoins
                            size={16}
                            color={
                              isLent
                                ? theme.colors.success
                                : theme.colors.destructive
                            }
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
                                  ? theme.colors.successSubtle
                                  : theme.colors.destructiveSubtle
                              }
                              border={
                                isLent
                                  ? "rgba(16, 185, 129, 0.3)"
                                  : "rgba(244, 63, 94, 0.3)"
                              }
                              color={
                                isLent
                                  ? theme.colors.success
                                  : theme.colors.destructive
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
                        color={
                          isLent
                            ? theme.colors.success
                            : theme.colors.destructive
                        }
                      >
                        {formatAmount(
                          b.remainingAmount || b.totalAmount,
                          b.currency || baseCurrency
                        )}
                      </MonoAmount>
                    </TouchableOpacity>

                    <MenuView
                      title={b.counterparty || "Borrowing"}
                      colorScheme="dark"
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
                          navigateTo("/(app)/finance/borrowing")
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
          )}
        </View>
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
    paddingTop: 12,
    paddingBottom: 80,
    gap: 18,
  },
  pillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
  },
  navPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  netWorthCard: {
    padding: 18,
    gap: 12,
  },
  netWorthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  netWorthHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  netWorthTitle: {
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  netWorthAmount: {
    marginTop: 2,
  },
  assetsLiabilitiesRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  assetItem: {
    flex: 1,
    gap: 3,
  },
  assetItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.border,
    marginHorizontal: 12,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sectionHeader: {
    letterSpacing: 0.8,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  listCard: {
    padding: 0,
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  txMainPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
    marginRight: 6,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  txIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  menuTriggerWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  txMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  cardFooterAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  cardFooterActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  budgetStatsCard: {
    padding: 16,
    gap: 12,
  },
  budgetStatsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  budgetStatsSpendCol: {
    flex: 1,
    gap: 2,
    marginRight: 10,
  },
  budgetStatsLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  budgetStatsCaption: {
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  budgetStatsAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginTop: 2,
  },
  budgetStatsSpentAmount: {
    marginRight: 4,
  },
  budgetStatsLimitText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  budgetStatsProgressTrack: {
    height: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden",
  },
  budgetStatsProgressBar: {
    height: "100%",
    borderRadius: 4,
  },
  budgetStatsFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  budgetStatsRemaining: {
    gap: 2,
  },
  budgetHealthPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  healthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthPillText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  criticalCalloutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 2,
    gap: 8,
  },
  criticalCalloutRowOver: {
    backgroundColor: "rgba(244, 63, 94, 0.08)",
    borderColor: "rgba(244, 63, 94, 0.2)",
  },
  criticalCalloutLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 4,
  },
  criticalCalloutText: {
    fontSize: 11,
    color: theme.colors.warning,
    fontWeight: "500",
    flex: 1,
  },
  criticalCalloutTextOver: {
    color: theme.colors.destructive,
  },
  inboxBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.25)",
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
  },
  inboxBannerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBannerTextContainer: {
    flex: 1,
    gap: 2,
  },
  inboxBannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inboxBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  inboxBannerBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.35)",
  },
  inboxBannerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#a5b4fc",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inboxBannerSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
