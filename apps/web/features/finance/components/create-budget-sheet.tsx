import { createElement, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCreateBudgetMutation,
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
import { cn } from "@/lib/utils"
import { AccountSelect } from "./account-select"
import {
  BUDGET_COLORS,
  BUDGET_ICONS,
  getBudgetColors,
  getBudgetIcon,
  toCentsString,
} from "../utils"
import { budgetSchema, type BudgetFormValues } from "../schemas/budget"

const INTERVAL_ITEMS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
]

interface CreateBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  refetchBudgets: () => void
}

export function CreateBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  refetchBudgets,
}: CreateBudgetSheetProps) {
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

  const createMutation = useCreateBudgetMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      name: "",
      limit: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      icon: "piggy-bank",
      color: "indigo",
      defaultAccountId: "",
    },
  })

  // Sync currency when baseCurrency is ready
  useEffect(() => {
    if (baseCurrency) {
      setValue("currency", baseCurrency)
    }
  }, [baseCurrency, setValue])

  const limitValue = watch("limit")
  const currencyValue = watch("currency")
  const iconValue = watch("icon")
  const colorValue = watch("color")

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
    await createMutation.mutateAsync({
      budget: {
        name: data.name,
        limitAmount: toCentsString(data.limit),
        currency: data.currency,
        interval: data.interval,
        isActive: true,
        icon: data.icon,
        color: data.color,
        defaultAccountId: data.defaultAccountId || undefined,
      },
    })
    onOpenChange(false)
    reset({
      name: "",
      limit: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      icon: "piggy-bank",
      color: "indigo",
      defaultAccountId: "",
    })
    refetchBudgets()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Create Budget Template
          </SheetTitle>
          <SheetDescription className="mt-1">
            Define a recurring budget template. Periods will spawn lazily when
            transactions occur.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
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
                {...register("name")}
                placeholder="e.g. Dining Out, Groceries"
                className="order-2 h-full w-full flex-1 bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "order-1 flex h-full shrink-0 cursor-pointer items-center justify-center rounded-none border-y-0 border-r border-l-0 border-border/30 px-4 transition-all hover:bg-muted/20 focus:border-r-primary/50 focus:bg-muted/40 focus:outline-none",
                        getBudgetColors(colorValue).text,
                        getBudgetColors(colorValue).bg
                      )}
                      title="Choose category icon"
                    >
                      {createElement(getBudgetIcon(iconValue), {
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
            </div>
            {errors.name && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.name.message}
              </p>
            )}
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
              {...register("limit")}
              placeholder="0.00"
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
            items={currencyItems}
          />

          <FormSelect
            control={control}
            name="interval"
            label="Interval"
            placeholder="Select interval..."
            items={INTERVAL_ITEMS}
          />

          <div className="space-y-1.5">
            <Label
              htmlFor="default-account"
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
