import { useState, useMemo, createElement } from "react"
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
  type Budget,
  type LimitPropagation,
  type UpdateBudgetRequest,
  useUpdateBudgetMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { usePatch } from "@/hooks/use-patch"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { AccountSelect } from "./account-select"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
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
  getBudgetIconLabelKey,
  toCentsString,
  formatCents,
  BUDGET_INTERVAL_OPTIONS as INTERVAL_ITEMS,
  LIMIT_PROPAGATION_OPTIONS as PROPAGATION_ITEMS,
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

const STATUS_VALUES = ["ACTIVE", "PAUSED", "CLOSED"] as const

export function EditBudgetSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  activeBudget,
  accounts = [],
  refetchBudgets,
}: EditBudgetSheetProps) {
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
  const updateMutation = useUpdateBudgetMutation()
  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )
  const [prevBudgetKey, setPrevBudgetKey] = useState("")
  const budgetKey = `${open}:${activeBudget?.id || ""}`
  if (budgetKey !== prevBudgetKey) {
    setPrevBudgetKey(budgetKey)
    setPropagation("LIMIT_PROPAGATION_NEXT_PERIODS_ONLY")
  }

  const patchMutation = usePatch<
    Budget,
    { id: string; req: UpdateBudgetRequest }
  >({
    entityKey: "/api/v1/finance/budgets",
    mutationFn: (vars) => updateMutation.mutateAsync(vars),
    onErrorToast: (error) => {
      toast.add({
        title: t("finance.budgets.sheet.updateFailedTitle"),
        description: error.message,
        type: "error",
      })
    },
    buildVariables: (id, payload, dirtyPaths, expectedVersion) => {
      const fieldPathMap: Record<string, string> = {
        name: "name",
        limit: "limit_amount",
        limitAmount: "limit_amount",
        currency: "currency",
        interval: "interval",
        status: "status",
        icon: "icon",
        color: "color",
        defaultAccountId: "default_account_id",
      }
      const mappedPaths = Array.from(
        new Set(
          dirtyPaths
            .filter((p) => p !== "propagation")
            .map((p) => fieldPathMap[p] || p)
        )
      )
      const paths = mappedPaths.length > 0 ? mappedPaths : ["limit_amount"]

      const rawLimit = (payload as { limit?: string | number }).limit
      const resolvedLimitAmount =
        rawLimit !== undefined
          ? toCentsString(String(rawLimit))
          : payload.limitAmount || activeBudget?.limitAmount || "0"

      const budgetPayload = {
        ...(activeBudget || {}),
        ...payload,
        limitAmount: resolvedLimitAmount,
      } as Record<string, unknown>
      delete budgetPayload.limit
      delete budgetPayload.propagation

      return {
        id,
        req: {
          id,
          version: expectedVersion,
          budget: budgetPayload as unknown as Budget,
          propagation,
          updateMask: { paths },
        },
      }
    },
  })

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
      name: activeBudget?.name || "",
      limit: activeBudget?.limitAmount
        ? formatCents(activeBudget.limitAmount).toString()
        : "",
      currency: activeBudget?.currency || baseCurrency || "USD",
      interval: activeBudget?.interval || "MONTHLY",
      status: activeBudget?.status || "ACTIVE",
      icon: activeBudget?.icon || "piggy-bank",
      color: activeBudget?.color || "indigo",
      defaultAccountId: activeBudget?.defaultAccountId || "",
    }),
    [activeBudget, baseCurrency]
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetSchema),
    defaultValues: budgetDefaultValues,
    values: budgetDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const limitValue = useWatch({ control, name: "limit" })
  const currencyValue = useWatch({ control, name: "currency" })
  const iconValue = useWatch({ control, name: "icon" })
  const colorValue = useWatch({ control, name: "color" })

  const onSubmit = async (data: BudgetFormValues) => {
    if (!activeBudget?.id) return

    const isPropagationChanged =
      propagation !== "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"

    try {
      await patchMutation.mutateAsync({
        id: activeBudget.id,
        expectedVersion: activeBudget.version,
        payload: {
          name: data.name,
          limit: data.limit,
          limitAmount: toCentsString(String(data.limit)),
          currency: data.currency,
          interval: data.interval,
          status: data.status,
          icon: data.icon,
          color: data.color,
          defaultAccountId: data.defaultAccountId || "",
          ...(isPropagationChanged ? { propagation } : {}),
        } as unknown as Partial<Budget>,
        dirtyFields: isPropagationChanged
          ? { ...dirtyFields, propagation: true }
          : dirtyFields,
      })
      onOpenChange(false)
      await invalidateFinanceQueries(queryClient)
      refetchBudgets?.()
    } catch {
      // Handled by patchMutation onErrorToast
    }
  }

  const preview = getConversionPreview(limitValue, currencyValue)

  const intervalItems = INTERVAL_ITEMS.map((item) => ({
    value: item.value,
    label: getLocalizedEnumLabel("finance", "interval", item.value, language),
  }))
  const statusItems = STATUS_VALUES.map((value) => ({
    value,
    label:
      value === "PAUSED"
        ? t("finance.budgets.sheet.pausedLong")
        : getLocalizedEnumLabel("finance", "status", value, language),
  }))
  const propagationItems = PROPAGATION_ITEMS.map((item) => ({
    value: item.value,
    label: getLocalizedEnumLabel(
      "finance",
      "limitPropagation",
      item.value,
      language
    ),
  }))

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t("finance.budgets.sheet.editTitle")}
      description={t("finance.budgets.sheet.editDescription")}
      submitLabel={t("finance.budgets.sheet.editSubmit")}
      isPending={updateMutation.isPending || patchMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem
        label={t("finance.budgets.sheet.nameLabelIcon")}
        error={errors.name?.message}
      >
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-control p-0 text-primary shadow-2xs transition-colors hover:bg-muted/40"
                  title={t("finance.budgets.sheet.chooseIcon")}
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

          <div className="w-full">
            <Input
              placeholder={t("finance.budgets.sheet.namePlaceholderEdit")}
              {...register("name")}
            />
          </div>
        </div>
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.budgets.sheet.limitAmountCurrency", {
          currency: currencyValue,
        })}
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
        disabled
        items={currencyItems}
        helperText={t("finance.budgets.sheet.currencyLockedHelper")}
      />

      <FormSelect
        control={control}
        name="interval"
        label={t("finance.budgets.sheet.intervalLabel")}
        disabled
        items={intervalItems}
        helperText={t("finance.budgets.sheet.intervalLockedHelper")}
      />

      <FormSelect
        control={control}
        name="status"
        label={t("finance.budgets.sheet.statusLabel")}
        items={statusItems}
      />

      <div className="mt-3 space-y-1.5 border-t border-border/40 pt-5">
        <Label
          htmlFor="propagation"
          className="text-[13px] font-medium text-foreground/90"
        >
          {t("finance.budgets.sheet.propagationLabel")}
        </Label>
        <Select
          value={propagation}
          onValueChange={(val) =>
            val && setPropagation(val as LimitPropagation)
          }
        >
          <SelectTrigger id="propagation" className="w-full text-left">
            <SelectValue
              placeholder={t("finance.budgets.sheet.propagationPlaceholder")}
            >
              {propagationItems.find((i) => i.value === propagation)?.label ||
                propagation}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
            {propagationItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
