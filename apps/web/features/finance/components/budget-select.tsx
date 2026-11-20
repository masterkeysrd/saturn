import { useState, useMemo } from "react"
import type { Budget } from "@saturn/api/gen/saturn/finance/v1/finance"
import { useI18n } from "@saturn/hooks"
import { getLocalizedIntervalLabel } from "@saturn/i18n"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  getBudgetIcon,
  getBudgetColors,
  formatCents,
  isStatusActive,
} from "../utils"
import { Check, ChevronsUpDown, PauseCircle, Search } from "lucide-react"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"

interface BaseBudgetSelectProps {
  budgets: Budget[]
  placeholder?: string
  disabled?: boolean
  className?: string
  allowNone?: boolean
  onBudgetChange?: (budgetId: string) => void
}

type BudgetSelectProps<TFieldValues extends FieldValues = FieldValues> =
  | (BaseBudgetSelectProps & {
      control?: undefined
      name?: undefined
      value: string
      onValueChange: (value: string) => void
    })
  | (BaseBudgetSelectProps & {
      control: Control<TFieldValues>
      name: Path<TFieldValues>
      value?: undefined
      onValueChange?: undefined
    })

export function BudgetSelect<TFieldValues extends FieldValues = FieldValues>(
  props: BudgetSelectProps<TFieldValues>
) {
  if ("control" in props && props.control && props.name) {
    const {
      control,
      name,
      budgets,
      placeholder,
      disabled,
      className,
      allowNone,
      onBudgetChange,
    } = props
    return (
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <div>
            <BudgetSelectInner
              value={field.value || ""}
              onValueChange={(val) => {
                field.onChange(val)
                onBudgetChange?.(val)
              }}
              budgets={budgets}
              placeholder={placeholder}
              disabled={disabled}
              className={className}
              allowNone={allowNone}
            />
            {fieldState.error && (
              <p className="mt-1 text-[11px] font-semibold text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
    )
  }

  const controlledProps = props as BaseBudgetSelectProps & {
    value: string
    onValueChange: (value: string) => void
  }

  return (
    <BudgetSelectInner
      value={controlledProps.value}
      onValueChange={(val) => {
        controlledProps.onValueChange(val)
        controlledProps.onBudgetChange?.(val)
      }}
      budgets={controlledProps.budgets}
      placeholder={controlledProps.placeholder}
      disabled={controlledProps.disabled}
      className={controlledProps.className}
      allowNone={controlledProps.allowNone}
    />
  )
}

function BudgetSelectInner({
  value,
  onValueChange,
  budgets,
  placeholder,
  disabled = false,
  className,
  allowNone = false,
}: BaseBudgetSelectProps & {
  value: string
  onValueChange: (value: string) => void
}) {
  const { t, language } = useI18n()
  const resolvedPlaceholder =
    placeholder ?? t("finance.pickers.budget.placeholder")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selectedBudget =
    value && value !== "_none" ? budgets.find((b) => b.id === value) : null

  // Active or currently selected budgets
  const selectableBudgets = useMemo(() => {
    return budgets.filter(
      (b) =>
        b.id === value ||
        b.status === "ACTIVE" ||
        (!b.status && b.status !== "CLOSED" && b.status !== "PAUSED")
    )
  }, [budgets, value])

  // Filtered budgets based on search query
  const filteredBudgets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return selectableBudgets
    return selectableBudgets.filter((b) => {
      const nameMatch = b.name.toLowerCase().includes(q)
      const currencyMatch = b.currency.toLowerCase().includes(q)
      const intervalMatch = b.interval.toLowerCase().includes(q)
      const amountMatch = formatCents(b.limitAmount).toString().includes(q)
      return nameMatch || currencyMatch || intervalMatch || amountMatch
    })
  }, [selectableBudgets, search])

  const handleSelect = (budgetId: string) => {
    onValueChange(budgetId === "_none" ? "" : budgetId)
    setOpen(false)
    setSearch("")
  }

  // Formatting helpers for intervals
  const getIntervalColorClass = (interval: string) => {
    switch (interval) {
      case "WEEKLY":
        return "bg-teal-500/10 text-teal-500 border-teal-500/20"
      case "YEARLY":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20"
      case "ONE_TIME":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20"
      default:
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch("")
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-control px-3 text-left text-sm font-normal shadow-2xs transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {selectedBudget ? (
          <div className="flex w-full min-w-0 items-center justify-between pr-1">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {(() => {
                const Icon = getBudgetIcon(selectedBudget.icon)
                const colors = getBudgetColors(selectedBudget.color)
                return (
                  <div
                    className={cn(
                      "shrink-0 rounded-md border p-1",
                      colors.bg,
                      colors.text,
                      colors.border
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                )
              })()}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <span className="truncate text-sm font-medium text-foreground">
                  {selectedBudget.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                    getIntervalColorClass(selectedBudget.interval)
                  )}
                >
                  {getLocalizedIntervalLabel(selectedBudget.interval, language)}
                </span>
                {!isStatusActive(selectedBudget.status) && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <PauseCircle className="h-2.5 w-2.5" />
                    {t("finance.pickers.budget.paused")}
                  </span>
                )}
              </div>
            </div>
            <span className="ml-2 shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">
              {formatCents(selectedBudget.limitAmount).toLocaleString(
                undefined,
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}{" "}
              {selectedBudget.currency}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {resolvedPlaceholder}
          </span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="flex w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("finance.pickers.budget.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-xl bg-muted/40 pl-8 text-xs"
            autoFocus
          />
        </div>

        <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
          {allowNone && (
            <button
              type="button"
              onClick={() => handleSelect("_none")}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                !value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span>{t("finance.pickers.budget.none")}</span>
              {!value && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          )}

          {filteredBudgets.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {t("finance.pickers.budget.noBudgetsFound")}
            </div>
          ) : (
            filteredBudgets.map((b) => {
              const Icon = getBudgetIcon(b.icon)
              const colors = getBudgetColors(b.color)
              const isSelected = b.id === value
              return (
                <button
                  key={b.id || b.name}
                  type="button"
                  onClick={() => handleSelect(b.id || "")}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-2.5 py-2 transition-colors",
                    isSelected
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-accent/60",
                    !isStatusActive(b.status) && "opacity-60"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={cn(
                        "shrink-0 rounded-lg border p-1",
                        colors.bg,
                        colors.text,
                        colors.border
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex min-w-0 flex-col text-left">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-xs font-semibold",
                            isSelected ? "text-primary" : "text-foreground"
                          )}
                        >
                          {b.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase",
                            getIntervalColorClass(b.interval)
                          )}
                        >
                          {getLocalizedIntervalLabel(b.interval, language)}
                        </span>
                      </div>
                      {!isStatusActive(b.status) && (
                        <span className="mt-0.5 flex w-max items-center gap-0.5 rounded-full border border-border/40 bg-muted px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground uppercase">
                          <PauseCircle className="h-2 w-2" />
                          {t("finance.pickers.budget.paused")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <span className="block text-xs font-bold tabular-nums">
                      {formatCents(b.limitAmount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-[9px] text-muted-foreground uppercase">
                        {b.currency}
                      </span>
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
