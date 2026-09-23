import { useMemo } from "react"
import { StyleSheet, View, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import {
  Landmark,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react-native"
import { formatAmount, calculateAccountMetrics } from "@saturn/core"
import {
  useListAccountsQuery,
  useGetFinanceSettingsQuery,
  useGetInsightsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export function FinanceSummaryWidget() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()

  // 1. Fetch space finance settings (base currency)
  const { data: settingsData, isLoading: settingsLoading } =
    useGetFinanceSettingsQuery({}, { enabled: !!activeSpaceId })

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

  const accounts = accountsData?.accounts || []

  // Aggregate live Net Worth with accurate multi-currency conversion
  const metrics = useMemo(() => {
    return calculateAccountMetrics(accounts, baseCurrency, exchangeRates)
  }, [accounts, baseCurrency, exchangeRates])

  const netWorthCents = String(metrics.netWorthCents)

  // Live Monthly Income & Expense from insights endpoint
  const totalIncomeCents = insightsData?.income?.totalIncome || "0"
  const totalSpentCents = insightsData?.spent?.totalSpent || "0"

  const currentMonthLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", { month: "short" })
  }, [])

  const isLoading =
    (accountsLoading || insightsLoading || settingsLoading || ratesLoading) &&
    !accountsData

  const navigateToFinance = () => {
    haptics.light()
    router.push("/(app)/(tabs)/transactions")
  }

  if (isLoading) {
    return (
      <Card style={styles.container}>
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
      </Card>
    )
  }

  return (
    <Card style={styles.container}>
      {/* Widget Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Landmark size={15} color={theme.colors.primary} />
          <Caption style={styles.headerTitle}>FINANCIAL SNAPSHOT</Caption>
        </View>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={navigateToFinance}
          activeOpacity={0.7}
        >
          <ChevronRight size={14} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

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
            <Caption>Income ({currentMonthLabel})</Caption>
            <MonoAmount size="sm" color={theme.colors.success}>
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
            <Caption>Expenses ({currentMonthLabel})</Caption>
            <MonoAmount size="sm" color={theme.colors.destructive}>
              -{formatAmount(totalSpentCents, baseCurrency)}
            </MonoAmount>
          </View>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  linkText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  balanceSection: {
    gap: 4,
  },
  balanceLabel: {
    letterSpacing: 0.6,
  },
  balanceAmount: {
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
})
