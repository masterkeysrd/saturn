import { useMemo } from "react"
import { StyleSheet, View, TouchableOpacity, Text } from "react-native"
import { useRouter } from "expo-router"
import {
  Landmark,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Inbox,
} from "lucide-react-native"
import {
  formatAmount,
  calculateAccountMetrics,
  resolveFinancePeriodBounds,
} from "@saturn/core"
import {
  useListAccountsQuery,
  useGetSettingsQuery,
  useGetInsightsQuery,
  useListInboxItemsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview, useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export function FinanceSummaryWidget() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
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

  // 4. Fetch pre-aggregated backend Insights (current month income & expenses)
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

  // 5. Pending Finance Inbox count for inline triage callout
  const { data: inboxData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 50,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: !!activeSpaceId, retry: false }
  )
  const pendingInboxCount = inboxData?.inboxItems?.length ?? 0

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
            <Landmark size={16} color={colors.primary} />
            <Text style={styles.headerTitle}>Financial Snapshot</Text>
          </View>
          <View style={styles.headerRight}>
            {accounts.length > 0 ? (
              <Text style={styles.headerSubtitle}>
                {accounts.length}{" "}
                {accounts.length === 1 ? "account" : "accounts"}
              </Text>
            ) : null}
            <ChevronRight size={16} color={colors.textMuted} />
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
                { backgroundColor: colors.successSubtle },
              ]}
            >
              <ArrowDownLeft size={14} color={colors.success} />
            </View>
            <View>
              <Caption style={styles.statLabel}>
                Income ({currentMonthLabel})
              </Caption>
              <MonoAmount
                size="sm"
                color={colors.success}
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
                { backgroundColor: colors.destructiveSubtle },
              ]}
            >
              <ArrowUpRight size={14} color={colors.destructive} />
            </View>
            <View>
              <Caption style={styles.statLabel}>
                Expenses ({currentMonthLabel})
              </Caption>
              <MonoAmount
                size="sm"
                color={colors.destructive}
                style={styles.statAmount}
              >
                -{formatAmount(totalSpentCents, baseCurrency)}
              </MonoAmount>
            </View>
          </View>
        </View>

        {pendingInboxCount > 0 && (
          <TouchableOpacity
            style={styles.inboxCallout}
            activeOpacity={0.75}
            onPress={() => {
              haptics.light()
              router.push("/(app)/finance/inbox" as never)
            }}
            testID="finance-widget-inbox-callout"
          >
            <View style={styles.inboxCalloutLeft}>
              <Inbox size={14} color={colors.primary} />
              <Text style={styles.inboxCalloutText}>
                {pendingInboxCount === 1
                  ? "1 item awaiting review"
                  : `${pendingInboxCount} items awaiting review`}
              </Text>
            </View>
            <ChevronRight size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
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
        <Plus size={15} color={colors.primary} />
        <Text style={styles.cardFooterText}>Add Transaction</Text>
      </TouchableOpacity>
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    padding: 0,
    overflow: "hidden" as const,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
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
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  statItem: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  inboxCallout: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.borderFocus,
    marginTop: 2,
  },
  inboxCalloutLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
  },
  inboxCalloutText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  cardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
  },
  cardFooterText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  footerSkeleton: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
  },
})
