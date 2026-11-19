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
import { buildCopilotEntityKey } from "@saturn/core"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
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
        "group flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-2xs transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/40",
        isPaused && "border-warning/30 opacity-90",
        isClosed && "opacity-75"
      )}
    >
      <div className="flex flex-1 flex-col justify-between">
        {/* Header: Icon, Name, Badges, and Dropdown */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                "shrink-0 rounded-lg border p-2",
                themeColors.bg,
                themeColors.text,
                themeColors.border
              )}
            >
              {createElement(getBudgetIcon(budget.icon), {
                className: "size-5 shrink-0",
              })}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                title={budget.name}
                className="truncate text-[15px] font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary"
              >
                {budget.name}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
                  {intervalLabel}
                </span>

                {account && (
                  <span
                    title={`Default Account: ${account.name}`}
                    className="inline-flex max-w-[150px] items-center gap-1 truncate rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    <CreditCard className="size-3 shrink-0" />
                    <span className="truncate">{account.name}</span>
                  </span>
                )}

                {isClosed ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    <Lock className="size-3" />
                    Closed
                  </span>
                ) : isPaused ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                    <PauseCircle className="size-3" />
                    Paused
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {budget.id && (
              <CopilotAttachButton
                item={{
                  key: buildCopilotEntityKey("budget", budget.id),
                  kind: "budget",
                  id: budget.id,
                  label: budget.name || "Budget",
                  summary: {
                    currency: budget.currency,
                    limitAmount: Number(budget.limitAmount || 0),
                    interval: budget.interval,
                    status: budget.status,
                  },
                }}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Budget actions"
                    className="cursor-pointer rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-48 rounded-xl border border-border bg-popover p-1 shadow-xl"
              >
                <DropdownMenuItem
                  onClick={() => onViewHistory(budget)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                >
                  <History className="size-3.5" />
                  View Activity
                </DropdownMenuItem>

                {isWritable && (
                  <>
                    {onAddExpense && isActive && (
                      <DropdownMenuItem
                        onClick={() => onAddExpense(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                      >
                        <Plus className="size-3.5" />
                        Record Expense
                      </DropdownMenuItem>
                    )}
                    {isActive && onPause && (
                      <DropdownMenuItem
                        onClick={() => onPause(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-warning"
                      >
                        <PauseCircle className="size-3.5" />
                        Pause Budget
                      </DropdownMenuItem>
                    )}
                    {isPaused && onResume && (
                      <DropdownMenuItem
                        onClick={() => onResume(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-success"
                      >
                        <PlayCircle className="size-3.5" />
                        Resume Budget
                      </DropdownMenuItem>
                    )}
                    {!isClosed && onClose && (
                      <DropdownMenuItem
                        onClick={() => onClose(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-warning"
                      >
                        <Lock className="size-3.5" />
                        Close Budget
                      </DropdownMenuItem>
                    )}
                    {isClosed && onReopen && (
                      <DropdownMenuItem
                        onClick={() => onReopen(budget)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-success"
                      >
                        <Unlock className="size-3.5" />
                        Reopen Budget
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="my-1 border-border/60" />
                    <DropdownMenuItem
                      onClick={() => onEdit(budget)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                    >
                      <Edit2 className="size-3.5" />
                      Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(budget)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
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
