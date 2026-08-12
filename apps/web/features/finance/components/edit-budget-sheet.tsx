import { useState, useEffect, createElement } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useUpdateBudgetMutation,
  type Budget,
  type LimitPropagation,
  useListAccountsQuery,
  useListCurrenciesQuery,
  useListExchangeRatesQuery,
  type ExchangeRate,
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
import { FormSelect } from "@/components/ui/form-select"
import { Loader2 } from "lucide-react"
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
  getBudgetIcon,
  formatCents,
  toCentsString,
} from "../utils"
import { budgetSchema, type BudgetFormValues } from "../schemas/budget"

const PROPAGATION_ITEMS: Array<{ value: LimitPropagation; label: string }> = [
  {
    value: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
    label: "Next periods only (keep current period limit)",
  },
  {
    value: "LIMIT_PROPAGATION_CURRENT_PERIOD",
    label: "Apply also to current active period",
  },
]

const INTERVAL_ITEMS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-Time / Project Budget" },
]

interface EditBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeBudget: Budget | null
  spaceId: string
  refetchBudgets: () => void
  baseCurrency: string
}

export function EditBudgetSheet({
  open,
  onOpenChange,
  activeBudget,
  spaceId,
  refetchBudgets,
  baseCurrency,
}: EditBudgetSheetProps) {
  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((cur) => ({
    value: cur.code,
    label: `${cur.code}${cur.name ? ` (${cur.name})` : ""}`,
  }))

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

  const [isActive, setIsActive] = useState(true)
  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )

  const updateMutation = useUpdateBudgetMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      name: "",
      limit: "",
      currency: "USD",
      interval: "MONTHLY",
      icon: "piggy-bank",
      color: "indigo",
      defaultAccountId: "",
    },
  })

  const [prevBudget, setPrevBudget] = useState(activeBudget)
  if (activeBudget && activeBudget !== prevBudget) {
    setPrevBudget(activeBudget)
    setIsActive(activeBudget.isActive)
  }

  // Sync form values whenever activeBudget changes
  useEffect(() => {
    if (activeBudget) {
      reset({
        name: activeBudget.name,
        limit: formatCents(activeBudget.limitAmount).toString(),
        currency: activeBudget.currency,
        interval: activeBudget.interval,
        icon: activeBudget.icon || "piggy-bank",
        color: activeBudget.color || "indigo",
        defaultAccountId: activeBudget.defaultAccountId || "",
      })
    }
  }, [activeBudget, reset])

  const limitValue = useWatch({ control, name: "limit" })
  const currencyValue = useWatch({ control, name: "currency" })
  const iconValue = useWatch({ control, name: "icon" })
  const colorValue = useWatch({ control, name: "color" })

  const getConversionPreview = (amountStr: string, fromCurr: string) => {
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) return null
    if (!baseCurrency || fromCurr === baseCurrency) return null

    const matchingRates =
      ratesData?.exchangeRates?.filter(
        (r: ExchangeRate) =>
          r.fromCurrency === fromCurr && r.toCurrency === baseCurrency
      ) || []

    if (matchingRates.length === 0) {
      return {
        error: `No exchange rate configured from ${fromCurr} to ${baseCurrency}.`,
      }
    }

    const latestRate = [...matchingRates].sort(
      (a, b) => new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
    )[0]
    return {
      amount: amount * latestRate.rate,
      rate: latestRate.rate,
      currency: baseCurrency,
    }
  }

  const onSubmit = async (data: BudgetFormValues) => {
    if (!activeBudget) return

    await updateMutation.mutateAsync({
      id: activeBudget.id || "",
      req: {
        id: activeBudget.id || "",
        version: activeBudget.version,
        budget: {
          name: data.name,
          limitAmount: toCentsString(data.limit),
          currency: data.currency,
          interval: data.interval,
          isActive,
          icon: data.icon,
          color: data.color,
          defaultAccountId: data.defaultAccountId || undefined,
        },
        propagation,
      },
    })
    onOpenChange(false)
    refetchBudgets()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Edit Budget Template
          </SheetTitle>
          <SheetDescription className="mt-1">
            Modify budget category properties, visual parameters, or limit
            propagation.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
          {/* Budget Name and Category Icon Input */}
          <div className="space-y-1.5">
            <Label
              htmlFor="editName"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Budget Name & Icon
            </Label>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-background/50 p-0 text-primary transition-all hover:bg-muted/20"
                      title="Choose category icon"
                    >
                      {createElement(getBudgetIcon(iconValue), {
                        className: "h-5 w-5",
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
                      onClick={() => setValue("icon", i.value)}
                      title={i.label}
                      className={`flex cursor-pointer items-center justify-center rounded-lg p-2.5 transition-all hover:bg-muted/60 ${
                        iconValue === i.value
                          ? "bg-primary font-bold text-primary-foreground hover:bg-primary/90"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {createElement(i.icon, { className: "h-4.5 w-4.5" })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-full">
                <Input
                  id="editName"
                  placeholder="e.g. Groceries, Dining Out"
                  {...register("name")}
                  className="h-11 rounded-xl border-border/60 bg-background/50"
                />
              </div>
            </div>
            {errors.name && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="editLimit"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Limit Amount ({currencyValue})
            </Label>
            <Input
              id="editLimit"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("limit")}
              className="h-11 rounded-xl border-border/60 bg-background/50"
            />
            {errors.limit && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.limit.message}
              </p>
            )}
            {(() => {
              const preview = getConversionPreview(limitValue, currencyValue)
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
                    (at 1 {currencyValue} = {preview.rate} {preview.currency})
                  </span>
                </span>
              )
            })()}
          </div>

          <FormSelect
            control={control}
            name="currency"
            label="Currency"
            disabled
            items={currencyItems}
            helperText="Currency cannot be modified after creation to protect historical calculations."
          />

          <FormSelect
            control={control}
            name="interval"
            label="Interval"
            disabled
            items={INTERVAL_ITEMS}
            helperText="Interval cannot be modified after creation to protect historical reports."
          />

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
            <Select
              items={PROPAGATION_ITEMS}
              value={propagation}
              onValueChange={(val) =>
                val && setPropagation(val as LimitPropagation)
              }
            >
              <SelectTrigger
                id="propagation"
                className="!h-11 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Select propagation rule..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {PROPAGATION_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="editDefaultAccount"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Default Account (Optional)
            </Label>
            <AccountSelect
              control={control}
              name="defaultAccountId"
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
                  onClick={() => setValue("color", c.value)}
                  className={`relative h-7 w-7 cursor-pointer rounded-full transition-all hover:scale-110 ${c.bar}`}
                >
                  {colorValue === c.value && (
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
