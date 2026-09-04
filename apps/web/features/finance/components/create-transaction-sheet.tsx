import { useState } from "react"
import { FormDrawer } from "@/components/ui/form-drawer"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
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
} from "@/gen/saturn/finance/v1/finance"
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

export function CreateTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = [],
  accounts = [],
  editTransaction,
  preselectedBudgetId,
  refetchTransactions,
  refetchBudgets,
  refetchData,
}: CreateTransactionSheetProps) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevEditTransaction, setPrevEditTransaction] = useState(editTransaction)
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
  const resolvedAccounts =
    accounts.length > 0 ? accounts : accountsData?.accounts || []

  const handleRefetch = () => {
    refetchTransactions?.()
    refetchBudgets?.()
    refetchData?.()
  }

  // If we are directly showing the expense form
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

  // Render Income form
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

  // Render Confirm Scheduled form
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

  // Selection of scheduled transaction view
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

  // Selection of borrowing agreement view
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

  // Render Record Borrowing form
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

  // Render Transfer form
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

  // Selection view
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
      <div className="mt-2 flex flex-col gap-4">
        {/* Card 1: Outflow / Expense */}
        <button
          type="button"
          onClick={() => setStep("EXPENSE")}
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all outline-none hover:scale-[1.01] hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="shrink-0 rounded-xl bg-rose-500/10 p-2.5 text-rose-500 dark:bg-rose-500/20">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Standalone Expense
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Record an outbound payment, fee, or purchase. Deducted from a
              budget category.
            </p>
          </div>
        </button>

        {/* Card 2: Inflow / Income */}
        <button
          type="button"
          onClick={() => setStep("INCOME")}
          className="group hover:border-emerald/40 hover:bg-emerald/5 flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all outline-none hover:scale-[1.01] focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="shrink-0 rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500 dark:bg-emerald-500/20">
            <ArrowUpRight className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Standalone Income
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Record an inbound salary deposit, client payment, or refund.
              Increases account balance.
            </p>
          </div>
        </button>

        {/* Card 3: Confirm Scheduled Transaction */}
        <button
          type="button"
          onClick={() => setStep("SCHEDULE_SELECT")}
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all outline-none hover:scale-[1.01] hover:border-indigo-500/40 hover:bg-indigo-500/5 focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="shrink-0 rounded-xl bg-indigo-500/10 p-2.5 text-indigo-500 dark:bg-indigo-500/20">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Confirm Scheduled Bill/Income
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Reconcile and clear a pending scheduled calendar item (e.g. SaaS
              subscription, rent, salary template).
            </p>
          </div>
        </button>

        {/* Card 4: Record Borrowing/Lending Transaction */}
        <button
          type="button"
          onClick={() => setStep("BORROWING_SELECT")}
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all outline-none hover:scale-[1.01] hover:border-amber-500/40 hover:bg-amber-500/5 focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="shrink-0 rounded-xl bg-amber-500/10 p-2.5 text-amber-500 dark:bg-amber-500/20">
            <HandCoins className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Personal Borrowing / Lending Payment
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Record a repayment or drawdown disbursement linked to an active
              borrowing or lending agreement.
            </p>
          </div>
        </button>

        {/* Card 5: Record Account-to-Account Transfer */}
        <button
          type="button"
          onClick={() => setStep("TRANSFER")}
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all outline-none hover:scale-[1.01] hover:border-sky-500/40 hover:bg-sky-500/5 focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="shrink-0 rounded-xl bg-sky-500/10 p-2.5 text-sky-500 dark:bg-sky-500/20">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Perform Account Transfer
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Transfer funds between two bank accounts. Duly records both side
              entries.
            </p>
          </div>
        </button>
      </div>
    </FormDrawer>
  )
}
