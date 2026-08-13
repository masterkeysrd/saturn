import { useState, useEffect } from "react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { ArrowDownLeft, ArrowUpRight, ShieldAlert } from "lucide-react"
import {
  type Account,
  type Budget,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import { CreateExpenseForm } from "./create-expense-form"

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
  accounts,
  editTransaction,
  preselectedBudgetId,
  refetchTransactions,
  refetchBudgets,
  refetchData,
}: CreateTransactionSheetProps) {
  const [step, setStep] = useState<"SELECT" | "EXPENSE" | "INCOME">("SELECT")

  const handleRefetch = () => {
    refetchTransactions?.()
    refetchBudgets?.()
    refetchData?.()
  }

  // Determine starting step when sheet opens
  useEffect(() => {
    if (open) {
      if (editTransaction) {
        setStep("EXPENSE")
      } else if (preselectedBudgetId) {
        setStep("EXPENSE")
      } else {
        setStep("SELECT")
      }
    }
  }, [open, editTransaction, preselectedBudgetId])

  // If we are directly showing the expense form
  if (step === "EXPENSE") {
    return (
      <CreateExpenseForm
        open={open}
        onOpenChange={onOpenChange}
        spaceId={spaceId}
        baseCurrency={baseCurrency}
        budgets={budgets}
        accounts={accounts}
        editTransaction={editTransaction}
        preselectedBudgetId={preselectedBudgetId}
        refetchData={handleRefetch}
        onBack={editTransaction ? undefined : () => setStep("SELECT")}
      />
    )
  }

  // Placeholder for Income form
  if (step === "INCOME") {
    return (
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep("SELECT")}
              className="rounded-lg p-1 transition-colors hover:bg-muted-foreground/10"
            >
              <ArrowDownLeft className="h-4.5 w-4.5 rotate-135 text-muted-foreground" />
            </button>
            <span>Record Income</span>
          </div>
        }
        description="Record an inbound transaction."
        submitLabel="Save Income"
        disabled
        hideSubmitButton
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Income Form Coming Soon
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            We are polishing the manual income registration. Stay tuned!
          </p>
        </div>
      </FormDrawer>
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
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all hover:scale-[1.01] hover:border-primary/40 hover:bg-primary/5 focus:outline-none"
        >
          <div className="shrink-0 rounded-xl bg-rose-500/10 p-2.5 text-rose-500 dark:bg-rose-500/20">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Record Expense
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
          className="group hover:border-emerald/40 hover:bg-emerald/5 flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all hover:scale-[1.01] focus:outline-none"
        >
          <div className="shrink-0 rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500 dark:bg-emerald-500/20">
            <ArrowUpRight className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">Record Income</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Record an inbound salary deposit, client payment, or refund.
              Increases account balance.
            </p>
          </div>
        </button>
      </div>
    </FormDrawer>
  )
}
