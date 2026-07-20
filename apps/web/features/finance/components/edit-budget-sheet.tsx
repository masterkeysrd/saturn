import { useState, createElement } from "react"
import {
  useUpdateBudgetMutation,
  type Budget,
  type RecurrenceInterval,
  type LimitPropagation,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import {
  BUDGET_COLORS,
  BUDGET_ICONS,
  getBudgetColors,
  getBudgetIcon,
  formatCents,
  toCentsString,
} from "../utils"

interface EditBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeBudget: Budget | null
  spaceId: string
  refetchBudgets: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function EditBudgetSheet({
  open,
  onOpenChange,
  activeBudget,
  spaceId,
  refetchBudgets,
  getConversionPreview,
}: EditBudgetSheetProps) {
  const [name, setName] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [interval, setInterval] =
    useState<RecurrenceInterval>("INTERVAL_MONTHLY")
  const [isActive, setIsActive] = useState(true)
  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )
  const [icon, setIcon] = useState("piggy-bank")
  const [color, setColor] = useState("indigo")

  const [prevBudgetId, setPrevBudgetId] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(false)

  if (activeBudget && (activeBudget.id !== prevBudgetId || open !== prevOpen)) {
    setPrevBudgetId(activeBudget.id)
    setPrevOpen(open)
    setName(activeBudget.name)
    setLimit(formatCents(activeBudget.limitAmount).toString())
    setCurrency(activeBudget.currency)
    setInterval(activeBudget.interval)
    setIsActive(activeBudget.isActive)
    setIcon(activeBudget.icon || "piggy-bank")
    setColor(activeBudget.color || "indigo")
  }

  const updateMutation = useUpdateBudgetMutation()

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeBudget) return

    await updateMutation.mutateAsync({
      space_id: spaceId,
      id: activeBudget.id,
      req: {
        spaceId,
        id: activeBudget.id,
        name,
        limitAmount: toCentsString(limit),
        currency,
        interval,
        isActive,
        propagation,
        icon,
        color,
      },
    })
    onOpenChange(false)
    refetchBudgets()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Edit Budget Template
          </SheetTitle>
          <SheetDescription className="mt-1">
            Modify this budget's properties and choose how changes propagate.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleUpdate} className="mt-8 space-y-5">
          <div className="flex items-end gap-3">
            {/* Category Icon dropdown trigger */}
            <div className="flex shrink-0 flex-col items-start space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
                Icon
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={`flex h-full shrink-0 cursor-pointer items-center justify-center border-r border-border/30 px-3.5 transition-colors hover:bg-muted/30 ${getBudgetColors(color).text} ${getBudgetColors(color).bg}`}
                    >
                      {createElement(getBudgetIcon(icon), {
                        className: "h-5 w-5",
                      })}
                    </button>
                  }
                />
                <DropdownMenuContent
                  align="start"
                  className="grid max-w-[240px] grid-cols-4 gap-1 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-xl backdrop-blur-xl"
                >
                  {BUDGET_ICONS.map((i) => (
                    <DropdownMenuItem
                      key={i.value}
                      onClick={() => setIcon(i.value)}
                      title={i.label}
                      className={`flex cursor-pointer items-center justify-center rounded-lg p-2.5 transition-all hover:bg-muted/60 ${
                        icon === i.value
                          ? "bg-primary font-bold text-primary-foreground hover:bg-primary/90"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {createElement(i.icon, { className: "h-4.5 w-4.5" })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Budget Name field */}
            <div className="flex-1 space-y-1.5">
              <Label
                htmlFor="editName"
                className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
              >
                Budget Name
              </Label>
              <input
                id="editName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full flex-1 rounded-xl border border-border/60 bg-background/50 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="editLimit"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Limit Amount
            </Label>
            <Input
              id="editLimit"
              type="number"
              step="0.01"
              min="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="h-11 rounded-xl border-border/60 bg-background/50"
              required
            />
            {(() => {
              const preview = getConversionPreview(limit, currency)
              if (!preview) return null
              if ("error" in preview) {
                return (
                  <span className="mt-1.5 block text-[11px] font-semibold text-amber-500">
                    {preview.error}
                  </span>
                )
              }
              return (
                <span className="mt-1.5 block animate-in text-[11px] font-medium text-muted-foreground fade-in">
                  ≈{" "}
                  {preview.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-[10px] font-bold text-foreground">
                    {preview.currency}
                  </span>{" "}
                  <span className="text-[10px] opacity-70">
                    (at 1 {currency} = {preview.rate} {preview.currency})
                  </span>
                </span>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="editCurrency"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Currency
            </Label>
            <select
              id="editCurrency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="DOP">DOP</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="editInterval"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Interval
            </Label>
            <select
              id="editInterval"
              value={interval}
              onChange={(e) =>
                setInterval(e.target.value as RecurrenceInterval)
              }
              className="flex h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none"
            >
              <option value="INTERVAL_WEEKLY">Weekly</option>
              <option value="INTERVAL_MONTHLY">Monthly</option>
              <option value="INTERVAL_YEARLY">Yearly</option>
            </select>
          </div>

          <div className="flex items-center space-x-2.5 py-2">
            <input
              id="editIsActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4.5 w-4.5 cursor-pointer rounded border-border text-primary focus:ring-primary"
            />
            <Label
              htmlFor="editIsActive"
              className="cursor-pointer text-sm font-semibold"
            >
              Template is Active
            </Label>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-border/20 pt-5">
            <Label
              htmlFor="propagation"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Limit Propagation Rule
            </Label>
            <select
              id="propagation"
              value={propagation}
              onChange={(e) =>
                setPropagation(e.target.value as LimitPropagation)
              }
              className="flex h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none"
            >
              <option value="LIMIT_PROPAGATION_NEXT_PERIODS_ONLY">
                Next periods only (keep current period limit)
              </option>
              <option value="LIMIT_PROPAGATION_CURRENT_PERIOD">
                Apply also to current active period
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
              Theme Color
            </Label>
            <div className="flex flex-wrap gap-2.5 pt-1">
              {BUDGET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`relative h-7 w-7 cursor-pointer rounded-full transition-all hover:scale-110 ${c.bar}`}
                >
                  {color === c.value && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={updateMutation.isPending}
            className="mt-8 h-11 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white transition-all hover:scale-[1.01] hover:opacity-95"
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
