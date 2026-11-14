import { useMemo } from "react"
import { StyleSheet, View, TouchableOpacity, Text } from "react-native"
import { useRouter } from "expo-router"
import {
  Landmark,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
} from "lucide-react-native"
import { formatAmount, calculateAccountMetrics } from "@saturn/core"
import {
  useListAccountsQuery,
  useGetSettingsQuery,
  useGetInsightsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview, useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export function FinanceSummaryWidget() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()

  // 1. Fetch space finance settings (base currency)
  const { data: settingsData, isLoading: settingsLoading } =
    useGetSettingsQuery({}, { enabled: !!activeSpaceId })

  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Fetch exchange rates for multi-currency conversion
  const { exchangeRates, isLoading: ratesLoading } =
    useCurrencyConversionPreview({
      spaceId: activeSpaceId || undefined,
      enabled: !!activeSpaceId,
      baseCurrency,
    })

  // 3. Fetch active accounts for Net Worth aggregation
  const { data: accountsData, isLoading: accountsLoading } =
    useListAccountsQuery({ activeOnly: true }, { enabled: !!activeSpaceId })

  // 4. Fetch pre-aggregated backend Insights (monthly income & expenses)
  const { data: insightsData, isLoading: insightsLoading } =
    useGetInsightsQuery(
      {
        granularity: "MONTHLY",
        startDate: "",
        endDate: "",
      },
      { enabled: !!activeSpaceId }
    )

  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  // Aggregate live Net Worth with accurate multi-currency conversion
  const metrics = useMemo(() => {
    return calculateAccountMetrics(accounts, baseCurrency, exchangeRates)
  }, [accounts, baseCurrency, exchangeRates])

  const netWorthCents = String(metrics.netWorthCents)

  // Live Monthly Income & Expense from insights endpoint
  const totalIncomeCents = insightsData?.income?.totalIncome || "0"
  const totalSpentCents = insightsData?.spent?.totalSpent || "0"

  const currentMonthLabel = useMemo(() => {
    return tz.format(tz.now(), { month: "short" })
  }, [tz])

  const isLoading =
    (accountsLoading || insightsLoading || settingsLoading || ratesLoading) &&
    !accountsData

  const navigateToFinance = () => {
    haptics.light()
    router.push("/(app)/(tabs)/finance")
  }

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <View style={styles.cardBody}>
          <View style={styles.header}>
            <Skeleton width={150} height={16} />
            <Skeleton width={50} height={16} />
          </View>
          <View style={{ gap: 8, marginVertical: 4 }}>
            <Skeleton width={110} height={12} />
            <Skeleton width={180} height={32} />
          </View>
          <View style={styles.statsRow}>
            <Skeleton width="45%" height={36} />
            <Skeleton width="45%" height={36} />
          </View>
        </View>
        <View style={styles.footerSkeleton}>
          <Skeleton width={120} height={14} />
        </View>
      </Card>
    )
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cardBody}>
        {/* Widget Header */}
        <TouchableOpacity
          style={styles.header}
          onPress={navigateToFinance}
          activeOpacity={0.7}
          testID="finance-widget-header-btn"
        >
          <View style={styles.headerLeft}>
            <Landmark size={16} color={theme.colors.primary} />
            <Text style={styles.headerTitle}>Financial Snapshot</Text>
          </View>
          <View style={styles.headerRight}>
            {accounts.length > 0 ? (
              <Text style={styles.headerSubtitle}>
                {accounts.length}{" "}
                {accounts.length === 1 ? "account" : "accounts"}
              </Text>
            ) : null}
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* Real Net Worth Figure */}
        <View style={styles.balanceSection}>
          <Caption style={styles.balanceLabel}>TOTAL NET WORTH</Caption>
          <MonoAmount size="xl" style={styles.balanceAmount}>
            {formatAmount(netWorthCents, baseCurrency)}
          </MonoAmount>
        </View>

        {/* Real Monthly Cashflow Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View
              style={[
                styles.statIconBadge,
                { backgroundColor: theme.colors.successSubtle },
              ]}
            >
              <ArrowDownLeft size={14} color={theme.colors.success} />
            </View>
            <View>
              <Caption style={styles.statLabel}>
                Income ({currentMonthLabel})
              </Caption>
              <MonoAmount
                size="sm"
                color={theme.colors.success}
                style={styles.statAmount}
              >
                +{formatAmount(totalIncomeCents, baseCurrency)}
              </MonoAmount>
            </View>
          </View>

          <View style={styles.statItem}>
            <View
              style={[
                styles.statIconBadge,
                { backgroundColor: theme.colors.destructiveSubtle },
              ]}
            >
              <ArrowUpRight size={14} color={theme.colors.destructive} />
            </View>
            <View>
              <Caption style={styles.statLabel}>
                Expenses ({currentMonthLabel})
              </Caption>
              <MonoAmount
                size="sm"
                color={theme.colors.destructive}
                style={styles.statAmount}
              >
                -{formatAmount(totalSpentCents, baseCurrency)}
              </MonoAmount>
            </View>
          </View>
        </View>
      </View>

      {/* Card Footer Quick Action */}
      <TouchableOpacity
        style={styles.cardFooter}
        activeOpacity={0.7}
        onPress={() => {
          haptics.medium()
          router.push("/modal/add-transaction")
        }}
      >
        <Plus size={15} color={theme.colors.primary} />
        <Text style={styles.cardFooterText}>Add Transaction</Text>
      </TouchableOpacity>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: "hidden",
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  balanceSection: {
    gap: 0,
  },
  balanceLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  balanceAmount: {
    lineHeight: 32,
    includeFontPadding: false,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statLabel: {
    lineHeight: 15,
    includeFontPadding: false,
  },
  statAmount: {
    lineHeight: 17,
    includeFontPadding: false,
  },
  statIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  cardFooterText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  footerSkeleton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
})
