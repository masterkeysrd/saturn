import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Plus,
  ArrowLeftRight,
  Scale,
  FileCheck2,
  FileText,
  Edit,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  ChartLine,
} from "lucide-react"
import { DetailActions } from "./components/detail-actions"
import {
  DetailConfirm,
  DetailError,
  DetailMetric,
  DetailPending,
  DetailProgress,
  DetailSegments,
} from "./components/detail-ui"
import { toast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useGetAccountQuery,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListBudgetsQuery,
  useUpdateAccountMutation,
  useListExchangeRatesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  useAccountAnalytics,
  invalidateFinanceQueries,
} from "@saturn/hooks/finance"
import { useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { getAccountBaseCents } from "@saturn/core"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Button } from "@/components/ui/button"
import { useSpacePermissions } from "@/features/space/use-space"
import { DetailWorkspace } from "./components/detail-workspace"
import { DetailChart } from "./components/detail-chart"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"
import { CreateAccountSheet } from "./components/create-account-sheet"
import { AdjustBalanceModal } from "./components/adjust-balance-modal"
import { CreateTransferSheet } from "./components/create-transfer-sheet"
export default function AccountDetailView() {
  const { accountId: id = "" } = useParams(),
    { spaceId, isWritable } = useSpacePermissions(),
    { t, language } = useI18n(),
    [action, setAction] = useState(""),
    client = useQueryClient(),
    refresh = () => invalidateFinanceQueries(client)
  const q = useGetAccountQuery({ id, view: "FULL" }),
    a = q.data,
    chart = useAccountAnalytics(spaceId, a),
    settings = useGetSettingsQuery({}),
    base = settings.data?.baseCurrency,
    accounts = useListAccountsQuery({ activeOnly: true }),
    budgets = useListBudgetsQuery({ pageSize: 100, pageToken: "" }),
    rates = useListExchangeRatesQuery({}),
    update = useUpdateAccountMutation()
  if (!a) return <DetailPending title={t("nav.accounts")} error={q.isError} />
  const modal = (key: string) => ({
      open: action === key,
      onOpenChange: (v: boolean) => {
        if (!v) setAction("")
      },
    }),
    limit = Number(a.creditLimit),
    balance = Number(a.currentBalance),
    pct = (100 * balance) / limit
  return (
    <DetailWorkspace
      key={id}
      kind="account"
      id={id}
      title={a.name || t("nav.accounts")}
      icon={
        a.type === "BANK"
          ? Landmark
          : a.type === "CREDIT_CARD"
            ? CreditCard
            : a.type === "CASH"
              ? Coins
              : Wallet
      }
      badge={
        <>
          <Badge variant="secondary">{a.currency}</Badge>
          {a.isDefault && (
            <Badge variant="info" dot>
              {t("finance.accounts.card.defaultBadge")}
            </Badge>
          )}
          {!a.isActive && (
            <Badge variant="neutral">{t("finance.detail.inactive")}</Badge>
          )}
        </>
      }
      description={
        <>
          <span>
            {[
              a.institution?.name,
              getLocalizedEnumLabel("finance", "accountType", a.type, language),
              a.lastFour && `•••• ${a.lastFour}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {a.notes && (
            <span className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" />
              {a.notes}
            </span>
          )}
        </>
      }
      actions={
        <>
          {isWritable && a.isActive && (
            <>
              <Button onClick={() => setAction("record")}>
                <Plus />
                {t("finance.detail.record")}
              </Button>
              <Button variant="outline" onClick={() => setAction("transfer")}>
                <ArrowLeftRight />
                {t("finance.reconcile.row.transfer")}
              </Button>
              <Button variant="outline" onClick={() => setAction("adjust")}>
                <Scale />
                {t("finance.accounts.card.adjust")}
              </Button>
            </>
          )}
          <DetailActions
            items={[
              ...(isWritable
                ? [
                    {
                      label: t("common.edit"),
                      icon: Edit,
                      onClick: () => setAction("edit"),
                    },
                  ]
                : []),
              {
                icon: FileCheck2,
                label: t("finance.detail.statement"),
                render: (
                  <Link
                    to={`/space/${spaceId}/finance/reconcile?accountId=${id}`}
                  />
                ),
              },
              ...(isWritable && a.isActive && !a.isDefault
                ? [
                    {
                      label: t("finance.detail.archive"),
                      icon: Archive,
                      destructive: true,
                      separatorBefore: true,
                      onClick: () => setAction("archive"),
                    },
                  ]
                : []),
            ]}
          />
        </>
      }
      analytics={
        <>
          {" "}
          {chart.query.isError && (
            <DetailError>{t("finance.detail.error")}</DetailError>
          )}
          <DetailChart
            icon={ChartLine}
            title={t(`finance.detail.${chart.mode}`)}
            loading={chart.query.isLoading}
            points={chart.query.isSuccess ? chart.points : []}
            currency={a.currency}
            bars={chart.mode === "flow"}
            valueLabel={t(
              chart.mode === "flow"
                ? "finance.insights.inflows"
                : "finance.accounts.adjust.currentBalance"
            )}
            comparisonLabel={t("finance.insights.outflows")}
            ceilingLabel={t("finance.budgets.thLimit")}
            headerExtra={
              <DetailSegments
                values={["balance", "flow"] as const}
                active={chart.mode}
                label={(v) => t(`finance.detail.${v}`)}
                onChange={chart.setMode}
              />
            }
            toolbar={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DetailSegments
                  values={["30D", "90D", "YTD", "1Y"] as const}
                  active={chart.period}
                  label={(v) =>
                    getLocalizedEnumLabel("finance", "chartPeriod", v, language)
                  }
                  onChange={chart.setPeriod}
                />
                {chart.mode === "flow" && (
                  <DetailSegments
                    values={["week", "month"] as const}
                    active={chart.interval}
                    onChange={chart.setInterval}
                    label={(v) => t(`finance.detail.${v}`)}
                  />
                )}
              </div>
            }
          />
        </>
      }
      accounts={accounts.data?.accounts}
      budgets={budgets.data?.budgets}
      exchangeRates={rates.data?.exchangeRates}
      request={{ accountId: id }}
      baseCurrency={base}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailMetric
          label={t("finance.accounts.adjust.currentBalance")}
          icon={Wallet}
          tone="text-primary"
          cents={balance}
          currency={a.currency}
        >
          {base &&
            base !== a.currency &&
            (a.conversion?.balance ||
              rates.data?.exchangeRates?.some(
                (r) => r.fromCurrency === a.currency && r.toCurrency === base
              )) && (
              <div className="text-xs text-muted-foreground">
                ≈{" "}
                <MoneyAmount
                  size="sm"
                  currency={base}
                  cents={getAccountBaseCents(
                    a,
                    base,
                    rates.data?.exchangeRates || []
                  )}
                />
              </div>
            )}
        </DetailMetric>
        {(
          [
            ["net", Scale, "text-info"],
            ["inflow", ArrowUpRight, "text-success"],
            ["outflow", ArrowDownLeft, "text-destructive"],
          ] as const
        ).map(([k, icon, tone]) => (
          <DetailMetric
            key={k}
            label={t(`finance.detail.${k}`)}
            icon={icon}
            tone={tone}
            cents={chart.query.isSuccess ? chart[k] : undefined}
            currency={a.currency}
            colored={k === "net"}
            sign
          />
        ))}
      </div>
      {a.type === "CREDIT_CARD" && limit > 0 && (
        <DetailProgress
          value={Math.max(0, balance)}
          max={limit}
          tone={pct >= 90 ? "destructive" : pct >= 75 ? "warning" : "primary"}
          label={t("finance.detail.utilization")}
        >
          <div className="flex justify-between text-xs text-muted-foreground">
            {t("finance.detail.available")}
            <MoneyAmount
              cents={Math.max(0, limit - balance)}
              currency={a.currency}
            />
          </div>
        </DetailProgress>
      )}
      <DetailConfirm
        open={action === "archive"}
        onClose={() => setAction("")}
        title={t("finance.detail.archive")}
        description={t("finance.detail.archiveDescription", { name: a.name })}
        label={t("finance.detail.archive")}
        pending={update.isPending}
        onConfirm={() =>
          update.mutate(
            {
              id,
              req: {
                id,
                version: a.version,
                account: { ...a, isActive: false },
                updateMask: { paths: ["is_active"] },
              },
            },
            {
              onSuccess: () => {
                setAction("")
                toast.add({
                  type: "success",
                  title: t("finance.detail.archived"),
                })
                return refresh()
              },
              onError: (e) =>
                toast.add({
                  type: "error",
                  title: t("finance.detail.archiveFailed"),
                  description: e.message,
                }),
            }
          )
        }
      />
      {update.isError && <DetailError>{update.error.message}</DetailError>}
      {action === "record" && (
        <CreateTransactionSheet
          cashEntriesOnly
          {...modal("record")}
          spaceId={spaceId}
          baseCurrency={base}
          accounts={[a]}
          budgets={budgets.data?.budgets}
          refetchData={refresh}
        />
      )}{" "}
      {action === "edit" && (
        <CreateAccountSheet
          {...modal("edit")}
          spaceId={spaceId}
          baseCurrency={base || a.currency}
          editAccount={a}
          refetchAccounts={refresh}
        />
      )}{" "}
      {action === "adjust" && (
        <AdjustBalanceModal
          {...modal("adjust")}
          account={a}
          refetchAccounts={refresh}
          refetchTransfers={refresh}
        />
      )}{" "}
      {action === "transfer" && (
        <CreateTransferSheet
          {...modal("transfer")}
          sourceAccountId={id}
          accounts={accounts.data?.accounts || []}
          refetchAccounts={refresh}
          refetchTransfers={refresh}
        />
      )}
    </DetailWorkspace>
  )
}
