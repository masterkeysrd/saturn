import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, PiggyBank } from "lucide-react"
import { convertCentsToBase } from "@saturn/core"
import { getLocalizedDashboardWidgetMeta } from "@saturn/i18n"
import {
  useGetSettingsQuery,
  useListBudgetsQuery,
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
import { cn } from "@/lib/utils"
import { DashboardWidgetCard } from "./widget-shell"

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function BudgetPaceWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { t, locale, language } = useI18n()
  const widgetMeta = getLocalizedDashboardWidgetMeta("budget_pace", locale)

  const {
    data: settingsData,
    isLoading: settingsLoading,
    error: settingsError,
  } = useGetSettingsQuery({}, { enabled: Boolean(spaceId), retry: false })

  const baseCurrency = settingsData?.baseCurrency || ""
  const isFinanceConfigured = Boolean(settingsData && baseCurrency)

  const { exchangeRates } = useCurrencyConversionPreview({
    spaceId: spaceId || undefined,
    enabled: Boolean(spaceId) && isFinanceConfigured,
    baseCurrency: baseCurrency || "USD",
  })

  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    {
      view: "FULL",
      statuses: ["ACTIVE"],
      pageSize: 100,
      pageToken: "",
    },
    { enabled: Boolean(spaceId) && isFinanceConfigured, retry: false }
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

      if (!isNaN(limitCents)) totalLimitCents += limitCents
      if (!isNaN(spentCents)) totalSpentCents += spentCents
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
      monthlyCount: monthlyBudgets.length,
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

  const isEs = language === "es"
  const badgeConfig = summary.isMonthlyMode
    ? summary.paceStatus === "over_pace"
      ? {
          variant: "destructive" as const,
          label: isEs ? "Por encima del ritmo" : "Over pace",
        }
      : summary.paceStatus === "ahead"
        ? {
            variant: "success" as const,
            label: isEs ? "Por debajo del ritmo" : "Ahead of pace",
          }
        : { variant: "info" as const, label: isEs ? "En ritmo" : "On track" }
    : summary.spentPct > 100
      ? {
          variant: "destructive" as const,
          label: isEs ? "Límite superado" : "Over limit",
        }
      : {
          variant: "neutral" as const,
          label: `${summary.otherCount} ${isEs ? "activos" : "active"}`,
        }

  return (
    <DashboardWidgetCard
      title={widgetMeta.title}
      icon={PiggyBank}
      badge={
        isFinanceConfigured && summary.totalCount > 0 ? (
          <Badge variant={badgeConfig.variant} dot>
            {badgeConfig.label}
          </Badge>
        ) : undefined
      }
      aiPrompt={
        isFinanceConfigured && summary.totalCount > 0
          ? "Review my active budgets this month and highlight any categories running ahead of pace"
          : undefined
      }
      viewAllTo={spaceId ? `/space/${spaceId}/finance/budgets` : undefined}
      viewAllLabel={t("nav.budgets")}
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-3">
          <Skeleton className="h-7 w-40 rounded-md" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-3/4 rounded-md" />
        </div>
      }
    >
      {!isFinanceConfigured || settingsError ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <PiggyBank className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {isEs ? "Finanzas sin configurar" : "Finance not initialized"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEs
                  ? "Configura una moneda base antes de seguir límites de presupuesto."
                  : "Set a base currency before tracking budget limits."}
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
      ) : summary.totalCount === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <PiggyBank className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {isEs ? "Sin presupuestos activos" : "No active budgets yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {widgetMeta.empty}
              </p>
            </div>
          </div>
          <div>
            <Link
              to={`/space/${spaceId}/finance/budgets`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isEs ? "Crear presupuesto" : "Create budget"}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <MoneyAmount
                cents={summary.totalSpentCents}
                currency={baseCurrency}
                size="lg"
              />
              <span className="text-xs text-muted-foreground">
                {isEs ? "de" : "of"}
              </span>
              <MoneyAmount
                cents={summary.totalLimitCents}
                currency={baseCurrency}
                size="sm"
                className="text-muted-foreground"
              />
            </div>
            <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
              {summary.spentPct}%
            </span>
          </div>

          <div className="space-y-2">
            <div
              className="relative h-2 w-full rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.min(100, summary.spentPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                summary.isMonthlyMode
                  ? widgetMeta.title
                  : isEs
                    ? "Uso de presupuestos activos"
                    : "Active budget usage"
              }
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  summary.paceStatus === "over_pace"
                    ? "bg-destructive"
                    : summary.paceStatus === "ahead"
                      ? "bg-success"
                      : "bg-primary"
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, summary.spentPct))}%`,
                }}
              />
              {summary.isMonthlyMode && (
                <div
                  title={`Today · Day ${summary.dayOfMonth} (${summary.elapsedPct}% of month)`}
                  className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-foreground/80"
                  style={{ left: `${summary.elapsedPct}%` }}
                />
              )}
            </div>

            {summary.isMonthlyMode ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {isEs
                    ? `Día ${summary.dayOfMonth} · ${summary.elapsedPct}% del mes`
                    : `Day ${summary.dayOfMonth} · ${summary.elapsedPct}% of month`}
                  {summary.otherCount > 0 && (
                    <span className="ml-1.5 text-muted-foreground/80">
                      · +{summary.otherCount}{" "}
                      {isEs ? "semanal/anual" : "weekly/yearly"}
                    </span>
                  )}
                </span>
                {summary.paceDeltaCents >= 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <MoneyAmount
                      cents={summary.paceDeltaCents}
                      currency={baseCurrency}
                      size="sm"
                      className="text-success"
                    />
                    <span>{isEs ? "bajo el ritmo" : "under pace"}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <MoneyAmount
                      cents={Math.abs(summary.paceDeltaCents)}
                      currency={baseCurrency}
                      size="sm"
                      className="text-destructive"
                    />
                    <span>{isEs ? "sobre el ritmo" : "over pace"}</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {summary.otherCount}{" "}
                  {isEs
                    ? summary.otherCount === 1
                      ? "presupuesto semanal/anual"
                      : "presupuestos semanales/anuales"
                    : `weekly/yearly ${summary.otherCount === 1 ? "budget" : "budgets"}`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MoneyAmount
                    cents={Math.max(
                      0,
                      summary.totalLimitCents - summary.totalSpentCents
                    )}
                    currency={baseCurrency}
                    size="sm"
                    className="text-foreground"
                  />
                  <span>{isEs ? "restante" : "remaining"}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardWidgetCard>
  )
}
