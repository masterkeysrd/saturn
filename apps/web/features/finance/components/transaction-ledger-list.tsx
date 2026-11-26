import { useMemo, createElement, type ReactNode } from "react"
import {
  ArrowRightLeft,
  ArrowUpRight,
  Coins,
  Scale,
  Repeat,
} from "lucide-react"
import type {
  Transaction,
  Account,
  Budget,
  ExchangeRate,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useTimezone, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  signedTransactionAmount,
  buildCopilotEntityKey,
  convertCentsToBase,
  getTimezoneParts,
} from "@saturn/core"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { MoneyAmount } from "@/components/ui/money-amount"
import { cn } from "@/lib/utils"
import { getBudgetColors, getBudgetIcon } from "../utils"
function toYmdInTimezone(
  date: Date | string | number | null | undefined,
  timeZone: string
): string {
  const parts = getTimezoneParts(date, timeZone)
  if (!parts) return ""
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}
function baseAmount(txn: Transaction, currency: string, rates: ExchangeRate[]) {
  return signedTransactionAmount(
    txn,
    txn.amountInBase !== undefined && txn.amountInBase !== ""
      ? Number(txn.amountInBase)
      : convertCentsToBase(txn.amount, txn.currency, currency, rates)
  )
}
export function TransactionLedgerList({
  transactions,
  accounts,
  budgets,
  exchangeRates,
  baseCurrency,
  showAccount = true,
  showBudget = true,
  selectedId,
  onInspect,
  renderRowActions,
}: {
  transactions: Transaction[]
  accounts: Account[]
  budgets: Budget[]
  exchangeRates: ExchangeRate[]
  baseCurrency: string
  showAccount?: boolean
  showBudget?: boolean
  selectedId?: string
  onInspect: (txn: Transaction) => void
  renderRowActions?: (txn: Transaction) => ReactNode
}) {
  const tz = useTimezone(),
    { t, language } = useI18n()
  const getBudgetDetails = (id: string) => {
    const b = budgets.find((x) => x.id === id)
    return b
      ? {
          name: b.name,
          icon: b.icon || "piggy-bank",
          color: b.color || "indigo",
        }
      : {
          name: t("finance.transactions.general"),
          icon: "coins",
          color: "indigo",
        }
  }
  const dateGroups = useMemo(() => {
    const groups: {
      key: string
      title: string
      items: Transaction[]
      dailyNetBaseCents: number
    }[] = []
    const groupMap = new Map<string, (typeof groups)[number]>()

    for (const txn of transactions) {
      const rawDate = txn.transactionDate || txn.effectiveDate
      const ymd = rawDate ? toYmdInTimezone(rawDate, tz.timezone) : "unknown"
      const key = ymd || "unknown"

      let group = groupMap.get(key)
      if (!group) {
        let title = t("finance.transactions.undated")
        if (rawDate && key !== "unknown") {
          if (tz.isToday(rawDate)) {
            title = t("common.today")
          } else if (tz.isYesterday(rawDate)) {
            title = t("common.yesterday")
          } else {
            title = tz.format(rawDate, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          }
        }
        group = { key, title, items: [], dailyNetBaseCents: 0 }
        groupMap.set(key, group)
        groups.push(group)
      }

      group.items.push(txn)

      group.dailyNetBaseCents += baseAmount(txn, baseCurrency, exchangeRates)
    }

    return groups
  }, [transactions, tz, baseCurrency, exchangeRates, t])
  return (
    <div className="space-y-5">
      {dateGroups.map((group) => (
        <section key={group.key} aria-label={group.title} className="space-y-2">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/95 px-1 py-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground">
                {group.title}
              </h3>
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                {group.items.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("finance.transactions.net")}</span>
              <MoneyAmount
                cents={group.dailyNetBaseCents}
                currency={baseCurrency}
                showSign
                colored
                size="sm"
              />
            </div>
          </div>
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
            {group.items.map((txn) => {
              const signedLocalCents = signedTransactionAmount(txn)
              const signedBaseCents = baseAmount(
                txn,
                baseCurrency,
                exchangeRates
              )
              const role = txn.metadata?.borrowing_role

              const isCrossCurrency = txn.currency !== baseCurrency
              const details = getBudgetDetails(txn.budgetId)
              const colors = getBudgetColors(details.color)
              const iconComp = getBudgetIcon(details.icon)
              const accountName =
                txn.account?.name ||
                accounts.find((a) => a.id === txn.accountId)?.name
              const isSelected = selectedId === txn.id

              return (
                <div
                  key={txn.id}
                  role="button"
                  aria-pressed={isSelected}
                  tabIndex={0}
                  onClick={() => onInspect(txn)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault()
                      onInspect(txn)
                    }
                  }}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
                    isSelected &&
                      "bg-primary/5 ring-1 ring-primary/30 ring-inset"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                        txn.type === "INCOME"
                          ? "border-success/20 bg-success/10 text-success"
                          : txn.type === "TRANSFER_IN" ||
                              txn.type === "TRANSFER_OUT"
                            ? "border-info/20 bg-info/10 text-info"
                            : `${colors.bg} ${colors.text} ${colors.border}`
                      )}
                    >
                      {txn.type === "INCOME" ? (
                        <ArrowUpRight className="size-4" />
                      ) : txn.type === "TRANSFER_IN" ||
                        txn.type === "TRANSFER_OUT" ? (
                        <ArrowRightLeft className="size-4" />
                      ) : (
                        createElement(
                          txn.type === "BALANCE_ADJUSTMENT" ? Scale : iconComp,
                          {
                            className: "size-4",
                          }
                        )
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {txn.description || (
                            <span className="text-muted-foreground italic">
                              {t("finance.transactions.noDescription")}
                            </span>
                          )}
                        </span>

                        {Boolean(txn.metadata?.recurring_transaction_id) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Repeat className="size-3 text-primary" />
                            {t("finance.transactions.recurring")}
                          </span>
                        )}

                        {Boolean(txn.metadata?.transfer_id) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <ArrowRightLeft className="size-3 text-info" />
                            {t("finance.transactions.transfer")}
                          </span>
                        )}

                        {Boolean(role || txn.metadata?.borrowing_id) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Coins className="size-3 text-warning" />
                            {role === "REPAYMENT" ||
                            role === "ADJUSTMENT" ||
                            role === "DISBURSEMENT" ||
                            role === "INITIAL_FUNDING"
                              ? getLocalizedEnumLabel(
                                  "finance",
                                  "borrowingRole",
                                  role,
                                  language
                                )
                              : txn.type === "EXPENSE"
                                ? t("finance.transactions.lend")
                                : t("finance.transactions.borrow")}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {showAccount && accountName && (
                          <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                            {accountName}
                          </span>
                        )}
                        {showBudget && txn.budgetId && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                              colors.bg,
                              colors.text
                            )}
                          >
                            {details.name}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {getLocalizedEnumLabel(
                            "finance",
                            "transactionType",
                            txn.type,
                            language
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {txn.id && (
                      <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <CopilotAttachButton
                          item={{
                            key: buildCopilotEntityKey("transaction", txn.id),
                            kind: "transaction",
                            id: txn.id,
                            label:
                              txn.description ||
                              t("finance.transactions.transaction"),
                            summary: {
                              amount: Number(txn.amount || 0),
                              currency: txn.currency,
                              type: txn.type,
                              transactionDate: txn.transactionDate,
                            },
                          }}
                        />
                      </div>
                    )}

                    <div className="min-w-0 text-right">
                      <MoneyAmount
                        cents={signedLocalCents}
                        currency={txn.currency}
                        showSign
                        colored={txn.type === "INCOME"}
                        size="md"
                        className="block font-medium"
                      />
                      {isCrossCurrency && (
                        <MoneyAmount
                          cents={signedBaseCents}
                          currency={baseCurrency}
                          showSign
                          size="sm"
                          className="block text-[11px] text-muted-foreground"
                        />
                      )}
                    </div>

                    {renderRowActions?.(txn)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
