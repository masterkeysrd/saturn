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
  Plus,
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
  type Transaction,
  type Budget,
  type Account,
  type Account_InstitutionInfo,
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
