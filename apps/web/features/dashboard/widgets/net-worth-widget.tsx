import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Inbox, Landmark } from "lucide-react"
import { calculateAccountMetrics } from "@saturn/core"
import { getLocalizedDashboardWidgetMeta } from "@saturn/i18n"
import {
  useGetInsightsQuery,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListInboxItemsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  useCurrencyConversionPreview,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { DashboardWidgetCard } from "./widget-shell"

export function NetWorthWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { t, locale, language } = useI18n()
  const widgetMeta = getLocalizedDashboardWidgetMeta("net_worth", locale)

  const {
    data: settingsData,
    isLoading: settingsLoading,
    error: settingsError,
  } = useGetSettingsQuery({}, { enabled: Boolean(spaceId), retry: false })

  const baseCurrency = settingsData?.baseCurrency || ""
  const isFinanceConfigured = Boolean(settingsData && baseCurrency)

  const { exchangeRates, isLoading: ratesLoading } =
    useCurrencyConversionPreview({
      spaceId: spaceId || undefined,
      enabled: Boolean(spaceId) && isFinanceConfigured,
      baseCurrency: baseCurrency || "USD",
    })

  const { data: accountsData, isLoading: accountsLoading } =
    useListAccountsQuery(
      { activeOnly: true },
      { enabled: Boolean(spaceId) && isFinanceConfigured, retry: false }
    )

  const { data: insightsData } = useGetInsightsQuery(
    { granularity: "MONTHLY", startDate: "", endDate: "" },
    { enabled: Boolean(spaceId) && isFinanceConfigured, retry: false }
  )

  const { data: inboxData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 100,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: Boolean(spaceId) && isFinanceConfigured, retry: false }
  )

  const metrics = useMemo(() => {
    const accounts = accountsData?.accounts ?? []
    return calculateAccountMetrics(
      accounts,
      baseCurrency || "USD",
      exchangeRates
    )
  }, [accountsData?.accounts, baseCurrency, exchangeRates])

  const monthlyIncomeCents = insightsData?.income?.totalIncome || "0"
  const monthlySpentCents = insightsData?.spent?.totalSpent || "0"
  const monthlyOutflowCents =
    Number(monthlySpentCents) > 0 ? `-${monthlySpentCents}` : "0"
  const currentMonthLabel = tz.format(tz.now(), {
    month: "short",
    year: undefined,
    day: undefined,
  })

  const pendingInboxCount = inboxData?.inboxItems?.length ?? 0
  const pendingInboxLabel = inboxData?.nextPageToken
    ? `${pendingInboxCount}+`
    : String(pendingInboxCount)

  const isLoading =
    settingsLoading ||
    (isFinanceConfigured && (accountsLoading || ratesLoading) && !accountsData)

  return (
    <DashboardWidgetCard
      title={widgetMeta.title}
      icon={Landmark}
      badge={
        isFinanceConfigured ? (
          <Badge variant="neutral">{baseCurrency}</Badge>
        ) : undefined
      }
      aiPrompt={
        isFinanceConfigured
          ? "Analyze my net worth, assets, and liabilities across my active accounts"
          : undefined
      }
      viewAllTo={spaceId ? `/space/${spaceId}/finance/accounts` : undefined}
      viewAllLabel={t("nav.accounts")}
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-3">
          <Skeleton className="h-8 w-44 rounded-md" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        </div>
      }
    >
      {!isFinanceConfigured || settingsError ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Landmark className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {language === "es"
                  ? "Finanzas sin configurar"
                  : "Finance not initialized"}
              </p>
              <p className="text-xs text-muted-foreground">
                {widgetMeta.empty}
              </p>
            </div>
          </div>
          <div>
            <Link
              to={`/space/${spaceId}/finance`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {language === "es"
                ? "Configurar moneda base"
                : "Set up base currency"}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                {language === "es"
                  ? "Patrimonio neto total"
                  : "Total Net Worth"}
              </p>
              <MoneyAmount
                cents={metrics.netWorthCents}
                currency={baseCurrency}
                size="xl"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {metrics.activeCount}{" "}
              {language === "es"
                ? metrics.activeCount === 1
                  ? "cuenta"
                  : "cuentas"
                : metrics.activeCount === 1
                  ? "account"
                  : "accounts"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {language === "es" ? "Activos" : "Assets"}
              </p>
              <MoneyAmount
                cents={metrics.totalAssetsCents}
                currency={baseCurrency}
                size="md"
                className="font-semibold text-success"
              />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {language === "es" ? "Pasivos" : "Liabilities"}
              </p>
              <MoneyAmount
                cents={metrics.totalLiabilitiesCents}
                currency={baseCurrency}
                size="md"
                className="font-semibold text-foreground"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
            <span className="text-xs text-muted-foreground">
              {language === "es"
                ? `Este mes (${currentMonthLabel})`
                : `This Month (${currentMonthLabel})`}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span>{language === "es" ? "Ingresos" : "Inflow"}</span>
                <MoneyAmount
                  cents={monthlyIncomeCents}
                  currency={baseCurrency}
                  size="sm"
                  showSign
                  className="font-semibold text-success"
                />
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span>{language === "es" ? "Gastos" : "Outflow"}</span>
                <MoneyAmount
                  cents={monthlyOutflowCents}
                  currency={baseCurrency}
                  size="sm"
                  showSign
                  className="font-semibold text-destructive"
                />
              </span>
            </div>
          </div>

          {pendingInboxCount > 0 && (
            <Link
              to={`/space/${spaceId}/finance/inbox`}
              className="flex items-center justify-between gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/12"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                <Inbox className="size-3.5 shrink-0" />
                <span className="truncate">
                  {language === "es"
                    ? t("dashboard.pendingInboxItems", {
                        count: pendingInboxLabel,
                      })
                    : `${pendingInboxLabel} staged ${pendingInboxCount === 1 ? "item" : "items"} awaiting review`}
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          )}
        </div>
      )}
    </DashboardWidgetCard>
  )
}
