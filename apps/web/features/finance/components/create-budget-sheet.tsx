import { useState, createElement } from "react"
import {
  useCreateBudgetMutation,
  type RecurrenceInterval,
  useListAccountsQuery,
  type CurrencyInfo,
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
import { cn } from "@/lib/utils"
import { AccountSelect } from "./account-select"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  BUDGET_COLORS,
  BUDGET_ICONS,
  getBudgetColors,
  getBudgetIcon,
  toCentsString,
} from "../utils"

interface CreateBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  refetchBudgets: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
  currencies?: CurrencyInfo[]
}

export function CreateBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  refetchBudgets,
  getConversionPreview,
  currencies = [],
}: CreateBudgetSheetProps) {
  const [name, setName] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState(baseCurrency || "USD")
  const [interval, setInterval] =
    useState<RecurrenceInterval>("INTERVAL_MONTHLY")
  const [icon, setIcon] = useState("piggy-bank")
  const [color, setColor] = useState("indigo")
  const [defaultAccountId, setDefaultAccountId] = useState("")

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

  const createMutation = useCreateBudgetMutation()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMutation.mutateAsync({
      name,
      limitAmount: toCentsString(limit),
      currency,
      interval,
      icon,
      color,
      defaultAccountId: defaultAccountId || undefined,
    })
    onOpenChange(false)
    setName("")
    setLimit("")
    setIcon("piggy-bank")
    setColor("indigo")
    setDefaultAccountId("")
    refetchBudgets()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Create Budget Template
          </SheetTitle>
          <SheetDescription className="mt-1">
            Define a recurring budget template. Periods will spawn lazily when
            transactions occur.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleCreate} className="mt-8 space-y-5">
          {/* Budget Name and Category Icon Input */}
          <div className="space-y-1.5">
            <Label
              htmlFor="name"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Budget Name
            </Label>
            <div className="flex h-11 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dining Out, Groceries"
                className="order-2 h-full w-full flex-1 bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                required
              />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "order-1 flex h-full shrink-0 cursor-pointer items-center justify-center rounded-none border-y-0 border-r border-l-0 border-border/30 px-4 transition-all hover:bg-muted/20 focus:border-r-primary/50 focus:bg-muted/40 focus:outline-none",
                        getBudgetColors(color).text,
                        getBudgetColors(color).bg
                      )}
                      title="Choose category icon"
                    >
                      {createElement(getBudgetIcon(icon), {
                        className:
                          "h-5 w-5 transition-transform duration-200 group-focus/button:scale-110",
                      })}
                    </Button>
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
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="limit"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Limit Amount
            </Label>
            <Input
              id="limit"
              type="number"
              step="0.01"
              min="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
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
              htmlFor="currency"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Currency
            </Label>
            <Select
              value={currency}
              onValueChange={(val) => setCurrency(val || "")}
            >
              <SelectTrigger
                id="currency"
                className="!h-11 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {currencies.map((cur) => (
                  <SelectItem key={cur.code} value={cur.code}>
                    {cur.code} {cur.name ? `(${cur.name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="interval"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Interval
            </Label>
            <Select
              value={interval}
              onValueChange={(val) =>
                val && setInterval(val as RecurrenceInterval)
              }
            >
              <SelectTrigger
                id="interval"
                className="!h-11 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue>
                  {interval === "INTERVAL_WEEKLY"
                    ? "Weekly"
                    : interval === "INTERVAL_YEARLY"
                      ? "Yearly"
                      : "Monthly"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                <SelectItem value="INTERVAL_WEEKLY">Weekly</SelectItem>
                <SelectItem value="INTERVAL_MONTHLY">Monthly</SelectItem>
                <SelectItem value="INTERVAL_YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="default-account"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Default Account (Optional)
            </Label>
            <AccountSelect
              value={defaultAccountId}
              onValueChange={setDefaultAccountId}
              accounts={activeAccounts}
              placeholder="Pre-fills forms with this account"
              allowNone
            />
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
            disabled={createMutation.isPending}
            className="mt-8 h-11 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white transition-all hover:scale-[1.01] hover:opacity-95"
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Budget
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
