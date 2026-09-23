import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
  useGetFinanceSettingsQuery,
  type Transaction,
  type Budget,
  type Account,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
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
  const { exchangeRates } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  // 3. Accounts for Net Worth & Accounts Summary
  const { data: accountsData, isLoading: accountsLoading } =
    useListAccountsQuery({ activeOnly: true }, { enabled: !!activeSpaceId })

  // 4. Recent Transactions Preview (limit 5)
  const { data: txData, isLoading: txLoading } = useListTransactionsQuery(
    { pageSize: 5, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  // 5. Active Budgets Preview
  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const accounts = accountsData?.accounts || []
  const transactions = txData?.transactions || []
  const budgets = budgetsData?.budgets || []

  // Compute live multi-currency metrics
  const metrics = useMemo(() => {
    return calculateAccountMetrics(accounts, baseCurrency, exchangeRates)
  }, [accounts, baseCurrency, exchangeRates])

  const accountsMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((a) => {
      if (a.id) map.set(a.id, a.name)
    })
    return map
  }, [accounts])

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
            <View style={styles.assetItem}>
              <Caption>Total Debt</Caption>
              <MonoAmount size="sm" color={theme.colors.destructive}>
                -
                {formatAmount(
                  String(metrics.totalLiabilitiesCents),
                  baseCurrency
                )}
              </MonoAmount>
            </View>
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
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {transactions.slice(0, 4).map((tx: Transaction, idx) => {
                const isExpense = tx.type === "EXPENSE"
                const accountName = tx.accountId
                  ? accountsMap.get(tx.accountId)
                  : undefined

                return (
                  <TouchableOpacity
                    key={tx.id || idx}
                    style={[
                      styles.txRow,
                      idx < Math.min(transactions.length, 4) - 1 &&
                        styles.rowBorder,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => navigateTo("/(app)/finance/transactions")}
                  >
                    <View style={styles.txLeft}>
                      <View
                        style={[
                          styles.txIconBadge,
                          {
                            backgroundColor: isExpense
                              ? theme.colors.destructiveSubtle
                              : theme.colors.successSubtle,
                          },
                        ]}
                      >
                        {isExpense ? (
                          <ArrowUpRight
                            size={14}
                            color={theme.colors.destructive}
                          />
                        ) : (
                          <ArrowDownLeft
                            size={14}
                            color={theme.colors.success}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txName} numberOfLines={1}>
                          {tx.description || "Unnamed"}
                        </Text>
                        <Text style={styles.txMeta} numberOfLines={1}>
                          {accountName ? `${accountName} • ` : ""}
                          {formatDate(tx.transactionDate)}
                        </Text>
                      </View>
                    </View>
                    <MonoAmount
                      size="sm"
                      color={
                        isExpense
                          ? theme.colors.textPrimary
                          : theme.colors.success
                      }
                    >
                      {isExpense ? "-" : "+"}
                      {formatAmount(tx.amount, tx.currency)}
                    </MonoAmount>
                  </TouchableOpacity>
                )
              })}
            </Card>
          )}
        </View>

        {/* Section 2: Active Budgets Preview */}
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

                return (
                  <Card
                    key={b.id}
                    style={styles.budgetCard}
                    onPress={() => navigateTo("/(app)/finance/budgets")}
                  >
                    <View style={styles.budgetHeader}>
                      <View style={styles.budgetNameRow}>
                        <View
                          style={[
                            styles.budgetDot,
                            { backgroundColor: nativeColors.bar },
                          ]}
                        />
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

        {/* Section 3: Accounts Summary Preview */}
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
            <SkeletonCard />
          ) : accounts.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No accounts connected</Text>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {accounts.slice(0, 4).map((acc: Account, idx) => {
                const balanceNum = Number(acc.currentBalance || "0")
                const isCredit = acc.type === "CREDIT_CARD"

                return (
                  <TouchableOpacity
                    key={acc.id || idx}
                    style={[
                      styles.txRow,
                      idx < Math.min(accounts.length, 4) - 1 &&
                        styles.rowBorder,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => navigateTo("/(app)/finance/accounts")}
                  >
                    <View style={styles.txLeft}>
                      <View style={styles.accountIconBadge}>
                        {acc.type === "CREDIT_CARD" ? (
                          <CreditCard
                            size={15}
                            color={theme.colors.destructive}
                          />
                        ) : acc.type === "CASH" ? (
                          <Coins size={15} color={theme.colors.success} />
                        ) : (
                          <Landmark size={15} color={theme.colors.primary} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txName} numberOfLines={1}>
                          {acc.name}
                        </Text>
                        <Text style={styles.txMeta}>
                          {acc.type.replace(/_/g, " ")}
                          {acc.lastFour ? ` •••• ${acc.lastFour}` : ""}
                        </Text>
                      </View>
                    </View>
                    <MonoAmount
                      size="sm"
                      color={
                        isCredit && balanceNum > 0
                          ? theme.colors.destructive
                          : theme.colors.textPrimary
                      }
                    >
                      {formatAmount(acc.currentBalance || "0", acc.currency)}
                    </MonoAmount>
                  </TouchableOpacity>
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
  accountIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
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
    padding: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
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
  budgetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
