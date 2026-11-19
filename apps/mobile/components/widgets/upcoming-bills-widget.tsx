import { useMemo } from "react"
import { StyleSheet, View, Text } from "react-native"
import { useRouter } from "expo-router"
import { CalendarClock, ChevronRight } from "lucide-react-native"
import { formatAmount, getScheduledDisplayName, parseDate } from "@saturn/core"
import {
  useGetSettingsQuery,
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount } from "@/components/ui/typography"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

const DAYS_14_MS = 14 * 24 * 60 * 60 * 1000

export function UpcomingBillsWidget() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()

  const { data: settingsData, isLoading: settingsLoading } =
    useGetSettingsQuery({}, { enabled: Boolean(activeSpaceId), retry: false })

  const baseCurrency = settingsData?.baseCurrency || "USD"
  const isFinanceConfigured = Boolean(settingsData?.baseCurrency)

  const { data: scheduledData, isLoading: scheduledLoading } =
    useListScheduledTransactionsQuery(
      {
        pageSize: 50,
        pageToken: "",
        status: "PENDING",
        startDate: "",
        endDate: "",
      },
      { enabled: Boolean(activeSpaceId) && isFinanceConfigured, retry: false }
    )

  const { data: recurringData } = useListRecurringTransactionsQuery(
    {
      pageSize: 100,
      pageToken: "",
      status: "STATUS_UNSPECIFIED",
    },
    { enabled: Boolean(activeSpaceId) && isFinanceConfigured, retry: false }
  )

  const recurringTemplates = useMemo(
    () => recurringData?.recurringTransactions ?? [],
    [recurringData?.recurringTransactions]
  )

  const { startTodayMs, endTodayMs, upcomingItems } = useMemo(() => {
    const now = tz.now()
    const startMs = tz.startOfDay(now).getTime()
    const endMs = tz.endOfDay(now).getTime()
    const cutoffMs = startMs + DAYS_14_MS

    const items = (scheduledData?.scheduledTransactions ?? [])
      .filter((st) => {
        const due = parseDate(st.dueDate, tz.timezone)
        if (!due) return false
        return due.getTime() <= cutoffMs
      })
      .sort((a, b) => {
        const aTime = parseDate(a.dueDate, tz.timezone)?.getTime() ?? 0
        const bTime = parseDate(b.dueDate, tz.timezone)?.getTime() ?? 0
        return aTime - bTime
      })

    return {
      startTodayMs: startMs,
      endTodayMs: endMs,
      upcomingItems: items,
    }
  }, [scheduledData?.scheduledTransactions, tz])

  const isLoading =
    settingsLoading ||
    (isFinanceConfigured && scheduledLoading && !scheduledData)

  const visibleItems = upcomingItems.slice(0, 4)

  const navigateToRecurring = () => {
    haptics.light()
    router.push("/(app)/finance/recurring" as never)
  }

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Skeleton width={135} height={16} />
          <Skeleton width={70} height={20} />
        </View>
        <Skeleton width="100%" height={36} />
        <Skeleton width="100%" height={36} />
      </Card>
    )
  }

  return (
    <Card
      style={styles.card}
      onPress={navigateToRecurring}
      testID="upcoming-bills-widget"
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CalendarClock size={16} color={colors.warning} />
          <Text style={styles.headerTitle}>
            {t("dashboard.widget.upcoming_bills.title")}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isFinanceConfigured && upcomingItems.length > 0 && (
            <Badge
              variant="default"
              size="sm"
              label={`Next 14d · ${upcomingItems.length}`}
            />
          )}
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </View>

      {!isFinanceConfigured ? (
        <Text style={styles.emptyText}>
          Configure your base currency in Finance to track scheduled bills.
        </Text>
      ) : visibleItems.length === 0 ? (
        <Text style={styles.emptyText}>
          {t("dashboard.widget.upcoming_bills.empty")}
        </Text>
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item, idx) => {
            const isIncome = item.type === "INCOME"
            const dueMs = parseDate(item.dueDate, tz.timezone)?.getTime()
            const isOverdue = dueMs !== undefined && dueMs < startTodayMs
            const isDueToday =
              !isOverdue &&
              ((dueMs !== undefined &&
                dueMs >= startTodayMs &&
                dueMs <= endTodayMs) ||
                tz.isToday(item.dueDate))

            return (
              <View
                key={item.id || idx}
                style={[
                  styles.itemRow,
                  idx < visibleItems.length - 1 && styles.itemRowDivider,
                ]}
              >
                <View style={styles.itemLeft}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {getScheduledDisplayName(item, recurringTemplates)}
                  </Text>
                  {isOverdue ? (
                    <Badge variant="destructive" size="sm" label="Overdue" />
                  ) : isDueToday ? (
                    <Badge variant="warning" size="sm" label="Due today" />
                  ) : (
                    <Text style={styles.dueText}>
                      Due{" "}
                      {tz.formatDate(item.dueDate, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  )}
                </View>

                <MonoAmount
                  size="sm"
                  color={isIncome ? colors.success : colors.textPrimary}
                  style={styles.amount}
                >
                  {isIncome ? "+" : "-"}
                  {formatAmount(
                    item.amount || "0",
                    item.currency || baseCurrency
                  )}
                </MonoAmount>
              </View>
            )
          })}
        </View>
      )}
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    padding: 16,
    gap: 10,
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
  list: {
    gap: 0,
  },
  itemRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingVertical: 8,
  },
  itemRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  itemLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  dueText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  amount: {
    flexShrink: 0,
  },
})
