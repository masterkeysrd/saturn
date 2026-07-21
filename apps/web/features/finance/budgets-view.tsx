import { useState, useMemo } from "react"
import {
  type Budget,
  type ListBudgetsResponse,
  useDeleteBudgetMutation,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { Globe, DollarSign, PieChart, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BudgetCard } from "./components/budget-card"
import { CreateBudgetSheet } from "./components/create-budget-sheet"
import { EditBudgetSheet } from "./components/edit-budget-sheet"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"

export function BudgetsView() {
  const {
    spaceId,
    isWritable,
    settings,
    budgetsData,
    refetchBudgets,
    getConversionPreview,
  } = useWorkspaceFinance()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [activeBudget, setActiveBudget] = useState<Budget | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [selectedBudgetId, setSelectedBudgetId] = useState("")

  const handleAddExpenseTrigger = (budget: Budget) => {
    setSelectedBudgetId(budget.id)
    setTxOpen(true)
  }

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
      id,
      req: { id },
    })
    refetchBudgets()
  }

  const handleEditTrigger = (budget: Budget) => {
    setActiveBudget(budget)
    setEditOpen(true)
  }

  return (
    <FinancePageLayout
      title="Budgeting"
      description="Manage your template limits, recurrence tracking, and cross-currency allocation."
      actions={
        isWritable && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
          >
            Create Budget Template
          </Button>
        )
      }
    >
      <div className="mt-2 animate-in space-y-8 duration-300 fade-in">
        {/* Modern Dashboard Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-primary/10 p-3.5 text-primary">
              <PieChart className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Active Limits Total
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-foreground">
                {totalLimitBudgeted.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {settings?.baseCurrency}
                </span>
              </span>
            </div>
          </div>

          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 font-bold text-emerald-500">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Base Workspace Currency
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-foreground uppercase">
                {settings?.baseCurrency}
              </span>
            </div>
          </div>

          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-indigo-500/10 p-3.5 text-indigo-500">
              <PiggyBank className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Total Tracked Templates
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-indigo-500 dark:text-indigo-400">
                {budgetsData?.budgets?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Budget Template Cards Stream */}
        {!budgetsData?.budgets || budgetsData.budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-20 text-center shadow-inner">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground/85 shadow-sm">
              <Globe className="h-8 w-8" />
            </div>
            <h4 className="text-md font-bold text-foreground">
              No Budget Templates Configured
            </h4>
            <p className="mt-1.5 max-w-xs px-4 text-xs leading-relaxed text-muted-foreground">
              Define a budget limit template to track recurrent expenditures and
              manage conversions in your space.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {budgetsData.budgets.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                isWritable={isWritable}
                onEdit={handleEditTrigger}
                onDelete={handleDelete}
                onAddExpense={handleAddExpenseTrigger}
                onPeriodLoaded={handlePeriodLoaded}
              />
            ))}
          </div>
        )}

        {/* Create sheet modal */}
        <CreateBudgetSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          spaceId={spaceId}
          baseCurrency={settings?.baseCurrency || "USD"}
          refetchBudgets={refetchBudgets}
          getConversionPreview={getConversionPreview}
        />

        {/* Modal Sheet triggers */}
        <EditBudgetSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          activeBudget={activeBudget}
          spaceId={spaceId}
          refetchBudgets={refetchBudgets}
          getConversionPreview={getConversionPreview}
        />

        {/* Quick transaction recording slider sheet */}
        <CreateTransactionSheet
          open={txOpen}
          onOpenChange={setTxOpen}
          spaceId={spaceId}
          baseCurrency={settings?.baseCurrency || "USD"}
          budgets={budgetsData?.budgets || []}
          preselectedBudgetId={selectedBudgetId}
          refetchTransactions={() => {}} // No transactions list on this view to refetch
          refetchBudgets={refetchBudgets}
          getConversionPreview={getConversionPreview}
        />
      </div>
    </FinancePageLayout>
  )
}
