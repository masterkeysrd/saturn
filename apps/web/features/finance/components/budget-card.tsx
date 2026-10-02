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
import { getBudgetColors, getBudgetIcon, formatAmount } from "../utils"
import { BudgetPeriodProgress } from "./budget-period-progress"

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
  const intervalColorClass =
    budget.interval === "WEEKLY"
      ? "bg-teal-500/10 text-teal-500 border-teal-500/20"
      : budget.interval === "YEARLY"
        ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
        : budget.interval === "ONE_TIME"
          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
          : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"

  const intervalLabel =
    budget.interval === "ONE_TIME"
      ? "One-Time"
      : budget.interval.replace("INTERVAL_", "").toLowerCase()

  const isClosed = budget.status === "CLOSED"
  const isPaused = budget.status === "PAUSED"
  const isActive = budget.status === "ACTIVE" || !budget.status

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 transition-all duration-300 hover:border-border/60 hover:shadow-xl ${
        !isActive ? "bg-card/25 opacity-75" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-2xl p-2.5 ${getBudgetColors(budget.color).bg} ${getBudgetColors(budget.color).text} border ${getBudgetColors(budget.color).border} shrink-0`}
          >
            {createElement(getBudgetIcon(budget.icon), {
              className: "h-5 w-5 shrink-0",
            })}
          </div>
          <div>
            <h3 className="max-w-[130px] truncate text-sm leading-tight font-bold text-foreground transition-colors group-hover:text-primary sm:max-w-[150px]">
              {budget.name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${intervalColorClass}`}
              >
                {intervalLabel}
              </span>
              {account && (
                <span
                  title={`Default Account: ${account.name}`}
                  className="flex max-w-[130px] items-center gap-1 truncate rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  <CreditCard className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{account.name}</span>
                </span>
              )}
              {isClosed ? (
                <span className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 uppercase">
                  <Lock className="h-3 w-3" />
                  Closed
                </span>
              ) : isPaused ? (
                <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase">
                  <PauseCircle className="h-3 w-3" />
                  Paused
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-base font-black tracking-tight text-foreground">
            {formatAmount(budget.limitAmount, budget.currency)}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 h-8 w-8 cursor-pointer rounded-full hover:bg-muted/80"
                >
                  <MoreVertical className="h-4.5 w-4.5 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
              <DropdownMenuItem
                onClick={() => onViewHistory(budget)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
              >
                <History className="h-3.5 w-3.5" />
                View History
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
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <PauseCircle className="h-3.5 w-3.5 text-amber-500" />
                      Pause Budget
                    </DropdownMenuItem>
                  )}
                  {isPaused && onResume && (
                    <DropdownMenuItem
                      onClick={() => onResume(budget)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
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
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                      Reopen Budget
                    </DropdownMenuItem>
                  )}
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

      {/* Spawned period details wrapper */}
      {isActive && (
        <BudgetPeriodProgress
          budget={budget}
          onPeriodLoaded={(limitInBase) =>
            onPeriodLoaded(budget.id || "", limitInBase)
          }
        />
      )}
    </div>
  )
}
