import { useState } from "react"
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  type Budget,
  type Transaction,
  useListAccountsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "../use-workspace-finance"
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
import { Loader2 } from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { toCentsString, formatCents } from "../utils"
import { AccountSelect } from "./account-select"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { Checkbox } from "@/components/ui/checkbox"

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
  const { currencies } = useWorkspaceFinance()
  const fallbackCurrencies = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
    { code: "JPY" },
    { code: "DOP" },
  ]
  const currencyList =
    currencies && currencies.length > 0 ? currencies : fallbackCurrencies
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date())
  const [hasCustomEffectiveDate, setHasCustomEffectiveDate] = useState(false)

  const [budgetId, setBudgetId] = useState(preselectedBudgetId || "")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(baseCurrency || "USD")
  const [accountId, setAccountId] = useState("")
  const [hasPrefilledAccount, setHasPrefilledAccount] = useState(false)
  const [prevOpen, setPrevOpen] = useState(false)
  const [prevPreselectedBudgetId, setPrevPreselectedBudgetId] = useState<
    string | undefined
  >(undefined)
  const [prevEditTransaction, setPrevEditTransaction] = useState<
    Transaction | null | undefined
  >(undefined)

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

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
      setAccountId(editTransaction.accountId || "")
      setTransactionDate(new Date(editTransaction.transactionDate))
      const isCustomEff =
        new Date(
          editTransaction.effectiveDate || editTransaction.transactionDate
        )
          .toISOString()
          .split("T")[0] !==
        new Date(editTransaction.transactionDate).toISOString().split("T")[0]
      setHasCustomEffectiveDate(isCustomEff)
      setEffectiveDate(
        new Date(
          editTransaction.effectiveDate || editTransaction.transactionDate
        )
      )
    } else {
      const selected =
        preselectedBudgetId || (budgets.length > 0 ? budgets[0].id : "")
      setBudgetId(selected)
      setDescription("")
      setAmount("")
      setTransactionDate(new Date())
      setEffectiveDate(new Date())
      setHasCustomEffectiveDate(false)

      const b = budgets.find((x) => x.id === selected)
      if (b) {
        setCurrency(b.currency)
        const globalDefault = activeAccounts.find((a) => a.isDefault)
        setAccountId(b.defaultAccountId || globalDefault?.id || "")
        setHasPrefilledAccount(false)
      } else {
        setCurrency(baseCurrency || "USD")
        setAccountId("")
        setHasPrefilledAccount(false)
      }
    }
  } else if (!open && open !== prevOpen) {
    setPrevOpen(open)
    setHasPrefilledAccount(false)
  }

  // Prefill default account once accountsData loads (async safe)
  if (
    open &&
    !editTransaction &&
    !accountId &&
    !hasPrefilledAccount &&
    activeAccounts.length > 0
  ) {
    const b = budgets.find((x) => x.id === budgetId)
    const globalDefault = activeAccounts.find((a) => a.isDefault)
    const defaultAcc = b?.defaultAccountId || globalDefault?.id || ""
    if (defaultAcc) {
      setAccountId(defaultAcc)
      setHasPrefilledAccount(true)
    }
  }

  // Sync currency when selected budget changes
  const handleBudgetChange = (newBudgetId: string) => {
    setBudgetId(newBudgetId)
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setCurrency(b.currency)
      const globalDefault = activeAccounts.find((a) => a.isDefault)
      setAccountId(b.defaultAccountId || globalDefault?.id || "")
    }
  }

  const createExpenseMutation = useCreateExpenseMutation()
  const updateExpenseMutation = useUpdateExpenseMutation()

  const isPending =
    createExpenseMutation.isPending || updateExpenseMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!budgetId) return

    // Format dates to stable ISO-8601 without local timezone shift
    const toLocalISODate = (d: Date): string => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const date = String(d.getDate()).padStart(2, "0")
      return `${y}-${m}-${date}T12:00:00Z`
    }

    const txDateStr = toLocalISODate(transactionDate)
    const effDateStr = toLocalISODate(
      hasCustomEffectiveDate ? effectiveDate : transactionDate
    )

    if (editTransaction) {
      await updateExpenseMutation.mutateAsync({
        id: editTransaction.id,
        req: {
          id: editTransaction.id,
          expense: {
            budgetId,
            amount: toCentsString(amount),
            currency,
            description,
            transactionDate: txDateStr,
            effectiveDate: effDateStr,
            accountId: accountId || undefined,
          },
        },
      })
    } else {
      await createExpenseMutation.mutateAsync({
        expense: {
          budgetId,
          amount: toCentsString(amount),
          currency,
          description,
          transactionDate: txDateStr,
          effectiveDate: effDateStr,
          accountId: accountId || undefined,
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
              Budget
            </Label>
            <Select
              value={budgetId}
              onValueChange={(val) => val && handleBudgetChange(val)}
            >
              <SelectTrigger
                id="txBudget"
                className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Select a budget...">
                  {(() => {
                    const selected = budgets.find((b) => b.id === budgetId)
                    return selected
                      ? `${selected.name} (${selected.currency})`
                      : undefined
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {budgets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account selector */}
          <div className="space-y-2">
            <Label
              htmlFor="txAccount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Account / Payment Method (Optional)
            </Label>
            <AccountSelect
              value={accountId}
              onValueChange={setAccountId}
              accounts={activeAccounts}
              placeholder="Choose account to impact balance"
              allowNone
            />
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

          {/* Date Configurations Grouped */}
          <div className="space-y-3.5">
            {/* Transaction Date (Full Width) */}
            <div className="space-y-2">
              <Label
                htmlFor="txDate"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Transaction Date
              </Label>
              <DatePicker
                date={transactionDate}
                setDate={(newDate) => {
                  if (newDate) {
                    setTransactionDate(newDate)
                    // Keep effective date aligned unless they manually customized it
                    if (!hasCustomEffectiveDate) {
                      setEffectiveDate(newDate)
                    }
                  }
                }}
              />
            </div>

            {/* Ask user if effective date is different */}
            <div className="flex items-center gap-2.5 py-1 select-none">
              <Checkbox
                id="txCustomEffective"
                checked={hasCustomEffectiveDate}
                onCheckedChange={(checked) => {
                  setHasCustomEffectiveDate(!!checked)
                  if (!checked) {
                    setEffectiveDate(transactionDate)
                  }
                }}
              />
              <Label
                htmlFor="txCustomEffective"
                className="cursor-pointer text-xs font-semibold text-foreground/80"
              >
                Is this payment effective on a different date?
              </Label>
            </div>

            {/* Conditional Effective Date Picker */}
            {hasCustomEffectiveDate && (
              <div className="slide-in-from-top-1.5 animate-in space-y-2 duration-200">
                <Label
                  htmlFor="txEffectiveDate"
                  className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                >
                  Effective Date
                </Label>
                <DatePicker
                  date={effectiveDate}
                  setDate={(newDate) => {
                    if (newDate) {
                      setEffectiveDate(newDate)
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Amount & Currency Joined */}
          <div className="space-y-2">
            <Label
              htmlFor="txAmount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="txAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="h-full w-full flex-1 bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <div className="h-6 w-px shrink-0 bg-border/40" />

              <Select
                value={currency}
                onValueChange={(val) => setCurrency(val || "")}
              >
                <SelectTrigger
                  id="txCurrency"
                  className="!h-full w-24 shrink-0 cursor-pointer rounded-none border-0 bg-transparent px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted/10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                  {currencyList.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <CurrencyConversionPreview
            conversion={conversion}
            fromCurrency={currency}
          />

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
