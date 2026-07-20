import { useState } from "react"
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  type Budget,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Info, Globe } from "lucide-react"
import { toCentsString, formatCents } from "../utils"

interface CreateTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  budgets: Budget[]
  preselectedBudgetId?: string
  editTransaction?: Transaction | null
  refetchTransactions: () => void
  refetchBudgets: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function CreateTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets,
  preselectedBudgetId,
  editTransaction,
  refetchTransactions,
  refetchBudgets,
  getConversionPreview,
}: CreateTransactionSheetProps) {
  const [budgetId, setBudgetId] = useState(preselectedBudgetId || "")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(baseCurrency || "USD")
  const [dateStr, setDateStr] = useState(new Date().toISOString().split("T")[0])

  const [prevOpen, setPrevOpen] = useState(false)
  const [prevPreselectedBudgetId, setPrevPreselectedBudgetId] = useState<
    string | undefined
  >(undefined)
  const [prevEditTransaction, setPrevEditTransaction] = useState<
    Transaction | null | undefined
  >(undefined)

  if (
    open &&
    (open !== prevOpen ||
      preselectedBudgetId !== prevPreselectedBudgetId ||
      editTransaction !== prevEditTransaction)
  ) {
    setPrevOpen(open)
    setPrevPreselectedBudgetId(preselectedBudgetId)
    setPrevEditTransaction(editTransaction)

    if (editTransaction) {
      setBudgetId(editTransaction.budgetId)
      setDescription(editTransaction.description)
      setAmount(formatCents(editTransaction.amount).toString())
      setCurrency(editTransaction.currency)
      setDateStr(
        new Date(editTransaction.transactionDate).toISOString().split("T")[0]
      )
    } else {
      const selected =
        preselectedBudgetId || (budgets.length > 0 ? budgets[0].id : "")
      setBudgetId(selected)
      setDescription("")
      setAmount("")
      setDateStr(new Date().toISOString().split("T")[0])

      const b = budgets.find((x) => x.id === selected)
      if (b) {
        setCurrency(b.currency)
      } else {
        setCurrency(baseCurrency || "USD")
      }
    }
  } else if (!open && open !== prevOpen) {
    setPrevOpen(open)
  }

  // Sync currency when selected budget changes
  const handleBudgetChange = (newBudgetId: string) => {
    setBudgetId(newBudgetId)
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setCurrency(b.currency)
    }
  }

  const createExpenseMutation = useCreateExpenseMutation()
  const updateExpenseMutation = useUpdateExpenseMutation()

  const isPending =
    createExpenseMutation.isPending || updateExpenseMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!budgetId) return

    // Convert date string to ISO timestamp
    const dateObj = new Date(dateStr + "T12:00:00Z")

    if (editTransaction) {
      await updateExpenseMutation.mutateAsync({
        space_id: spaceId,
        id: editTransaction.id,
        req: {
          spaceId,
          id: editTransaction.id,
          expense: {
            budgetId,
            amount: toCentsString(amount),
            currency,
            description,
            transactionDate: dateObj.toISOString(),
          },
        },
      })
    } else {
      await createExpenseMutation.mutateAsync({
        space_id: spaceId,
        req: {
          spaceId,
          expense: {
            budgetId,
            amount: toCentsString(amount),
            currency,
            description,
            transactionDate: dateObj.toISOString(),
          },
        },
      })
    }

    onOpenChange(false)
    refetchTransactions()
    refetchBudgets()
  }

  const conversion = getConversionPreview(amount, currency)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editTransaction ? "Edit Expense" : "Record Expense"}
          </SheetTitle>
          <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {editTransaction
              ? "Modify logged expense details. Saturn will recompute currency base aggregates automatically."
              : "Record a new expense. The amount will be deducted from the active period of the selected budget template."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* Budget Dropdown */}
          <div className="space-y-2">
            <Label
              htmlFor="txBudget"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Budget Template
            </Label>
            <select
              id="txBudget"
              value={budgetId}
              onChange={(e) => handleBudgetChange(e.target.value)}
              className="flex h-12 w-full rounded-xl border border-border/60 bg-background/50 px-4 py-2 text-sm shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value="" disabled>
                Select a budget...
              </option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label
              htmlFor="txDescription"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Description
            </Label>
            <Input
              id="txDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Amazon Web Services, Restaurant Dinner"
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label
              htmlFor="txDate"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Transaction Date
            </Label>
            <Input
              id="txDate"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          {/* Amount & Currency */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label
                htmlFor="txAmount"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Amount
              </Label>
              <Input
                id="txAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="h-12 rounded-xl border-border/60 bg-background/50"
              />
            </div>

            <div className="w-28 space-y-2">
              <Label
                htmlFor="txCurrency"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Currency
              </Label>
              <select
                id="txCurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-12 w-full rounded-xl border border-border/60 bg-background/50 px-4 py-2 text-sm shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="JPY">JPY</option>
                <option value="DOP">DOP</option>
              </select>
            </div>
          </div>

          {/* Currency conversion card */}
          {conversion && "amount" in conversion && (
            <div className="flex animate-in items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4 duration-300 fade-in">
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <span className="block text-[11px] font-bold text-primary uppercase">
                  Reporting Currency Conversion
                </span>
                <span className="mt-0.5 block text-sm font-extrabold text-foreground">
                  {conversion.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {conversion.currency}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                  Exchange rate: 1 {currency} = {conversion.rate.toFixed(4)}{" "}
                  {conversion.currency}
                </span>
              </div>
            </div>
          )}

          {/* Missing rate error */}
          {conversion && "error" in conversion && (
            <div className="flex animate-in items-start gap-3 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4 duration-300 fade-in">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <span className="block text-[11px] font-bold text-amber-500 uppercase">
                  Exchange Rate Required
                </span>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {conversion.error} Go to the{" "}
                  <span className="font-semibold text-foreground">
                    Exchange Rates
                  </span>{" "}
                  tab to configure this daily conversion rate before saving.
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={
              isPending || !budgetId || !!(conversion && "error" in conversion)
            }
            className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editTransaction ? "Update Expense" : "Save Expense"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
