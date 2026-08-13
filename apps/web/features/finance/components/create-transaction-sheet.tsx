import { useState, useEffect } from "react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import {
  type Account,
  type Budget,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import { CreateExpenseForm } from "./create-expense-form"
import { CreateIncomeForm } from "./create-income-form"

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
        if (editTransaction.type === "INCOME") {
          setStep("INCOME")
        } else {
          setStep("EXPENSE")
        }
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

  // Render Income form
  if (step === "INCOME") {
    return (
      <CreateIncomeForm
        open={open}
        onOpenChange={onOpenChange}
        spaceId={spaceId}
        baseCurrency={baseCurrency}
        accounts={accounts}
        editTransaction={editTransaction}
        refetchData={handleRefetch}
        onBack={editTransaction ? undefined : () => setStep("SELECT")}
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
          className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all hover:scale-[1.01] hover:border-primary/40 hover:bg-primary/5 focus:outline-none"
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
          className="group hover:border-emerald/40 hover:bg-emerald/5 flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-background/40 p-5 text-left transition-all hover:scale-[1.01] focus:outline-none"
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
      </div>
    </FormDrawer>
  )
}
