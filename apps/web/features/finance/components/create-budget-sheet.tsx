import { createElement } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { budgetSchema, type BudgetFormValues } from "../schemas/budget"
import {
  type Account,
  useCreateBudgetMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { AccountSelect } from "./account-select"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  BUDGET_COLORS,
  BUDGET_ICONS,
  getBudgetColors,
  getBudgetIcon,
  toCentsString,
} from "../utils"
import { cn } from "@/lib/utils"

interface CreateBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  accounts?: Account[]
  refetchBudgets?: () => void
}

const INTERVAL_ITEMS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-Time" },
]

export function CreateBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  accounts = [],
  refetchBudgets,
}: CreateBudgetSheetProps) {
  const activeAccounts = accounts.filter((a) => a.isActive)
  const createMutation = useCreateBudgetMutation()

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
  }))

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
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

  const iconValue = useWatch({ control, name: "icon" })
  const colorValue = useWatch({ control, name: "color" })
  const limitValue = useWatch({ control, name: "limit" })
  const currencyValue = useWatch({ control, name: "currency" })

  const onSubmit = async (data: BudgetFormValues) => {
    const centsStr = toCentsString(data.limit)
    await createMutation.mutateAsync({
      budget: {
        id: "",
        name: data.name,
        limitAmount: centsStr,
        currency: data.currency,
        interval: data.interval,
        status: "ACTIVE",
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
    refetchBudgets?.()
  }

  const preview = getConversionPreview(limitValue, currencyValue)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create Budget Template"
      description="Define a recurring budget template. Periods will spawn lazily when transactions occur."
      submitLabel="Create Budget"
      isPending={createMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Budget Name" error={errors.name?.message}>
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
      </FormFieldItem>

      <FormFieldItem
        label="Limit Amount"
        error={errors.limit?.message}
        subtext={
          preview ? (
            "error" in preview ? (
              <span className="font-semibold text-amber-500">
                {preview.error}
              </span>
            ) : (
              <span>
                ≈{" "}
                {preview.amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="font-bold text-foreground">
                  {preview.currency}
                </span>{" "}
                <span className="opacity-70">
                  (at 1 {currencyValue} = {preview.rate} {preview.currency})
                </span>
              </span>
            )
          ) : undefined
        }
      >
        <AmountInput
          control={control}
          name="limit"
          placeholder="0.00"
          className="h-11 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

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

      <FormFieldItem label="Default Account (Optional)">
        <AccountSelect
          control={control}
          name="defaultAccountId"
          accounts={activeAccounts}
          placeholder="Pre-fills forms with this account"
          allowNone
        />
      </FormFieldItem>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
          Theme Color
        </label>
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
    </FormDrawer>
  )
}
