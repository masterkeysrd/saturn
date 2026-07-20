import { createElement } from "react"
import { type Budget } from "@/gen/saturn/finance/v1/finance"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { PauseCircle, MoreVertical, Edit2, Trash2 } from "lucide-react"
import { getBudgetColors, getBudgetIcon, formatCents } from "../utils"
import { BudgetPeriodProgress } from "./budget-period-progress"

interface BudgetCardProps {
  budget: Budget
  isWritable: boolean
  spaceId: string
  onEdit: (budget: Budget) => void
  onDelete: (id: string) => void
  onPeriodLoaded: (budgetId: string, limitInBase: number) => void
}

export function BudgetCard({
  budget,
  isWritable,
  spaceId,
  onEdit,
  onDelete,
  onPeriodLoaded,
}: BudgetCardProps) {
  const intervalColorClass =
    budget.interval === "INTERVAL_WEEKLY"
      ? "bg-teal-500/10 text-teal-500 border-teal-500/20"
      : budget.interval === "INTERVAL_YEARLY"
        ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
        : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 transition-all duration-300 hover:border-border/60 hover:shadow-xl ${
        !budget.isActive ? "bg-card/25 opacity-75" : ""
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
            <div className="mt-1.5 flex gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${intervalColorClass}`}
              >
                {budget.interval.replace("INTERVAL_", "").toLowerCase()}
              </span>
              {!budget.isActive && (
                <span className="flex items-center gap-1 rounded-full border border-border/40 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                  <PauseCircle className="h-3 w-3" />
                  Paused
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-base font-black tracking-tight text-foreground">
            {formatCents(budget.limitAmount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase">
            {budget.currency}
          </span>

          {isWritable && (
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
                  onClick={() => onEdit(budget)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted/60"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit Template
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(budget.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Spawned period details wrapper */}
      {budget.isActive && (
        <BudgetPeriodProgress
          spaceId={spaceId}
          budget={budget}
          onPeriodLoaded={(limitInBase) =>
            onPeriodLoaded(budget.id, limitInBase)
          }
        />
      )}
    </div>
  )
}
