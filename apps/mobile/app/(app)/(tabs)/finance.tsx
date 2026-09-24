import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActionSheetIOS,
  Alert,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  ReceiptText,
  PiggyBank,
  Landmark,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Coins,
  Wallet,
  ArrowRight,
  Plus,
  CalendarClock,
  HandCoins,
  MoreVertical,
} from "lucide-react-native"
import {
  formatAmount,
  getBudgetColors,
  calculateAccountMetrics,
} from "@saturn/core"
import {
  useListTransactionsQuery,
  useListBudgetsQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
  useListScheduledTransactionsQuery,
  useSkipScheduledTransactionMutation,
  useListBorrowingsQuery,
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
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { CardAccountItem } from "@/components/finance/card-account-item"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { getBudgetIcon } from "@/lib/budget-icons"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

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

  // 5. Active Budgets Preview
  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL" },
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

  const getScheduledTitle = (st: ScheduledTransaction) =>
    st.metadata?.name ||
    st.recurringTransaction?.name ||
    st.metadata?.description ||
    (st.type === "INCOME" ? "Scheduled Income" : "Scheduled Bill")

  const skipScheduledMutation = useSkipScheduledTransactionMutation()
  const toast = useToast()

  const accounts = accountsData?.accounts || []
  const transactions = txData?.transactions || []
  const budgets = budgetsData?.budgets || []

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

  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    budgets.forEach((b) => {
      if (b.id) map.set(b.id, b)
    })
    return map
  }, [budgets])

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

  const handleScheduledDots = (st: ScheduledTransaction) => {
    haptics.light()
    const isIncome = st.type === "INCOME"
    const confirmLabel = isIncome ? "Confirm Deposit" : "Confirm / Pay"
    const title = getScheduledTitle(st)

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", confirmLabel, "Skip Cycle"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "SCHEDULED",
                scheduledTransactionId: st.id,
              },
            })
          } else if (buttonIndex === 2) {
            promptSkipScheduled(st)
          }
        }
      )
    } else {
      Alert.alert(title, "Select action", [
        { text: "Cancel", style: "cancel" },
        {
          text: confirmLabel,
          onPress: () =>
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "SCHEDULED",
                scheduledTransactionId: st.id,
              },
            }),
        },
        {
          text: "Skip Cycle",
          style: "destructive",
          onPress: () => promptSkipScheduled(st),
        },
      ])
    }
  }

  const handleBorrowingDots = (b: Borrowing) => {
    haptics.light()
    const isLent = b.direction === "LENT"
    const actionLabel = isLent ? "Record Payment Received" : "Log Repayment"

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", actionLabel, "View Details"],
          cancelButtonIndex: 0,
          title: b.counterparty || "Borrowing",
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "BORROWING",
                borrowingId: b.id,
              },
            })
          } else if (buttonIndex === 2) {
            navigateTo("/(app)/finance/borrowing")
          }
        }
      )
    } else {
      Alert.alert(b.counterparty || "Borrowing", "Select action", [
        { text: "Cancel", style: "cancel" },
        {
          text: actionLabel,
          onPress: () =>
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "BORROWING",
                borrowingId: b.id,
              },
            }),
        },
        {
          text: "View Details",
          onPress: () => navigateTo("/(app)/finance/borrowing"),
        },
      ])
    }
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

        {/* Section 1: Accounts Summary Preview */}
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

        {/* Section 2: Pending Scheduled / Recurring */}
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
                    <TouchableOpacity
                      key={st.id || idx}
                      style={[
                        styles.txRow,
                        idx < Math.min(scheduledList.length, 3) - 1 &&
                          styles.rowBorder,
                      ]}
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

                      <View style={styles.scheduledRight}>
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
                        <TouchableOpacity
                          style={styles.dotsBtn}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          activeOpacity={0.6}
                          onPress={() => handleScheduledDots(st)}
                        >
                          <MoreVertical
                            size={16}
                            color={theme.colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  )
                })}
            </Card>
          )}
        </View>

        {/* Section 3: Debts & Loans */}
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
                  <TouchableOpacity
                    key={b.id || idx}
                    style={[
                      styles.txRow,
                      idx < Math.min(borrowingsList.length, 3) - 1 &&
                        styles.rowBorder,
                    ]}
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

                    <View style={styles.scheduledRight}>
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
                      <TouchableOpacity
                        style={styles.dotsBtn}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        activeOpacity={0.6}
                        onPress={() => handleBorrowingDots(b)}
                      >
                        <MoreVertical
                          size={16}
                          color={theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </Card>
          )}
        </View>

        {/* Section 4: Active Budgets Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption style={styles.sectionHeader}>ACTIVE BUDGETS</Caption>
            <TouchableOpacity
              style={styles.seeAllBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/budgets")}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRight size={13} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {budgetsLoading ? (
            <SkeletonCard />
          ) : budgets.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active budgets configured</Text>
            </Card>
          ) : (
            <View style={styles.budgetsGrid}>
              {budgets.slice(0, 3).map((b: Budget) => {
                const palette = getBudgetColors(b.color)
                const spentCents = Number(b.currentPeriod?.spentAmount || "0")
                const limitCents = Number(b.limitAmount || "0")
                const percentage =
                  limitCents > 0
                    ? Math.min(Math.round((spentCents / limitCents) * 100), 100)
                    : 0
                const nativeColors = getNativeBudgetColors(palette.value)
                const isOver = percentage >= 95
                const BIcon = getBudgetIcon(b.icon, b.name)

                return (
                  <Card
                    key={b.id}
                    style={styles.budgetCard}
                    onPress={() =>
                      b.id
                        ? navigateTo(`/(app)/finance/budgets/${b.id}`)
                        : navigateTo("/(app)/finance/budgets")
                    }
                  >
                    <View style={styles.budgetHeader}>
                      <View style={styles.budgetNameRow}>
                        <View
                          style={[
                            styles.budgetIconBadge,
                            {
                              backgroundColor: nativeColors.bg,
                              borderColor: nativeColors.border,
                            },
                          ]}
                        >
                          <BIcon size={13} color={nativeColors.bar} />
                        </View>
                        <Text style={styles.budgetName} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </View>
                      <Badge
                        size="sm"
                        label={`${percentage}%`}
                        bg={
                          isOver
                            ? theme.colors.destructiveSubtle
                            : nativeColors.bg
                        }
                        border={
                          isOver
                            ? "rgba(244, 63, 94, 0.3)"
                            : nativeColors.border
                        }
                        color={
                          isOver ? theme.colors.destructive : nativeColors.text
                        }
                      />
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressBar,
                          {
                            width: `${percentage}%`,
                            backgroundColor: isOver
                              ? theme.colors.destructive
                              : nativeColors.bar,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.budgetFooter}>
                      <Text style={styles.budgetSpent}>
                        {formatAmount(String(spentCents), b.currency)}
                      </Text>
                      <Text style={styles.budgetLimit}>
                        of {formatAmount(b.limitAmount, b.currency)}
                      </Text>
                    </View>
                  </Card>
                )
              })}
            </View>
          )}
        </View>

        {/* Section 5: Recent Transactions Preview */}
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
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  scheduledRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dotsBtn: {
    padding: 4,
    marginLeft: 2,
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
  budgetsGrid: {
    gap: 10,
  },
  budgetCard: {
    padding: 14,
    gap: 10,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  budgetIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  budgetName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  budgetSpent: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  budgetLimit: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
