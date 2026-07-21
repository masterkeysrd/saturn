import { useState } from "react"
import {
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  type RecurringExpense,
  type Budget,
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
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2 } from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { toCentsString, formatCents } from "../utils"

interface CreateRecurringExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: Budget[]
  baseCurrency: string
  editExpense?: RecurringExpense | null
  refetchExpenses: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function CreateRecurringExpenseSheet({
  open,
  onOpenChange,
  budgets,
  baseCurrency,
  editExpense,
  refetchExpenses,
  getConversionPreview,
}: CreateRecurringExpenseSheetProps) {
  const [budgetId, setBudgetId] = useState("")
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(baseCurrency || "USD")
  const [interval, setInterval] = useState("monthly")
  const [nextDueDate, setNextDueDate] = useState<Date>(new Date())
  const [isVariable, setIsVariable] = useState(false)
  const [status, setStatus] = useState("active")
  const [gracePeriodDays, setGracePeriodDays] = useState(0)

  const createMutation = useCreateRecurringExpenseMutation()
  const updateMutation = useUpdateRecurringExpenseMutation()

  const [prevExpenseId, setPrevExpenseId] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(false)

  const currentExpenseId = editExpense?.id || null
  if (currentExpenseId !== prevExpenseId || open !== prevOpen) {
    setPrevExpenseId(currentExpenseId)
    setPrevOpen(open)
    if (editExpense) {
      setBudgetId(editExpense.budgetId)
      setName(editExpense.name)
      setAmount(formatCents(editExpense.amount).toString())
      setCurrency(editExpense.currency)
      setInterval(editExpense.interval)
      setNextDueDate(new Date(editExpense.nextDueDate))
      setIsVariable(editExpense.isVariable)
      setStatus(editExpense.status)
      setGracePeriodDays(editExpense.gracePeriodDays || 0)
    } else {
      setBudgetId("")
      setName("")
      setAmount("")
      setCurrency(baseCurrency || "USD")
      setInterval("monthly")
      setNextDueDate(new Date())
      setIsVariable(false)
      setStatus("active")
      setGracePeriodDays(0)
    }
  }

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const handleBudgetChange = (newBudgetId: string) => {
    setBudgetId(newBudgetId)
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setCurrency(b.currency)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!budgetId) return

    const centsAmount = toCentsString(amount)
    const nextDueDateStr = toLocalISODate(nextDueDate)

    if (editExpense) {
      await updateMutation.mutateAsync({
        id: editExpense.id,
        req: {
          id: editExpense.id,
          budgetId,
          name,
          amount: centsAmount,
          currency,
          interval,
          nextDueDate: nextDueDateStr,
          isVariable,
          status,
          gracePeriodDays,
        },
      })
    } else {
      await createMutation.mutateAsync({
        budgetId,
        name,
        amount: centsAmount,
        currency,
        interval,
        nextDueDate: nextDueDateStr,
        isVariable,
        gracePeriodDays,
      })
    }

    refetchExpenses()
    onOpenChange(false)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const conversion = getConversionPreview(amount, currency)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-md md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editExpense
              ? "Edit Recurrent Expense"
              : "Create Recurrent Expense"}
          </SheetTitle>
          <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {editExpense
              ? "Modify the rules for this recurrent expense template."
              : "Configure a recurrent expense template (e.g. rent or subscriptions)."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="budgetId"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Budget
            </Label>
            <Select
              value={budgetId}
              onValueChange={(val) => val && handleBudgetChange(val)}
            >
              <SelectTrigger
                id="budgetId"
                className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Select a budget...">
                  {(() => {
                    const selected = budgets.find((b) => b.id === budgetId)
                    return selected ? selected.name : undefined
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {budgets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Template Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Rent, Netflix"
              required
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="amount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Expected Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="amount"
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
                onValueChange={(val) => setCurrency(val || "USD")}
              >
                <SelectTrigger
                  id="currency"
                  className="h-full border-0 bg-transparent px-3 py-2 text-xs font-bold focus:ring-0 focus-visible:ring-0"
                >
                  <SelectValue placeholder="USD" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                  {["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((cur) => (
                    <SelectItem key={cur} value={cur}>
                      {cur}
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

          <div className="space-y-2">
            <Label
              htmlFor="interval"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Interval
            </Label>
            <Select
              value={interval}
              onValueChange={(val) => setInterval(val || "monthly")}
            >
              <SelectTrigger
                id="interval"
                className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Monthly" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Next Due Date
            </Label>
            <DatePicker
              date={nextDueDate}
              setDate={(d) => d && setNextDueDate(d)}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="gracePeriodDays"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Grace Period (in days)
            </Label>
            <Input
              id="gracePeriodDays"
              type="number"
              min="0"
              placeholder="e.g. 5"
              value={gracePeriodDays || ""}
              onChange={(e) => setGracePeriodDays(Number(e.target.value))}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-muted/20 bg-muted/5 p-4 select-none">
            <Checkbox
              id="isVariable"
              checked={isVariable}
              onCheckedChange={(checked) => setIsVariable(!!checked)}
            />
            <div className="grid gap-1">
              <Label
                htmlFor="isVariable"
                className="cursor-pointer text-xs leading-none font-semibold text-foreground/80"
              >
                Variable Amount Bill
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Check if the amount changes month-to-month (e.g. electricity
                bills).
              </span>
            </div>
          </div>

          {editExpense && (
            <div className="space-y-2">
              <Label
                htmlFor="status"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Status
              </Label>
              <Select
                value={status}
                onValueChange={(val) => setStatus(val || "active")}
              >
                <SelectTrigger
                  id="status"
                  className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editExpense ? "Save Changes" : "Create Template"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
