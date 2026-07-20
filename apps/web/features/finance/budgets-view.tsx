import { useState, useMemo } from "react"
import {
  type Budget,
  type FinanceSettings,
  type ListBudgetsResponse,
  useDeleteBudgetMutation,
} from "@/gen/saturn/finance/v1/finance"
import { Separator } from "@/components/ui/separator"
import { Globe, DollarSign, PieChart, PiggyBank } from "lucide-react"
import { BudgetCard } from "./components/budget-card"
import { CreateBudgetSheet } from "./components/create-budget-sheet"
import { EditBudgetSheet } from "./components/edit-budget-sheet"

interface BudgetsViewProps {
  spaceId: string
  isWritable: boolean
  settings: FinanceSettings | undefined
  budgetsData: ListBudgetsResponse | undefined
  budgetsLoading: boolean
  refetchBudgets: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function BudgetsView({
  spaceId,
  isWritable,
  settings,
  budgetsData,
  budgetsLoading,
  refetchBudgets,
  getConversionPreview,
}: BudgetsViewProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [activeBudget, setActiveBudget] = useState<Budget | null>(null)

  // Track aggregated base currency budget total in client memory
  const [aggregatedLimits, setAggregatedLimits] = useState<
    Record<string, number>
  >({})

  const [prevBudgetsData, setPrevBudgetsData] = useState<
    ListBudgetsResponse | undefined
  >(undefined)

  if (budgetsData !== prevBudgetsData) {
    setPrevBudgetsData(budgetsData)
    setAggregatedLimits({})
  }

  // Aggregate limits total in base currency
  const totalLimitBudgeted = useMemo(() => {
    return Object.values(aggregatedLimits).reduce((acc, curr) => acc + curr, 0)
  }, [aggregatedLimits])

  const handlePeriodLoaded = (budgetId: string, limitInBase: number) => {
    setAggregatedLimits((prev) => {
      if (prev[budgetId] === limitInBase) return prev
      return { ...prev, [budgetId]: limitInBase }
    })
  }

  const deleteMutation = useDeleteBudgetMutation()

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this budget?")) return
    await deleteMutation.mutateAsync({
      space_id: spaceId,
      id,
      req: { spaceId, id },
    })
    refetchBudgets()
  }

  const handleEditTrigger = (budget: Budget) => {
    setActiveBudget(budget)
    setEditOpen(true)
  }

  return (
    <div className="animate-in space-y-8 duration-300 fade-in">
      {isWritable && (
        <div className="mb-6 flex justify-end">
          <CreateBudgetSheet
            open={createOpen}
            onOpenChange={setCreateOpen}
            spaceId={spaceId}
            baseCurrency={settings?.baseCurrency || "USD"}
            refetchBudgets={refetchBudgets}
            getConversionPreview={getConversionPreview}
          />
        </div>
      )}

      {/* Modern Dashboard Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Stat card 1 */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
          <div className="rounded-2xl bg-indigo-500/10 p-3.5 text-indigo-500">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Reporting Currency
            </span>
            <span className="mt-0.5 block text-xl font-extrabold text-foreground">
              {settings?.baseCurrency}
            </span>
          </div>
        </div>

        {/* Stat card 2 */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
          <div className="rounded-2xl bg-emerald-500/10 p-3.5 text-emerald-500">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Total Allocated
            </span>
            <span className="mt-0.5 block text-xl font-extrabold text-foreground">
              {totalLimitBudgeted.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-muted-foreground">
                {settings?.baseCurrency}
              </span>
            </span>
          </div>
        </div>

        {/* Stat card 3 */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
          <div className="rounded-2xl bg-amber-500/10 p-3.5 text-amber-500">
            <PieChart className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Active Templates
            </span>
            <span className="mt-0.5 block text-xl font-extrabold text-foreground">
              {budgetsData?.budgets.filter((b) => b.isActive).length ?? 0}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {budgetsData?.budgets.length ?? 0}
              </span>
            </span>
          </div>
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Budgets Grid */}
      {budgetsLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 animate-pulse rounded-3xl border border-border/20 bg-muted/20"
            ></div>
          ))}
        </div>
      ) : budgetsData?.budgets.length === 0 ? (
        <div className="flex animate-in flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-24 text-center shadow-inner fade-in">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground/80 shadow-sm">
            <PiggyBank className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-foreground">
            No Budgets Configured
          </h3>
          <p className="mt-2 max-w-sm px-4 text-sm leading-relaxed text-muted-foreground">
            Get started by creating your first recurring budget template for
            groceries, entertainment, or utilities.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 select-none md:grid-cols-2 lg:grid-cols-3">
          {budgetsData?.budgets.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              isWritable={isWritable}
              spaceId={spaceId}
              onEdit={handleEditTrigger}
              onDelete={handleDelete}
              onPeriodLoaded={handlePeriodLoaded}
            />
          ))}
        </div>
      )}

      {/* Edit Budget Slider Sheet */}
      <EditBudgetSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        activeBudget={activeBudget}
        spaceId={spaceId}
        refetchBudgets={refetchBudgets}
        getConversionPreview={getConversionPreview}
      />
    </div>
  )
}
