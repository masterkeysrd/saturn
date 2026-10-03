import { createElement } from "react"
import {
  type Account,
  type Budget,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  PauseCircle,
  PlayCircle,
  MoreVertical,
  Edit2,
  Trash2,
  Plus,
  History,
  Lock,
  Unlock,
  CreditCard,
} from "lucide-react"
import { getBudgetColors, getBudgetIcon, formatInterval } from "../utils"
import { BudgetPeriodProgress } from "./budget-period-progress"
import { cn } from "@/lib/utils"

interface BudgetCardProps {
  budget: Budget
  account?: Account
  isWritable: boolean
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
  onPause?: (budget: Budget) => void
  onResume?: (budget: Budget) => void
  onClose?: (budget: Budget) => void
  onReopen?: (budget: Budget) => void
  onPeriodLoaded: (budgetId: string, limitInBase: number) => void
  onAddExpense?: (budget: Budget) => void
  onViewHistory: (budget: Budget) => void
}

export function BudgetCard({
  budget,
  account,
  isWritable,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onClose,
  onReopen,
  onPeriodLoaded,
  onAddExpense,
  onViewHistory,
}: BudgetCardProps) {
  const themeColors = getBudgetColors(budget.color)
  const isClosed = budget.status === "CLOSED"
  const isPaused = budget.status === "PAUSED"
  const isActive = budget.status === "ACTIVE" || !budget.status

  const intervalColorClass =
    budget.interval === "WEEKLY"
      ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20"
      : budget.interval === "YEARLY"
        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
        : budget.interval === "ONE_TIME"
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"

  const intervalLabel = formatInterval(budget.interval)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewHistory(budget)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onViewHistory(budget)
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-5.5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-border/80 hover:shadow-xl",
        isPaused && "border-amber-500/20 bg-card/40 opacity-90",
        isClosed && "border-border/30 bg-card/25 opacity-70 grayscale-[0.3]"
      )}
    >
      {/* Ambient Theme Color Sheen & Watermark */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-15 blur-3xl transition-opacity group-hover:opacity-30 dark:opacity-25 dark:group-hover:opacity-40"
        style={{ backgroundColor: themeColors.hex }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.04] via-transparent to-white/[0.01]" />

      <div className="relative z-10 flex flex-1 flex-col justify-between">
        {/* Header: Icon, Name, Badges, and Dropdown */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                "shrink-0 rounded-2xl border p-2.5 transition-transform duration-200 group-hover:scale-105",
                themeColors.bg,
                themeColors.text,
                themeColors.border
              )}
            >
              {createElement(getBudgetIcon(budget.icon), {
                className: "h-5 w-5 shrink-0",
              })}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                title={budget.name}
                className="truncate text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary"
              >
                {budget.name}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                    intervalColorClass
                  )}
                >
                  {intervalLabel}
                </span>

                {account && (
                  <span
                    title={`Default Account: ${account.name}`}
                    className="flex max-w-[140px] items-center gap-1 truncate rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <CreditCard className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{account.name}</span>
                  </span>
                )}

                {isClosed ? (
                  <span className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase dark:text-rose-400">
                    <Lock className="h-2.5 w-2.5" />
                    Closed
                  </span>
                ) : isPaused ? (
                  <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 uppercase dark:text-amber-400">
                    <PauseCircle className="h-2.5 w-2.5" />
                    Paused
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-48 rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl"
              >
                <DropdownMenuItem
                  onClick={() => onViewHistory(budget)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                >
                  <History className="h-3.5 w-3.5" />
                  View Activity
                </DropdownMenuItem>

                {isWritable && (
                  <>
                    {onAddExpense && isActive && (
                      <DropdownMenuItem
                        onClick={() => onAddExpense(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Record Expense
                      </DropdownMenuItem>
                    )}
                    {isActive && onPause && (
                      <DropdownMenuItem
                        onClick={() => onPause(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      >
                        <PauseCircle className="h-3.5 w-3.5 text-amber-500" />
                        Pause Budget
                      </DropdownMenuItem>
                    )}
                    {isPaused && onResume && (
                      <DropdownMenuItem
                        onClick={() => onResume(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                      >
                        <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
                        Resume Budget
                      </DropdownMenuItem>
                    )}
                    {!isClosed && onClose && (
                      <DropdownMenuItem
                        onClick={() => onClose(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Close Budget
                      </DropdownMenuItem>
                    )}
                    {isClosed && onReopen && (
                      <DropdownMenuItem
                        onClick={() => onReopen(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                      >
                        <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                        Reopen Budget
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="my-1 border-border/40" />
                    <DropdownMenuItem
                      onClick={() => onEdit(budget)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(budget)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Period Details & Metrics */}
        <BudgetPeriodProgress
          budget={budget}
          onPeriodLoaded={(limitInBase) =>
            onPeriodLoaded(budget.id || "", limitInBase)
          }
        />
      </div>
    </div>
  )
}
