import { DocumentPage } from "@/components/ui/page-shells"
import { useState, type ElementType, type ReactNode } from "react"
import { useDetailLedger } from "@saturn/hooks/finance"
import { useDebounce, useI18n, useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import {
  buildCopilotEntityKey,
  resolveFinancePeriodBounds,
  type FinancePeriodValue,
} from "@saturn/core"
import type {
  Transaction,
  Transaction_Type,
  ListTransactionsRequest,
  Account,
  Budget,
  ExchangeRate,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FinancePeriodPicker } from "./finance-period-picker"
import { TransactionFilterToolbar } from "./transaction-filter-toolbar"
import { TransactionLedgerList } from "./transaction-ledger-list"
import { TransactionEventsSheet } from "./transaction-events-sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ReceiptText, ChartLine, Loader2 } from "lucide-react"
import { DetailError } from "./detail-ui"
import { useSpacePermissions } from "@/features/space/use-space"
const allTime: FinancePeriodValue = {
  period: "all",
  month: "",
  dateFrom: "",
  dateTo: "",
}
const allFilters = {
  type: "TYPE_UNSPECIFIED",
  accountId: "_all",
  budgetId: "_all",
}
export function DetailWorkspace({
  title,
  id,
  kind,
  children,
  analytics,
  accounts = [],
  budgets = [],
  exchangeRates = [],
  request,
  baseCurrency,
  leading,
  badge,
  description,
  actions,
  icon,
  maxWidth = "xl",
}: {
  title: string
  id: string
  kind: "account" | "borrowing" | "budget"
  analytics?: ReactNode
  accounts?: Account[]
  budgets?: Budget[]
  exchangeRates?: ExchangeRate[]
  children: ReactNode
  request: ListTransactionsRequest
  description?: ReactNode
  actions?: ReactNode
  icon?: ElementType
  maxWidth?: "lg" | "xl" | "full"
  leading?: ReactNode
  badge?: ReactNode
  baseCurrency?: string
}) {
  const { spaceId } = useSpacePermissions(),
    { t } = useI18n(),
    tz = useTimezone(),
    [search, setSearch] = useState(""),
    debouncedSearch = useDebounce(search, 300),
    [filters, setFilters] = useState(allFilters),
    [period, setPeriod] = useState(allTime),
    [selected, select] = useState<Transaction | null>(null),
    [prevStartDate, setPrevStartDate] = useState(request.startDate)
  if (prevStartDate !== request.startDate) {
    setPrevStartDate(request.startDate)
    if (selected) select(null)
  }
  useRegisterCopilotView({
    viewId: `finance.${kind}.detail`,
    title,
    activeEntity: {
      kind,
      id,
      key: buildCopilotEntityKey(kind, id),
      label: title,
    },
    suggestions:
      kind === "borrowing"
        ? [
            t("ai.copilotSheet.suggestBorrowing"),
            t("finance.borrowing.suggestion.paymentHistory"),
            t("finance.borrowing.suggestion.payoffPlan"),
          ]
        : kind === "budget"
          ? [
              t("ai.copilotSheet.suggestBudget"),
              t("finance.budgets.suggestion.pacingAhead"),
              t("finance.budgets.suggestion.adjustments"),
            ]
          : [
              t("ai.copilotSheet.suggestAccount"),
              t("ai.copilotSheet.suggestTransactions"),
            ],
  })
  const bounds = resolveFinancePeriodBounds(
    period,
    tz.now(),
    tz.timezone,
    tz.locale
  )
  const ledger = useDetailLedger(
    spaceId,
    {
      ...request,
      searchQuery: debouncedSearch,
      types:
        filters.type !== "TYPE_UNSPECIFIED"
          ? [filters.type as Transaction_Type]
          : request.types,
      accountId:
        filters.accountId !== "_all" ? filters.accountId : request.accountId,
      budgetId:
        filters.budgetId !== "_all" ? filters.budgetId : request.budgetId,
      startDate: bounds.startISO || request.startDate,
      endDate: bounds.endISO || request.endDate,
    },
    !!id && (kind !== "budget" || !!request.startDate)
  )
  const rows =
    ledger.data?.pages.flatMap((page) => page.transactions || []) || []
  const count = (
    <Badge variant="neutral">
      {rows.length}
      {ledger.hasNextPage ? "+" : ""}
    </Badge>
  )
  const ledgerPanel = (
    <section className="space-y-3">
      <TransactionFilterToolbar
        filters={filters}
        onChange={(patch) =>
          setFilters((current) => ({ ...current, ...patch }))
        }
        searchQuery={search}
        setSearchQuery={setSearch}
        accounts={accounts}
        budgets={budgets}
        facets
        typeFacet={kind === "account"}
        accountFacet={kind === "budget" || kind === "borrowing"}
        budgetFacet={kind === "account"}
      >
        {kind !== "budget" && (
          <FinancePeriodPicker value={period} onChange={setPeriod} />
        )}
      </TransactionFilterToolbar>
      {ledger.isLoading && (
        <div
          role="status"
          className="space-y-3 rounded-xl border border-border bg-card p-4"
        >
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      )}
      {ledger.isSuccess && !rows.length && (
        <Empty className="rounded-xl bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>
              {t("finance.accounts.history.noTransactions")}
            </EmptyTitle>
            <EmptyDescription>
              {t(
                kind === "account"
                  ? "finance.accounts.mobile.ledgerEmptyDesc"
                  : kind === "borrowing"
                    ? "finance.borrowing.mobile.emptyRepaymentsDesc"
                    : "finance.budgets.mobile.emptyNoExpensesDesc"
              )}
            </EmptyDescription>
          </EmptyHeader>
          {(search ||
            filters.type !== allFilters.type ||
            filters.accountId !== allFilters.accountId ||
            filters.budgetId !== allFilters.budgetId ||
            period.period !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setFilters(allFilters)
                setPeriod(allTime)
              }}
            >
              {t("finance.transactions.resetFilters")}
            </Button>
          )}
        </Empty>
      )}
      {ledger.isError && <DetailError>{t("finance.detail.error")}</DetailError>}
      <TransactionLedgerList
        transactions={rows}
        accounts={accounts}
        budgets={budgets}
        exchangeRates={exchangeRates}
        baseCurrency={baseCurrency || "USD"}
        showAccount={kind !== "account"}
        showBudget={kind !== "budget"}
        selectedId={selected?.id}
        onInspect={select}
      />
      {ledger.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="mx-auto flex"
          disabled={ledger.isFetchingNextPage}
          onClick={() => ledger.fetchNextPage()}
        >
          {ledger.isFetchingNextPage && (
            <Loader2 className="size-4 animate-spin" />
          )}
          {t("finance.detail.more")}
        </Button>
      )}
    </section>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-start">
      <div className="@container min-w-0 flex-1">
        <DocumentPage
          title={title}
          leading={leading}
          badge={badge}
          maxWidth={maxWidth}
          description={description}
          actions={actions}
          icon={icon}
          className="min-w-0 [&>div:first-child]:flex-wrap"
        >
          {children}
          {analytics ? (
            <Tabs
              defaultValue="transactions"
              className="gap-4"
              onValueChange={() => select(null)}
            >
              <TabsList variant="line" aria-label={title}>
                <TabsTrigger value="transactions">
                  <ReceiptText className="size-4" />
                  {t("nav.transactions")}
                  {count}
                </TabsTrigger>
                <TabsTrigger value="analytics">
                  <ChartLine className="size-4" />
                  {t("finance.detail.analytics")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="transactions">{ledgerPanel}</TabsContent>
              <TabsContent value="analytics">{analytics}</TabsContent>
            </Tabs>
          ) : (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                {t("nav.transactions")}
                {count}
              </h2>
              {ledgerPanel}
            </section>
          )}
        </DocumentPage>
      </div>
      {selected && (
        <TransactionEventsSheet
          open
          transaction={selected}
          baseCurrency={baseCurrency}
          onOpenChange={(open) => {
            if (!open) select(null)
          }}
        />
      )}
    </div>
  )
}
