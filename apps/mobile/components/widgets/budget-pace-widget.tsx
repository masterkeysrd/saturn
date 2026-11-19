import { useMemo } from "react"
import { View, Text } from "react-native"
import { useRouter } from "expo-router"
import { PiggyBank, ChevronRight } from "lucide-react-native"
import { convertCentsToBase, formatAmount } from "@saturn/core"
import {
  useGetSettingsQuery,
  useListBudgetsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  useCurrencyConversionPreview,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount } from "@/components/ui/typography"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function BudgetPaceWidget() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()

  const { data: settingsData, isLoading: settingsLoading } =
    useGetSettingsQuery({}, { enabled: Boolean(activeSpaceId), retry: false })

  const baseCurrency = settingsData?.baseCurrency || ""
  const isFinanceConfigured = Boolean(settingsData && baseCurrency)

  const { exchangeRates } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: Boolean(activeSpaceId) && isFinanceConfigured,
    baseCurrency: baseCurrency || "USD",
  })

  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    {
      pageSize: 100,
      pageToken: "",
      view: "FULL",
      statuses: ["ACTIVE"],
    },
    { enabled: Boolean(activeSpaceId) && isFinanceConfigured, retry: false }
  )

  const summary = useMemo(() => {
    const allBudgets = budgetsData?.budgets ?? []
    const monthlyBudgets = allBudgets.filter((b) => b.interval === "MONTHLY")
    const otherBudgets = allBudgets.filter((b) => b.interval !== "MONTHLY")
    const isMonthlyMode = monthlyBudgets.length > 0
    const targetBudgets = isMonthlyMode ? monthlyBudgets : otherBudgets

    let totalLimitCents = 0
    let totalSpentCents = 0

    for (const b of targetBudgets) {
      const limitCents = b.currentPeriod?.limitInBase
        ? Number(b.currentPeriod.limitInBase)
        : convertCentsToBase(
            b.limitAmount,
            b.currency,
            baseCurrency || "USD",
            exchangeRates
          )
      const spentCents = b.currentPeriod?.spentInBase
        ? Number(b.currentPeriod.spentInBase)
        : convertCentsToBase(
            b.currentPeriod?.spentAmount || "0",
            b.currency,
            baseCurrency || "USD",
            exchangeRates
          )

      if (!Number.isNaN(limitCents)) totalLimitCents += limitCents
      if (!Number.isNaN(spentCents)) totalSpentCents += spentCents
    }

    const parts = tz.parts(tz.now())
    const dayOfMonth = parts?.day ?? 15
    const daysInMonth = parts ? getDaysInMonth(parts.year, parts.month) : 30
    const elapsedPct = Math.min(
      100,
      Math.max(1, Math.round((dayOfMonth / daysInMonth) * 100))
    )
    const spentPct =
      totalLimitCents > 0
        ? Math.round((totalSpentCents / totalLimitCents) * 100)
        : 0

    const expectedAtPaceCents = Math.round(totalLimitCents * (elapsedPct / 100))
    const paceDeltaCents = expectedAtPaceCents - totalSpentCents

    let paceStatus: "ahead" | "on_track" | "over_pace" = "on_track"
    if (isMonthlyMode) {
      if (spentPct > 100 || spentPct - elapsedPct > 8) {
        paceStatus = "over_pace"
      } else if (elapsedPct - spentPct >= 5) {
        paceStatus = "ahead"
      }
    } else if (spentPct > 100) {
      paceStatus = "over_pace"
    }

    return {
      totalCount: allBudgets.length,
      otherCount: otherBudgets.length,
      isMonthlyMode,
      totalLimitCents,
      totalSpentCents,
      spentPct,
      elapsedPct,
      dayOfMonth,
      paceDeltaCents,
      paceStatus,
    }
  }, [budgetsData?.budgets, baseCurrency, exchangeRates, tz])

  const isLoading =
    settingsLoading || (isFinanceConfigured && budgetsLoading && !budgetsData)

  const navigateToBudgets = () => {
    haptics.light()
    router.push("/(app)/finance/budgets" as never)
  }

  const badgeConfig = summary.isMonthlyMode
    ? summary.paceStatus === "over_pace"
      ? { variant: "destructive" as const, label: "Over pace" }
      : summary.paceStatus === "ahead"
        ? { variant: "success" as const, label: "Ahead of pace" }
        : { variant: "primary" as const, label: "On track" }
    : summary.spentPct > 100
      ? { variant: "destructive" as const, label: "Over limit" }
      : { variant: "default" as const, label: `${summary.otherCount} active` }

  const barColor =
    summary.paceStatus === "over_pace"
      ? colors.destructive
      : summary.paceStatus === "ahead"
        ? colors.success
        : colors.primary

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Skeleton width={150} height={16} />
          <Skeleton width={64} height={20} />
        </View>
        <Skeleton width={170} height={24} />
        <Skeleton width="100%" height={10} />
        <Skeleton width="75%" height={14} />
      </Card>
    )
  }

  return (
    <Card
      style={styles.card}
      onPress={navigateToBudgets}
      testID="budget-pace-widget"
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PiggyBank size={16} color={colors.brandSecondary} />
          <Text style={styles.headerTitle}>
            {t("dashboard.widget.budget_pace.title")}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isFinanceConfigured && summary.totalCount > 0 && (
            <Badge
              variant={badgeConfig.variant}
              size="sm"
              label={badgeConfig.label}
            />
          )}
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </View>

      {!isFinanceConfigured ? (
        <Text style={styles.emptyText}>
          Configure your base currency in Finance to track budget limits.
        </Text>
      ) : summary.totalCount === 0 ? (
        <Text style={styles.emptyText}>
          {t("dashboard.widget.budget_pace.empty")}
        </Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.amountRow}>
            <View style={styles.amountLeft}>
              <MonoAmount size="lg" style={styles.spentAmount}>
                {formatAmount(String(summary.totalSpentCents), baseCurrency)}
              </MonoAmount>
              <Text style={styles.ofText}>
                of {formatAmount(String(summary.totalLimitCents), baseCurrency)}
              </Text>
            </View>
            <MonoAmount size="sm" color={colors.textMuted}>
              {summary.spentPct}%
            </MonoAmount>
          </View>

          <View style={styles.progressTrackWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.max(0, summary.spentPct))}%`,
                    backgroundColor: barColor,
                  },
                ]}
              />
            </View>
            {summary.isMonthlyMode && (
              <View
                style={[styles.todayMarker, { left: `${summary.elapsedPct}%` }]}
                accessibilityLabel={`Today marker: ${summary.elapsedPct}% of month elapsed`}
              />
            )}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {summary.isMonthlyMode
                ? `Day ${summary.dayOfMonth} · ${summary.elapsedPct}% of month`
                : `${summary.otherCount} active ${summary.otherCount === 1 ? "budget" : "budgets"}`}
            </Text>
            {summary.isMonthlyMode ? (
              <View style={styles.paceDeltaWrap}>
                <MonoAmount
                  size="sm"
                  color={
                    summary.paceDeltaCents >= 0
                      ? colors.success
                      : colors.destructive
                  }
                >
                  {formatAmount(
                    String(Math.abs(summary.paceDeltaCents)),
                    baseCurrency
                  )}
                </MonoAmount>
                <Text style={styles.metaText}>
                  {summary.paceDeltaCents >= 0 ? "under pace" : "over pace"}
                </Text>
              </View>
            ) : (
              <View style={styles.paceDeltaWrap}>
                <MonoAmount size="sm" color={colors.textPrimary}>
                  {formatAmount(
                    String(
                      Math.max(
                        0,
                        summary.totalLimitCents - summary.totalSpentCents
                      )
                    ),
                    baseCurrency
                  )}
                </MonoAmount>
                <Text style={styles.metaText}>remaining</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    padding: 16,
    gap: 12,
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
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 19,
  },
  body: {
    gap: 10,
  },
  amountRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  amountLeft: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    flex: 1,
  },
  spentAmount: {
    includeFontPadding: false,
  },
  ofText: {
    fontSize: 13,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  progressTrackWrap: {
    position: "relative" as const,
    justifyContent: "center" as const,
    height: 16,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceHighlight,
    overflow: "hidden" as const,
  },
  progressFill: {
    height: "100%" as const,
    borderRadius: 4,
  },
  todayMarker: {
    position: "absolute" as const,
    top: 1,
    bottom: 1,
    width: 2,
    borderRadius: 1,
    backgroundColor: t.colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    flexWrap: "wrap" as const,
  },
  metaText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  paceDeltaWrap: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: 4,
  },
})
