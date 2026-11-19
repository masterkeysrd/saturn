import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { invalidateFinanceQueries } from "@saturn/hooks"
import { FormDialogShell, FormDrawer } from "@/components/ui/form-drawer"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  HandCoins,
  ArrowRightLeft,
} from "lucide-react"
import {
  type Account,
  type Budget,
  type Transaction,
  type ScheduledTransaction,
  type RecurringTransaction,
  type Borrowing,
  useListAccountsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { CreateExpenseForm } from "./create-expense-form"
import { CreateIncomeForm } from "./create-income-form"
import { ConfirmScheduledForm } from "./confirm-scheduled-form"
import { ScheduledTransactionSelector } from "./scheduled-transaction-selector"
import { BorrowingSelector } from "./borrowing-selector"
import { CreateBorrowingTransactionForm } from "./create-borrowing-transaction-form"
import { CreateTransferForm } from "./create-transfer-form"

interface CreateTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  budgets?: Budget[]
  accounts?: Account[]
  editTransaction?: Transaction | null
  preselectedBudgetId?: string
  refetchTransactions?: () => void
  refetchBudgets?: () => void
  refetchData?: () => void
}

const EMPTY_BUDGETS: Budget[] = []
const EMPTY_ACCOUNTS: Account[] = []

export function CreateTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = EMPTY_BUDGETS,
  accounts = EMPTY_ACCOUNTS,
  editTransaction,
  preselectedBudgetId,
  refetchTransactions,
  refetchBudgets,
  refetchData,
}: CreateTransactionSheetProps) {
  const queryClient = useQueryClient()
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevEditTransaction, setPrevEditTransaction] =
    useState(editTransaction)
  const [prevPreselectedBudgetId, setPrevPreselectedBudgetId] =
    useState(preselectedBudgetId)

  const [step, setStep] = useState<
    | "SELECT"
    | "EXPENSE"
    | "INCOME"
    | "SCHEDULE_SELECT"
    | "CONFIRM_SCHEDULE"
    | "BORROWING_SELECT"
    | "RECORD_BORROWING"
    | "TRANSFER"
  >(() => {
    if (editTransaction) {
      return editTransaction.type === "INCOME" ? "INCOME" : "EXPENSE"
    }
    if (preselectedBudgetId) {
      return "EXPENSE"
    }
    return "SELECT"
  })

  const [selectedScheduled, setSelectedScheduled] =
    useState<ScheduledTransaction | null>(null)
  const [cachedTemplates, setCachedTemplates] = useState<
    RecurringTransaction[]
  >([])
  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(
    null
  )

  // Adjust state during render when sheet open state or target transaction changes
  if (
    open !== prevOpen ||
    editTransaction !== prevEditTransaction ||
    preselectedBudgetId !== prevPreselectedBudgetId
  ) {
    setPrevOpen(open)
    setPrevEditTransaction(editTransaction)
    setPrevPreselectedBudgetId(preselectedBudgetId)
    if (open) {
      setSelectedScheduled(null)
      setCachedTemplates([])
      setSelectedBorrowing(null)
      if (editTransaction) {
        setStep(editTransaction.type === "INCOME" ? "INCOME" : "EXPENSE")
      } else if (preselectedBudgetId) {
        setStep("EXPENSE")
      } else {
        setStep("SELECT")
      }
    }
  }

  // Fetch accounts locally if not passed down by parent view
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const resolvedAccounts = useMemo(
    () =>
      accounts.length > 0
        ? accounts
        : (accountsData?.accounts ?? EMPTY_ACCOUNTS),
    [accounts, accountsData?.accounts]
  )

  const handleRefetch = () => {
    void invalidateFinanceQueries(queryClient)
    refetchTransactions?.()
    refetchBudgets?.()
    refetchData?.()
  }

  const renderStepContent = () => {
    if (step === "EXPENSE") {
      return (
        <CreateExpenseForm
          open={open}
          onOpenChange={onOpenChange}
          spaceId={spaceId}
          baseCurrency={baseCurrency}
          budgets={budgets}
          accounts={resolvedAccounts}
          editTransaction={editTransaction}
          preselectedBudgetId={preselectedBudgetId}
          refetchData={handleRefetch}
          onBack={editTransaction ? undefined : () => setStep("SELECT")}
        />
      )
    }

    if (step === "INCOME") {
      return (
        <CreateIncomeForm
          open={open}
          onOpenChange={onOpenChange}
          spaceId={spaceId}
          baseCurrency={baseCurrency}
          accounts={resolvedAccounts}
          editTransaction={editTransaction}
          refetchData={handleRefetch}
          onBack={editTransaction ? undefined : () => setStep("SELECT")}
        />
      )
    }

    if (step === "CONFIRM_SCHEDULE" && selectedScheduled) {
      return (
        <ConfirmScheduledForm
          open={open}
          onOpenChange={onOpenChange}
          scheduledTransaction={selectedScheduled}
          accounts={resolvedAccounts}
          budgets={budgets}
          recurringTemplates={cachedTemplates}
          refetchData={handleRefetch}
          onBack={() => setStep("SCHEDULE_SELECT")}
        />
      )
    }

    if (step === "SCHEDULE_SELECT") {
      return (
        <ScheduledTransactionSelector
          open={open}
          onOpenChange={onOpenChange}
          spaceId={spaceId}
          budgets={budgets}
          onSelect={(st, templates) => {
            setSelectedScheduled(st)
            setCachedTemplates(templates)
            setStep("CONFIRM_SCHEDULE")
          }}
          onBack={() => setStep("SELECT")}
        />
      )
    }

    if (step === "BORROWING_SELECT") {
      return (
        <BorrowingSelector
          open={open}
          onOpenChange={onOpenChange}
          spaceId={spaceId}
          onSelect={(b) => {
            setSelectedBorrowing(b)
            setStep("RECORD_BORROWING")
          }}
          onBack={() => setStep("SELECT")}
        />
      )
    }

    if (step === "RECORD_BORROWING" && selectedBorrowing) {
      return (
        <CreateBorrowingTransactionForm
          open={open}
          onOpenChange={onOpenChange}
          borrowing={selectedBorrowing}
          accounts={resolvedAccounts}
          refetchData={handleRefetch}
          onBack={() => setStep("BORROWING_SELECT")}
        />
      )
    }

    if (step === "TRANSFER") {
      return (
        <CreateTransferForm
          open={open}
          onOpenChange={onOpenChange}
          accounts={resolvedAccounts}
          refetchData={handleRefetch}
          onBack={() => setStep("SELECT")}
        />
      )
    }

    return (
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Record Transaction"
        description="Choose the type of transaction you want to record in your ledger."
        submitLabel="Select an option above"
        disabled
        hideSubmitButton
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setStep("EXPENSE")}
            className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border/70 bg-control px-3.5 py-3 text-left transition-colors outline-none hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 dark:bg-rose-500/20">
              <ArrowDownLeft className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                Standalone Expense
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                Outbound payment, fee, or purchase deducted from a budget.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setStep("INCOME")}
            className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border/70 bg-control px-3.5 py-3 text-left transition-colors outline-none hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
              <ArrowUpRight className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                Standalone Income
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                Inbound salary deposit, client payment, or refund.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setStep("SCHEDULE_SELECT")}
            className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border/70 bg-control px-3.5 py-3 text-left transition-colors outline-none hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <CalendarClock className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                Confirm Scheduled Bill / Income
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                Clear a pending recurring subscription, rent, or salary item.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setStep("BORROWING_SELECT")}
            className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border/70 bg-control px-3.5 py-3 text-left transition-colors outline-none hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
              <HandCoins className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                Personal Borrowing / Lending Payment
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                Log a repayment or drawdown on an active debt or loan.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setStep("TRANSFER")}
            className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border/70 bg-control px-3.5 py-3 text-left transition-colors outline-none hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 dark:bg-sky-500/20">
              <ArrowRightLeft className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                Perform Account Transfer
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                Move funds between two accounts with double-entry ledger sync.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        </div>
      </FormDrawer>
    )
  }

  return (
    <FormDialogShell open={open} onOpenChange={onOpenChange}>
      {renderStepContent()}
    </FormDialogShell>
  )
}
