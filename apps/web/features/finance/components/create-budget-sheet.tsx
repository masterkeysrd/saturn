import { createElement, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { BudgetSchema, type BudgetFormValues } from "@saturn/schemas"
import {
  type Account,
  useCreateBudgetMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
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
  getBudgetIconLabelKey,
  toCentsString,
  BUDGET_INTERVAL_OPTIONS as INTERVAL_ITEMS,
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

export function CreateBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  accounts = [],
  refetchBudgets,
}: CreateBudgetSheetProps) {
  const queryClient = useQueryClient()
  const { t, language } = useI18n()
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId && accounts.length === 0 }
  )
  const resolvedAccounts = useMemo(
    () => (accounts.length > 0 ? accounts : accountsData?.accounts || []),
    [accounts, accountsData?.accounts]
  )
  const activeAccounts = useMemo(
    () => resolvedAccounts.filter((a) => a.isActive),
    [resolvedAccounts]
  )
  const createMutation = useCreateBudgetMutation()

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
    triggerLabel: c.code,
  }))

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const budgetDefaultValues: BudgetFormValues = useMemo(
    () => ({
      name: "",
      limit: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      icon: "piggy-bank",
      color: "indigo",
      defaultAccountId: "",
    }),
    [baseCurrency]
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetSchema),
    defaultValues: budgetDefaultValues,
    values: budgetDefaultValues,
    resetOptions: { keepDirtyValues: true },
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
    reset()
    onOpenChange(false)
    await invalidateFinanceQueries(queryClient)
    refetchBudgets?.()
  }

  const preview = getConversionPreview(limitValue, currencyValue)

  const intervalItems = INTERVAL_ITEMS.map((item) => ({
    value: item.value,
    label: getLocalizedEnumLabel("finance", "interval", item.value, language),
  }))

  return (
    <FormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={t("finance.budgets.sheet.createTitle")}
      description={t("finance.budgets.sheet.createDescription")}
      submitLabel={t("finance.budgets.sheet.createSubmit")}
      isPending={createMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem
        label={t("finance.budgets.sheet.nameLabel")}
        error={errors.name?.message}
      >
        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-control shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <input
            id="name"
            {...register("name")}
            placeholder={t("finance.budgets.sheet.namePlaceholder")}
            className="order-2 h-full w-full flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "order-1 flex h-full shrink-0 cursor-pointer items-center justify-center rounded-none border-y-0 border-r border-l-0 border-border/60 px-3.5 transition-colors hover:bg-muted/40 focus:outline-none",
                    getBudgetColors(colorValue).text,
                    getBudgetColors(colorValue).bg
                  )}
                  title={t("finance.budgets.sheet.chooseIcon")}
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
                  title={t(getBudgetIconLabelKey(i.value))}
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
        label={t("finance.budgets.sheet.limitAmount")}
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
                  {t("finance.budgets.sheet.ratePreview", {
                    from: currencyValue,
                    rate: preview.rate,
                    to: preview.currency,
                  })}
                </span>
              </span>
            )
          ) : undefined
        }
      >
        <AmountInput control={control} name="limit" placeholder="0.00" />
      </FormFieldItem>

      <FormSelect
        control={control}
        name="currency"
        label={t("finance.budgets.sheet.currencyLabel")}
        items={currencyItems}
      />

      <FormSelect
        control={control}
        name="interval"
        label={t("finance.budgets.sheet.intervalLabel")}
        placeholder={t("finance.budgets.sheet.intervalPlaceholder")}
        items={intervalItems}
      />

      <FormFieldItem label={t("finance.budgets.sheet.defaultAccountLabel")}>
        <AccountSelect
          control={control}
          name="defaultAccountId"
          accounts={activeAccounts}
          placeholder={t("finance.budgets.sheet.defaultAccountPlaceholder")}
          allowNone
        />
      </FormFieldItem>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
          {t("finance.budgets.sheet.themeColor")}
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
