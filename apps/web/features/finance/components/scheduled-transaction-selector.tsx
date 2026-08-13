import { useState, useMemo } from "react"
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, Search } from "lucide-react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  type ScheduledTransaction,
  type RecurringTransaction,
  type Budget,
  useListScheduledTransactionsQuery,
  useListRecurringTransactionsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { formatCents } from "../utils"

interface ScheduledTransactionSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  budgets?: Budget[]
  onSelect: (st: ScheduledTransaction, recurringTemplates: RecurringTransaction[]) => void
  onBack: () => void
}

export function ScheduledTransactionSelector({
  open,
  onOpenChange,
  spaceId,
  budgets = [],
  onSelect,
  onBack,
}: ScheduledTransactionSelectorProps) {
  const [searchText, setSearchText] = useState("")

  // Fetch pending scheduled transactions
  const { data: scheduledData } = useListScheduledTransactionsQuery(
    {
      status: "PENDING",
      pageSize: 100,
      pageToken: "",
      startDate: "",
      endDate: "",
    },
    { enabled: open && !!spaceId }
  )

  const pendingScheduled = useMemo(() => {
    return scheduledData?.scheduledTransactions || []
  }, [scheduledData])

  // Fetch recurring templates to resolve names
  const { data: recurringData } = useListRecurringTransactionsQuery(
    { status: "STATUS_UNSPECIFIED", pageSize: 100, pageToken: "" },
    { enabled: open && !!spaceId }
  )

  const recurringTemplates = useMemo(() => {
    return recurringData?.recurringTransactions || []
  }, [recurringData])

  const getDisplayName = (st: ScheduledTransaction) => {
    if (st.sourceType === "RECURRENT_TRANSACTION") {
      const matchedTemplate = recurringTemplates.find((e) => e.id === st.sourceId)
      return matchedTemplate?.name || st.recurringTransaction?.name || "Scheduled Obligation"
    }
    if (st.sourceType === "SOURCE_TYPE_UNSPECIFIED" || !st.sourceType) {
      if (st.metadata?.vendorName) {
        return st.metadata.vendorName
      }
      if (st.metadata?.description) {
        return st.metadata.description
      }
    }
    return st.type === "INCOME" ? "Scheduled Inflow" : "Scheduled Outflow"
  }

  const filteredScheduled = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    if (!q) return pendingScheduled
    return pendingScheduled.filter((st) => {
      const name = getDisplayName(st).toLowerCase()
      const budgetName = budgets.find((b) => b.id === st.budgetId)?.name?.toLowerCase() || ""
      const amountStr = (Number(st.amount || 0) / 100).toFixed(2)
      return name.includes(q) || budgetName.includes(q) || amountStr.includes(q)
    })
  }, [pendingScheduled, searchText, budgets, recurringTemplates])

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm Scheduled Bill/Income"
      description="Select a pending scheduled transaction to confirm and record to the ledger."
      submitLabel="Select a transaction above"
      disabled
      hideSubmitButton
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="-ml-2 h-8 self-start rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted/10 hover:text-foreground"
        >
          ← Back to types
        </Button>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search scheduled items..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-10 rounded-xl border-border/60 bg-background/40 pl-9 pr-4 text-xs focus-visible:ring-primary"
          />
        </div>

        {/* List items */}
        <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2">
          {filteredScheduled.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground/20" />
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                No pending scheduled items found.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 max-w-xs mx-auto">
                Create recurring templates or schedule upcoming SaaS subscriptions in the Calendar tab.
              </p>
            </div>
          ) : (
            filteredScheduled.map((st) => {
              const name = getDisplayName(st)
              const budgetName = budgets.find((b) => b.id === st.budgetId)?.name || ""
              const isExpense = st.type === "EXPENSE"
              const dateStr = st.dueDate
                ? new Date(st.dueDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "N/A"

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onSelect(st, recurringTemplates)}
                  className="group flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/40 p-4.5 text-left transition-all hover:scale-[1.005] hover:border-primary/40 hover:bg-primary/5 focus:outline-none"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`shrink-0 rounded-lg p-2 ${
                        isExpense
                          ? "bg-rose-500/10 text-rose-500 dark:bg-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
                      }`}
                    >
                      {isExpense ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-bold text-foreground">
                        {name}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>Due {dateStr}</span>
                        {isExpense && budgetName && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[100px]">{budgetName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black text-foreground">
                      {formatCents(st.amount).toFixed(2)}{" "}
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">
                        {st.currency}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </FormDrawer>
  )
}
