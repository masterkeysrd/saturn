import type { Budget } from "@/gen/saturn/finance/v1/finance"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getBudgetIcon, getBudgetColors, formatCents } from "../utils"
import { PauseCircle } from "lucide-react"

interface BudgetSelectProps {
  value: string
  onValueChange: (value: string) => void
  budgets: Budget[]
  placeholder?: string
  disabled?: boolean
  className?: string
  allowNone?: boolean
}

export function BudgetSelect({
  value,
  onValueChange,
  budgets,
  placeholder = "Select budget",
  disabled = false,
  className,
  allowNone = false,
}: BudgetSelectProps) {
  const selectedBudget =
    value && value !== "_none" ? budgets.find((b) => b.id === value) : null

  // Formatting helpers for intervals
  const getIntervalColorClass = (interval: string) => {
    switch (interval) {
      case "INTERVAL_WEEKLY":
        return "bg-teal-500/10 text-teal-500 border-teal-500/20"
      case "INTERVAL_YEARLY":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20"
      default:
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
    }
  }

  return (
    <Select
      value={selectedBudget ? value : allowNone ? "_none" : ""}
      onValueChange={(val: string | null) => {
        onValueChange(val === "_none" || !val ? "" : val)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "!h-12 w-full rounded-xl border border-border/50 bg-background/50 text-left transition-all hover:bg-background/80 focus:ring-1 focus:ring-ring",
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {selectedBudget ? (
            <div className="flex w-full items-center justify-between pr-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {(() => {
                  const Icon = getBudgetIcon(selectedBudget.icon)
                  const colors = getBudgetColors(selectedBudget.color)
                  return (
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
                  )
                })()}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {selectedBudget.name}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase",
                      getIntervalColorClass(selectedBudget.interval)
                    )}
                  >
                    {selectedBudget.interval
                      .replace("INTERVAL_", "")
                      .toLowerCase()}
                  </span>
                  {!selectedBudget.isActive && (
                    <span className="flex items-center gap-0.5 rounded-full border border-border/40 bg-muted px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground uppercase">
                      <PauseCircle className="h-2 w-2" />
                      Paused
                    </span>
                  )}
                </div>
              </div>
              <span className="ml-2 shrink-0 text-[10px] font-bold text-muted-foreground tabular-nums">
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
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px] rounded-xl border border-border/50 bg-card/95 p-1 shadow-xl backdrop-blur-xl">
        {allowNone && (
          <SelectItem
            value="_none"
            className="cursor-pointer rounded-lg py-2 pr-8 pl-3 text-xs font-semibold text-muted-foreground focus:bg-accent/80 focus:text-accent-foreground"
          >
            None / Uncategorized
          </SelectItem>
        )}
        {budgets.map((b) => {
          const Icon = getBudgetIcon(b.icon)
          const colors = getBudgetColors(b.color)
          return (
            <SelectItem
              key={b.id}
              value={b.id}
              className={cn(
                "cursor-pointer rounded-lg py-2.5 pr-8 pl-3 focus:bg-accent/80 focus:text-accent-foreground",
                !b.isActive && "opacity-60"
              )}
            >
              <div className="flex w-full items-center justify-between gap-4">
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
                      <span className="truncate text-xs font-semibold text-foreground">
                        {b.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase",
                          getIntervalColorClass(b.interval)
                        )}
                      >
                        {b.interval.replace("INTERVAL_", "").toLowerCase()}
                      </span>
                    </div>
                    {!b.isActive && (
                      <span className="mt-0.5 flex w-max items-center gap-0.5 rounded-full border border-border/40 bg-muted px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground uppercase">
                        <PauseCircle className="h-2 w-2" />
                        Paused
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs font-bold text-foreground tabular-nums">
                    {formatCents(b.limitAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-[9px] text-muted-foreground uppercase">
                      {b.currency}
                    </span>
                  </span>
                </div>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
