import { DetailActions } from "./components/detail-actions"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { DetailPending, DetailError } from "./components/detail-ui"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  PlayCircle,
  Unlock,
  Edit,
  PauseCircle,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChartLine,
  ChartColumn,
  Landmark,
  CreditCard,
  Coins,
  Wallet,
} from "lucide-react"
import { getBudgetColors, getBudgetIcon } from "./utils"
import { useState, createElement } from "react"
import { useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useGetBudgetQuery,
  useGetBudgetPeriodQuery,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListExchangeRatesQuery,
  useUpdateBudgetMutation,
  type Budget_Status,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  useBudgetAnalytics,
  invalidateFinanceQueries,
} from "@saturn/hooks/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import { getColorHex, getDaysDiff } from "@saturn/core"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Button } from "@/components/ui/button"
import { useSpacePermissions } from "@/features/space/use-space"
import { DetailWorkspace } from "./components/detail-workspace"
import { DetailChart } from "./components/detail-chart"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"
import { EditBudgetSheet } from "./components/edit-budget-sheet"

export default function BudgetDetailView() {
  const { budgetId: id = "" } = useParams(),
    { spaceId, isWritable } = useSpacePermissions(),
    tz = useTimezone(),
    { t, language } = useI18n(),
    [date, select] = useState(""),
    [action, setAction] = useState(""),
    client = useQueryClient(),
    refresh = () => invalidateFinanceQueries(client),
    q = useGetBudgetQuery({ id }),
    b = q.data,
    today = tz.startOfDay(tz.now()).toISOString(),
    current = useGetBudgetPeriodQuery({ budgetId: id, date: today }),
    period = useGetBudgetPeriodQuery({ budgetId: id, date: date || today }),
    p = period.data,
    chart = useBudgetAnalytics(spaceId, b, p, current.data),
    accounts = useListAccountsQuery({ activeOnly: true }),
    rates = useListExchangeRatesQuery({}),
    settings = useGetSettingsQuery({}),
    update = useUpdateBudgetMutation(),
    base = settings.data?.baseCurrency
  if (!b) return <DetailPending title={t("nav.budgets")} error={q.isError} />
  const change = (status: Budget_Status) =>
      update.mutate(
        {
          id,
          req: {
            id,
            version: b.version,
            budget: { ...b, status },
            updateMask: { paths: ["status"] },
            propagation: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
          },
        },
        {
          onSuccess: () => {
            toast.add({
              type: "success",
              title: t("finance.budgets.mobile.toastStatusTitle", {
                action: t(
                  status === "CLOSED"
                    ? "finance.budgets.mobile.statusAction.Closed"
                    : status === "PAUSED"
                      ? "finance.budgets.mobile.statusAction.Paused"
                      : b.status === "CLOSED"
                        ? "finance.budgets.mobile.statusAction.Reopened"
                        : "finance.budgets.mobile.statusAction.Resumed"
                ),
              }),
            })
            return refresh()
          },
          onError: (e) =>
            toast.add({
              type: "error",
              title: t("finance.budgets.mobile.toastActionFailed"),
              description: e.message,
            }),
        }
      ),
    close = () => setAction(""),
    limit = Number(p?.limitAmount || 0),
    spent = Number(p?.spentAmount || 0),
    diff = limit - spent,
    isCurrent =
      !date ||
      (!!p?.startDate &&
        !!current.data?.startDate &&
        p.startDate === current.data.startDate),
    days = p?.endDate ? (getDaysDiff(p.endDate, tz.timezone) ?? 0) + 1 : 0,
    active =
      !!p &&
      b.interval !== "ONE_TIME" &&
      isCurrent &&
      b.status === "ACTIVE" &&
      days > 0,
    elapsed =
      p?.startDate && p?.endDate
        ? (+tz.now() - +tz.startOfDay(p.startDate)) /
          Math.max(1, +tz.endOfDay(p.endDate) - +tz.startOfDay(p.startDate))
        : 0,
    clampedElapsedPct = Math.min(100, Math.max(0, Math.round(100 * elapsed))),
    rateToBase = p?.exchangeRateToBase ?? 0,
    showBasePreview = Boolean(
      p && b.currency && base && b.currency !== base && rateToBase > 0
    ),
    accent = getColorHex(b.color || "teal"),
    defaultAccount = b.defaultAccountId
      ? accounts.data?.accounts?.find((acc) => acc.id === b.defaultAccountId)
      : undefined,
    DefaultAccountIcon =
      defaultAccount?.type === "BANK"
        ? Landmark
        : defaultAccount?.type === "CREDIT_CARD"
          ? CreditCard
          : defaultAccount?.type === "CASH"
            ? Coins
            : Wallet
  const theme = getBudgetColors(b.color),
    Primary =
      b.status === "PAUSED" ? PlayCircle : b.status === "CLOSED" ? Unlock : Plus
  return (
    <DetailWorkspace
      key={id}
      accounts={accounts.data?.accounts}
      exchangeRates={rates.data?.exchangeRates}
      budgets={[b]}
      kind="budget"
      leading={
        <span
          className={`rounded-lg border p-2 ${theme.bg} ${theme.border} ${theme.text}`}
        >
          {createElement(getBudgetIcon(b.icon), { className: "size-4" })}
        </span>
      }
      badge={
        <>
          <Badge variant="secondary">{b.currency}</Badge>
          <Badge variant="neutral">
            {getLocalizedEnumLabel("finance", "interval", b.interval, language)}
          </Badge>
          {(b.status === "PAUSED" || b.status === "CLOSED") && (
            <Badge
              variant={b.status === "PAUSED" ? "warning" : "destructive"}
              dot
            >
              {getLocalizedEnumLabel("finance", "status", b.status, language)}
            </Badge>
          )}
        </>
      }
      description={
        defaultAccount ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <DefaultAccountIcon className="size-3.5 shrink-0" />
            <span>
              {t("finance.budgets.progress.defaultAccountTitle", {
                name: defaultAccount.name || "",
              })}
            </span>
          </span>
        ) : undefined
      }
      id={id}
      title={b.name || t("nav.budgets")}
      request={{
        budgetId: id,
        startDate: p?.startDate,
        endDate: p?.endDate,
        types: ["EXPENSE"],
      }}
      baseCurrency={base}
      actions={
        <>
          <div className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-border bg-control text-xs font-medium shadow-2xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-full w-8 rounded-none border-r border-border/70 text-muted-foreground hover:text-foreground"
              aria-label={t("finance.detail.previous")}
              disabled={b.interval === "ONE_TIME" || !p}
              onClick={() =>
                p?.startDate &&
                select(new Date(+tz.startOfDay(p.startDate) - 1).toISOString())
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="inline-flex items-center px-3 whitespace-nowrap text-foreground">
              {b.interval === "ONE_TIME" ? (
                t("finance.budgets.mobile.lifetimeAllocation")
              ) : p ? (
                tz.formatDateRange(p.startDate, p.endDate)
              ) : period.isError ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Skeleton className="h-3.5 w-24" />
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-full w-8 rounded-none border-l border-border/70 text-muted-foreground hover:text-foreground"
              disabled={isCurrent || b.interval === "ONE_TIME" || !p}
              aria-label={t("finance.detail.next")}
              onClick={() =>
                p?.endDate &&
                select(new Date(+tz.endOfDay(p.endDate) + 1).toISOString())
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!isCurrent &&
            b.interval !== "ONE_TIME" &&
            !(period.isError && !p) && (
              <Button
                variant="outline"
                size="default"
                onClick={() => select("")}
              >
                {t("finance.budgets.mobile.currentPeriod")}
              </Button>
            )}
          {isWritable && (
            <>
              <Button
                disabled={update.isPending}
                onClick={() =>
                  b.status === "ACTIVE"
                    ? setAction("expense")
                    : change("ACTIVE")
                }
              >
                <Primary className="size-4" />
                {t(
                  b.status === "PAUSED"
                    ? "finance.budgets.resumeBudget"
                    : b.status === "CLOSED"
                      ? "finance.budgets.reopenBudget"
                      : "finance.budgets.mobile.addExpense"
                )}
              </Button>
              <DetailActions
                items={[
                  {
                    icon: Edit,
                    label: t("common.edit"),
                    onClick: () => setAction("edit"),
                  },
                  ...(b.status === "ACTIVE"
                    ? [
                        {
                          icon: PauseCircle,
                          label: t("finance.budgets.pauseBudget"),
                          onClick: () => change("PAUSED"),
                        },
                      ]
                    : []),
                  ...(b.status !== "CLOSED"
                    ? [
                        {
                          icon: Lock,
                          destructive: true,
                          separatorBefore: true,
                          label: t("finance.budgets.closeBudget"),
                          onClick: () => change("CLOSED"),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )}
        </>
      }
      analytics={
        <div className="space-y-4">
          {(chart.query.isError || chart.history.isError) && (
            <DetailError>{t("finance.detail.error")}</DetailError>
          )}
          <div
            className={
              b.interval !== "ONE_TIME"
                ? "grid gap-4 lg:grid-cols-2"
                : "grid gap-4"
            }
          >
            <DetailChart
              title={t("finance.detail.burn")}
              icon={ChartLine}
              loading={period.isLoading || chart.query.isLoading}
              valueLabel={t("finance.budgets.thSpent")}
              comparisonLabel={t("finance.detail.ideal")}
              ceilingLabel={t("finance.budgets.thLimit")}
              points={chart.query.isSuccess ? chart.burn : []}
              currency={b.currency}
              accent={accent}
            />
            {b.interval !== "ONE_TIME" &&
              (chart.history.isLoading ||
                (chart.history.isSuccess && chart.periods.length > 0)) && (
                <DetailChart
                  title={t("finance.detail.history")}
                  icon={ChartColumn}
                  loading={chart.history.isLoading}
                  valueLabel={t("finance.budgets.thSpent")}
                  ceilingLabel={t("finance.budgets.thLimit")}
                  activeDate={p?.startDate}
                  points={chart.history.isSuccess ? chart.periods : []}
                  currency={b.currency}
                  bars
                  onSelect={select}
                  accent={accent}
                />
              )}
          </div>
        </div>
      }
    >
      {update.isError && <DetailError>{update.error.message}</DetailError>}
      {!p && period.isError ? (
        <DetailError>
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            <span>{t("finance.detail.error")}</span>
            {!isCurrent && b.interval !== "ONE_TIME" && (
              <Button variant="outline" size="sm" onClick={() => select("")}>
                {t("finance.budgets.mobile.currentPeriod")}
              </Button>
            )}
          </div>
        </DetailError>
      ) : !p ? (
        <section
          role="status"
          className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xs"
        >
          <span className="sr-only">{t("common.loading")}</span>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 w-36" />
            </div>
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-medium text-muted-foreground">
                {t(
                  diff < 0
                    ? "finance.budgets.progress.overBudget"
                    : "finance.budgets.progress.remaining"
                )}
              </span>
              <MoneyAmount
                className={
                  diff < 0
                    ? "mt-0.5 block text-destructive"
                    : "mt-0.5 block text-foreground"
                }
                cents={Math.abs(diff)}
                currency={b.currency}
                size="xl"
              />
              {showBasePreview && (
                <div className="mt-1 text-xs text-muted-foreground">
                  ≈{" "}
                  <MoneyAmount
                    size="sm"
                    currency={base}
                    cents={Math.round(Math.abs(diff) * rateToBase)}
                  />
                </div>
              )}
            </div>
            <Badge
              className="shrink-0 font-mono tabular-nums"
              variant={
                diff < 0
                  ? "destructive"
                  : spent >= limit * 0.85
                    ? "warning"
                    : "success"
              }
            >
              {limit > 0 ? Math.round((100 * spent) / limit) : 0}%
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-label={b.name || t("nav.budgets")}
              aria-valuemin={0}
              aria-valuemax={limit || 1}
              aria-valuenow={Math.min(limit || 1, Math.max(0, spent))}
              className="relative h-2 rounded-full bg-secondary"
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, (spent / Math.max(1, limit)) * 100)}%`,
                  backgroundColor:
                    diff < 0
                      ? "var(--destructive)"
                      : spent >= limit * 0.85
                        ? "var(--warning)"
                        : accent,
                }}
              />
              {active && (
                <span
                  data-testid="budget-pace-tick"
                  title={t("finance.budgets.progress.paceTick", {
                    pct: clampedElapsedPct,
                  })}
                  aria-label={t("finance.budgets.progress.paceTickAria", {
                    pct: clampedElapsedPct,
                  })}
                  className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-1 ring-card"
                  style={{
                    left: `${Math.min(100, Math.max(0, 100 * elapsed))}%`,
                  }}
                />
              )}
            </div>
            {active && (
              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-0.5 rounded-full bg-foreground"
                />
                <span className="font-mono tabular-nums">
                  {t("finance.budgets.progress.paceTick", {
                    pct: clampedElapsedPct,
                  })}
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-3">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("finance.budgets.thSpent")}
              </span>
              <MoneyAmount
                className="mt-1 block font-semibold text-foreground"
                size="md"
                currency={b.currency}
                cents={spent}
              />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("finance.budgets.thLimit")}
              </span>
              <MoneyAmount
                className="mt-1 block font-semibold text-foreground"
                size="md"
                currency={b.currency}
                cents={limit}
              />
            </div>
            {active ? (
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3 shrink-0 text-primary" />
                  {t("finance.detail.safeDailySpend")}
                </span>
                <MoneyAmount
                  className="mt-1 block font-semibold text-foreground"
                  size="md"
                  cents={Math.floor(Math.max(0, diff) / days)}
                  currency={b.currency}
                />
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("finance.budgets.mobile.allowanceDaysLeft", {
                    days,
                    unit: t(
                      days === 1
                        ? "finance.budgets.mobile.daysUnitOne"
                        : "finance.budgets.mobile.daysUnitMany"
                    ),
                  })}
                </span>
              </div>
            ) : (
              !isCurrent && (
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("finance.detail.closedSummary")}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {diff < 0 ? (
                      <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    )}
                    <span>
                      {t(
                        diff < 0
                          ? "finance.detail.over"
                          : "finance.detail.under",
                        {
                          amount: tz.formatMoney(Math.abs(diff), b.currency),
                        }
                      )}
                    </span>
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      )}
      {action === "expense" && (
        <CreateTransactionSheet
          open
          onOpenChange={close}
          spaceId={spaceId}
          baseCurrency={base || b.currency || "USD"}
          accounts={accounts.data?.accounts}
          budgets={[b]}
          preselectedBudgetId={id}
          refetchData={refresh}
        />
      )}
      {action === "edit" && (
        <EditBudgetSheet
          open
          onOpenChange={close}
          activeBudget={b}
          spaceId={spaceId}
          accounts={accounts.data?.accounts || []}
          baseCurrency={base || b.currency || "USD"}
        />
      )}
    </DetailWorkspace>
  )
}
