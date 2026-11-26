import { DetailActions } from "./components/detail-actions"
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useGetBorrowingQuery,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListExchangeRatesQuery,
  useListBudgetsQuery,
  useDeleteBorrowingMutation,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  useBorrowingAnalytics,
  invalidateFinanceQueries,
} from "@saturn/hooks/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { convertCentsToBase, getDaysDiff } from "@saturn/core"
import {
  HandCoins,
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Phone,
  Calendar,
  CalendarClock,
  FileText,
  Plus,
  PlusCircle,
  Edit,
  Trash2,
  Scale,
  ChartLine,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { MoneyAmount } from "@/components/ui/money-amount"
import { toast } from "@/components/ui/toast"
import {
  DetailPending,
  DetailError,
  DetailConfirm,
} from "./components/detail-ui"
import { Button } from "@/components/ui/button"
import { useSpacePermissions } from "@/features/space/use-space"
import { DetailWorkspace } from "./components/detail-workspace"
import { DetailChart } from "./components/detail-chart"
import { CreateBorrowingTransactionForm } from "./components/create-borrowing-transaction-form"
import { CreateBorrowingSheet } from "./components/create-borrowing-sheet"
import { AdjustBorrowingModal } from "./components/adjust-borrowing-modal"

export default function BorrowingDetailView() {
  const { borrowingId: id = "" } = useParams(),
    { spaceId, isWritable } = useSpacePermissions(),
    tz = useTimezone(),
    { t, language } = useI18n(),
    navigate = useNavigate(),
    [action, setAction] = useState(""),
    client = useQueryClient(),
    refresh = () => invalidateFinanceQueries(client),
    q = useGetBorrowingQuery({ id }),
    b = q.data,
    chart = useBorrowingAnalytics(spaceId, b),
    accounts = useListAccountsQuery({}),
    rates = useListExchangeRatesQuery({}),
    budgets = useListBudgetsQuery({ pageSize: 100, pageToken: "" }),
    settings = useGetSettingsQuery({}),
    remove = useDeleteBorrowingMutation(),
    close = () => setAction("")
  if (!b) return <DetailPending title={t("nav.borrowing")} error={q.isError} />
  const lent = b.direction === "LENT",
    account = accounts.data?.accounts?.find((a) => a.id === b.accountId),
    AccountIcon =
      account?.type === "BANK"
        ? Landmark
        : account?.type === "CREDIT_CARD"
          ? CreditCard
          : account?.type === "CASH"
            ? Coins
            : Wallet,
    paid = b.status === "PAID_OFF",
    total = Number(b.totalAmount),
    remaining = Number(b.remainingAmount),
    settled = Math.max(0, total - remaining),
    pct =
      total > 0
        ? Math.min(100, Math.max(0, Math.round((100 * settled) / total)))
        : paid
          ? 100
          : 0,
    days = getDaysDiff(b.dueAt, tz.timezone),
    base = settings.data?.baseCurrency,
    exchangeRates = rates.data?.exchangeRates || [],
    showBasePreview = Boolean(
      base &&
      b.currency &&
      base !== b.currency &&
      exchangeRates.some(
        (r) =>
          ((r.fromCurrency === b.currency && r.toCurrency === base) ||
            (r.fromCurrency === base && r.toCurrency === b.currency)) &&
          r.rate > 0
      )
    )
  return (
    <DetailWorkspace
      key={id}
      accounts={accounts.data?.accounts}
      exchangeRates={rates.data?.exchangeRates}
      budgets={budgets.data?.budgets}
      kind="borrowing"
      id={id}
      title={b.counterparty || t("nav.borrowing")}
      leading={
        <span
          className={`rounded-lg border p-2 ${
            lent
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          <HandCoins className="size-4" />
        </span>
      }
      badge={
        <>
          {b.currency && <Badge variant="secondary">{b.currency}</Badge>}
          <Badge variant={lent ? "success" : "destructive"} dot>
            {t(
              lent
                ? "finance.borrowing.badgeLent"
                : "finance.borrowing.badgeBorrowed"
            )}
          </Badge>
          <Badge variant={paid ? "neutral" : "info"}>
            {t(
              paid
                ? "finance.borrowing.mobile.badgePaidOff"
                : "finance.borrowing.mobile.badgeActive"
            )}
          </Badge>
        </>
      }
      description={
        <>
          <span className="flex flex-wrap items-center gap-3 text-xs">
            {account && (
              <span className="inline-flex items-center gap-1">
                <AccountIcon className="size-3.5 shrink-0" />
                {account.name}
              </span>
            )}
            {b.contactInfo && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5 shrink-0" />
                {b.contactInfo}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5 shrink-0" />
              {t("finance.borrowing.mobile.startedOn", {
                date: tz.format(b.establishedAt),
              })}
            </span>
          </span>
          {b.notes && (
            <span className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" />
              {b.notes}
            </span>
          )}
        </>
      }
      actions={
        isWritable && (
          <>
            {!paid && (
              <Button onClick={() => setAction("repay")}>
                <Plus />
                {t(
                  lent
                    ? "finance.borrowing.mobile.receivePayment"
                    : "finance.borrowing.mobile.repayDebt"
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setAction("disburse")}>
              <PlusCircle />
              {getLocalizedEnumLabel(
                "finance",
                "borrowingRole",
                "DISBURSEMENT",
                language
              )}
            </Button>
            <DetailActions
              items={[
                {
                  icon: Scale,
                  label: t("finance.borrowing.adjustBalance"),
                  onClick: () => setAction("adjust"),
                },
                {
                  icon: Edit,
                  label: t("common.edit"),
                  onClick: () => setAction("edit"),
                },
                {
                  icon: Trash2,
                  label: t("common.delete"),
                  destructive: true,
                  separatorBefore: true,
                  onClick: () => setAction("delete"),
                },
              ]}
            />
          </>
        )
      }
      analytics={
        <div className="space-y-4">
          {chart.query.isError && (
            <DetailError>{t("finance.detail.error")}</DetailError>
          )}
          <DetailChart
            icon={ChartLine}
            title={t("finance.detail.paydown")}
            loading={chart.query.isLoading}
            points={chart.query.isSuccess ? chart.points : []}
            currency={b.currency}
            stepped
            valueLabel={t("finance.detail.paydown")}
            comparisonLabel={t("finance.detail.target")}
          />
        </div>
      }
      request={{ borrowingId: id }}
      baseCurrency={base}
    >
      {remove.isError && <DetailError>{remove.error.message}</DetailError>}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">
              {t("finance.budgets.progress.remaining")}
            </span>
            <MoneyAmount
              className="mt-0.5 block text-foreground"
              cents={remaining}
              currency={b.currency}
              size="xl"
            />
            {showBasePreview && base && (
              <div className="mt-1 text-xs text-muted-foreground">
                ≈{" "}
                <MoneyAmount
                  size="sm"
                  currency={base}
                  cents={convertCentsToBase(
                    b.remainingAmount,
                    b.currency,
                    base,
                    exchangeRates
                  )}
                />
              </div>
            )}
          </div>
          <Badge
            className="shrink-0 font-mono tabular-nums"
            variant={paid ? "neutral" : lent ? "success" : "default"}
          >
            {pct}%
          </Badge>
        </div>
        <div
          role="progressbar"
          aria-label={t("finance.borrowing.paidOffLabel")}
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={Math.min(total || 1, settled)}
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              paid ? "bg-muted-foreground" : lent ? "bg-success" : "bg-primary"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-3">
          <div className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              {t(lent ? "finance.detail.collected" : "finance.detail.paid")}
            </span>
            <MoneyAmount
              className="mt-1 block font-semibold text-foreground"
              size="md"
              currency={b.currency}
              cents={settled}
            />
          </div>
          <div className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              {t("finance.borrowing.originalTotal")}
            </span>
            <MoneyAmount
              className="mt-1 block font-semibold text-foreground"
              size="md"
              currency={b.currency}
              cents={total}
            />
          </div>
          <div className="min-w-0">
            {paid ? (
              <>
                <span className="block text-xs font-medium text-muted-foreground">
                  {t("finance.borrowing.paidOffLabel")}
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <span>{t("finance.borrowing.mobile.badgeSettled")}</span>
                </span>
                {b.dueAt && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("finance.borrowing.mobile.dueOn", {
                      date: tz.format(b.dueAt),
                    })}
                  </span>
                )}
              </>
            ) : b.dueAt ? (
              <>
                <span className="block text-xs font-medium text-muted-foreground">
                  {t("finance.borrowing.sheet.dueDateLabel")}
                </span>
                <span
                  className={`mt-1 inline-flex items-center gap-1.5 text-sm font-medium ${
                    days != null && days < 0
                      ? "text-destructive"
                      : days != null && days <= 7
                        ? "text-warning"
                        : "text-foreground"
                  }`}
                >
                  {days != null && days < 0 ? (
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  ) : (
                    <CalendarClock
                      className={`size-4 shrink-0 ${
                        days != null && days <= 7
                          ? "text-warning"
                          : "text-muted-foreground"
                      }`}
                    />
                  )}
                  <span>
                    {days === 0
                      ? t("finance.borrowing.mobile.dueToday")
                      : t(
                          (days ?? 0) < 0
                            ? "finance.borrowing.mobile.overdueBy"
                            : "finance.borrowing.mobile.dueIn",
                          {
                            days: Math.abs(days ?? 0),
                            date: tz.format(b.dueAt),
                          }
                        )}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="block text-xs font-medium text-muted-foreground">
                  {t("finance.borrowing.mobile.directionLabel")}
                </span>
                <span className="mt-1 block text-sm font-medium text-foreground">
                  {t(
                    lent
                      ? "finance.borrowing.mobile.badgeOwedToYou"
                      : "finance.borrowing.mobile.badgeYouOwe"
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </section>
      <DetailConfirm
        open={action === "delete"}
        onClose={close}
        title={t("finance.borrowing.delete.title")}
        description={t("finance.borrowing.delete.description", {
          name: b.counterparty,
        })}
        label={t("common.delete")}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id, req: { id } },
            {
              onSuccess: async () => {
                close()
                toast.add({
                  type: "success",
                  title: t("finance.borrowing.delete.deletedTitle"),
                })
                await refresh()
                navigate(`/space/${spaceId}/finance/borrowings`)
              },
              onError: (e) =>
                toast.add({
                  type: "error",
                  title: t("finance.borrowing.delete.failedTitle"),
                  description: e.message,
                }),
            }
          )
        }
      />
      {(action === "repay" || action === "disburse") && (
        <CreateBorrowingTransactionForm
          initialType={
            action === "repay"
              ? "BORROWING_TRANSACTION_TYPE_PAYMENT"
              : "BORROWING_TRANSACTION_TYPE_DISBURSEMENT"
          }
          open
          onOpenChange={close}
          onBack={close}
          borrowing={b}
          accounts={accounts.data?.accounts}
          refetchData={refresh}
        />
      )}{" "}
      {action === "adjust" && (
        <AdjustBorrowingModal
          open
          onOpenChange={close}
          borrowing={b}
          spaceId={spaceId}
          refetchBorrowings={refresh}
        />
      )}{" "}
      {action === "edit" && (
        <CreateBorrowingSheet
          open
          onOpenChange={close}
          spaceId={spaceId}
          editBorrowing={b}
          refetchBorrowings={refresh}
          baseCurrency={base || b.currency}
        />
      )}
    </DetailWorkspace>
  )
}
