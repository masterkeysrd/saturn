import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, CalendarClock } from "lucide-react"
import { getScheduledDisplayName, parseDate } from "@saturn/core"
import { getLocalizedDashboardWidgetMeta } from "@saturn/i18n"
import {
  useGetSettingsQuery,
  useListScheduledTransactionsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { DashboardWidgetCard } from "./widget-shell"

const DAYS_14_MS = 14 * 24 * 60 * 60 * 1000

export function UpcomingBillsWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { locale, language } = useI18n()
  const isEs = language === "es"
  const widgetMeta = getLocalizedDashboardWidgetMeta("upcoming_bills", locale)

  const {
    data: settingsData,
    isLoading: settingsLoading,
    error: settingsError,
  } = useGetSettingsQuery({}, { enabled: Boolean(spaceId), retry: false })

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
      { enabled: Boolean(spaceId) && isFinanceConfigured, retry: false }
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

  return (
    <DashboardWidgetCard
      title={widgetMeta.title}
      icon={CalendarClock}
      badge={
        isFinanceConfigured && upcomingItems.length > 0 ? (
          <Badge variant="neutral">
            {isEs
              ? `Próx. 14d · ${upcomingItems.length}`
              : `Next 14d · ${upcomingItems.length}`}
          </Badge>
        ) : undefined
      }
      aiPrompt={
        isFinanceConfigured
          ? "Summarize my upcoming scheduled bills and recurring inflows for the next 14 days"
          : undefined
      }
      viewAllTo={spaceId ? `/space/${spaceId}/finance/recurring` : undefined}
      viewAllLabel={isEs ? "Recurrentes" : "Recurring"}
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-2.5">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      }
    >
      {!isFinanceConfigured || settingsError ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarClock className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {isEs ? "Finanzas sin configurar" : "Finance not initialized"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEs
                  ? "Configura tu moneda base para seguir facturas programadas."
                  : "Configure your base currency to track scheduled bills."}
              </p>
            </div>
          </div>
          <div>
            <Link
              to={`/space/${spaceId}/finance`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isEs ? "Configurar moneda base" : "Set up base currency"}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarClock className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {widgetMeta.empty}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEs
                  ? "Los gastos e ingresos recurrentes programados aparecerán aquí."
                  : "Scheduled recurring expenses and inflows will appear here."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {visibleItems.map((item) => {
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
              <Link
                key={item.id}
                to={`/space/${spaceId}/finance/recurring`}
                className="flex items-center justify-between gap-3 py-2.5 transition-colors first:pt-0 last:pb-0 hover:text-primary"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {getScheduledDisplayName(item)}
                  </p>
                  {isOverdue ? (
                    <Badge variant="destructive" dot>
                      {isEs ? "Vencida" : "Overdue"}
                    </Badge>
                  ) : isDueToday ? (
                    <Badge variant="warning">
                      {isEs ? "Vence hoy" : "Due today"}
                    </Badge>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Vence" : "Due"} {tz.formatDate(item.dueDate)}
                    </p>
                  )}
                </div>
                <MoneyAmount
                  cents={isIncome ? item.amount : `-${item.amount}`}
                  currency={item.currency}
                  colored
                  showSign
                  size="sm"
                  className="shrink-0 font-medium"
                />
              </Link>
            )
          })}
        </div>
      )}
    </DashboardWidgetCard>
  )
}
