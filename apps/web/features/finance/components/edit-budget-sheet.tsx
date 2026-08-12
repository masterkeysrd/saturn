import { useState, useEffect, createElement } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { budgetSchema, type BudgetFormValues } from "../schemas/budget"
import {
  type Account,
  type Budget,
  type LimitPropagation,
  type UpdateBudgetRequest,
  useUpdateBudgetMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { usePatch } from "@/hooks/use-patch"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { AccountSelect } from "./account-select"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  BUDGET_COLORS,
  BUDGET_ICONS,
  getBudgetIcon,
  toCentsString,
  formatCents,
} from "../utils"

interface EditBudgetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  activeBudget?: Budget | null
  accounts?: Account[]
  refetchBudgets?: () => void
}

const INTERVAL_ITEMS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-Time" },
]

const STATUS_ITEMS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived / Disabled" },
]

const PROPAGATION_ITEMS = [
  {
    value: "LIMIT_PROPAGATION_CURRENT_PERIOD",
    label: "Current Period Only",
  },
  {
    value: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
    label: "Future Periods Only",
  },
]

export function EditBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  activeBudget,
  accounts = [],
  refetchBudgets,
}: EditBudgetSheetProps) {
  const activeAccounts = accounts.filter((a) => a.isActive)
  const updateMutation = useUpdateBudgetMutation()
  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )

  const patchMutation = usePatch<
    Budget,
    { id: string; req: UpdateBudgetRequest }
  >({
    entityKey: "budgets",
    mutationFn: (vars) => updateMutation.mutateAsync(vars),
    buildVariables: (id, payload, _dirtyPaths, expectedVersion) => ({
      id,
      req: {
        id,
        version: expectedVersion,
        budget: payload as Budget,
        propagation,
      },
    }),
  })

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
    formState: { errors, dirtyFields },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      name: "",
      limit: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      status: "ACTIVE",
      icon: "piggy-bank",
      color: "indigo",
      defaultAccountId: "",
    },
  })

  useEffect(() => {
    if (activeBudget) {
      reset({
        name: activeBudget.name,
        limit: formatCents(activeBudget.limitAmount).toString(),
        currency: activeBudget.currency,
        interval: activeBudget.interval,
        status: activeBudget.status || "ACTIVE",
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

  const onSubmit = async (data: BudgetFormValues) => {
    if (!activeBudget?.id) return

    try {
      await patchMutation.mutateAsync({
        id: activeBudget.id,
        expectedVersion: activeBudget.version,
        payload: {
          name: data.name,
          limitAmount: toCentsString(data.limit),
          currency: data.currency,
          interval: data.interval,
          status: data.status,
          icon: data.icon,
          color: data.color,
          defaultAccountId: data.defaultAccountId || "",
        },
        dirtyFields,
      })
      onOpenChange(false)
      refetchBudgets?.()
    } catch {
      // Handled by patchMutation / toast
    }
  }

  const preview = getConversionPreview(limitValue, currencyValue)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Budget Template"
      description="Modify budget category properties, visual parameters, or limit propagation."
      submitLabel="Save Changes"
      isPending={updateMutation.isPending || patchMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Budget Name & Icon" error={errors.name?.message}>
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
                  onClick={() =>
                    setValue("icon", i.value, { shouldDirty: true })
                  }
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
              placeholder="e.g. Groceries, Dining Out"
              {...register("name")}
              className="h-11 rounded-xl border-border/60 bg-background/50"
            />
          </div>
        </div>
      </FormFieldItem>

      <FormFieldItem
        label={`Limit Amount (${currencyValue})`}
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

      <FormSelect
        control={control}
        name="status"
        label="Budget Status"
        items={STATUS_ITEMS}
      />

      <div className="mt-3 space-y-1.5 border-t border-border/20 pt-5">
        <Label
          htmlFor="propagation"
          className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
        >
          Limit Propagation Rule
        </Label>
        <Select
          value={propagation}
          onValueChange={(val) =>
            val && setPropagation(val as LimitPropagation)
          }
        >
          <SelectTrigger
            id="propagation"
            className="!h-11 w-full rounded-xl border-border/60 bg-background/50 text-left"
          >
            <SelectValue placeholder="Select propagation rule...">
              {PROPAGATION_ITEMS.find((i) => i.value === propagation)?.label ||
                propagation}
            </SelectValue>
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
              onClick={() => setValue("color", c.value, { shouldDirty: true })}
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
