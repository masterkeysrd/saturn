import { createElement, useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useUrlState } from "@/lib/use-url-state"
import { useSpacePermissions } from "@/features/space/use-space"
import { buildCopilotEntityKey, convertCentsToBase } from "@saturn/core"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { invalidateFinanceQueries, useI18n, useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import {
  type Budget,
  type Budget_Status,
  useDeleteBudgetMutation,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListBudgetsQuery,
  useListExchangeRatesQuery,
  useUpdateBudgetMutation,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import {
  Globe,
  PieChart,
  Gauge,
  Wallet,
  LayoutGrid,
  List,
  MoreVertical,
  History,
  Plus,
  PauseCircle,
  PlayCircle,
  Lock,
  Unlock,
  Edit2,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MoneyAmount } from "@/components/ui/money-amount"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { BudgetCard } from "./components/budget-card"
import { CreateBudgetSheet } from "./components/create-budget-sheet"
import { EditBudgetSheet } from "./components/edit-budget-sheet"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"
import { BudgetHistorySheet } from "./components/budget-history-sheet"
import {
  computeBudgetPacePercent,
  getBudgetColors,
  getBudgetIcon,
  isStatusActive,
} from "./utils"
import { toast } from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const BUDGETS_URL_DEFAULTS = {
  layout: "grid" as string,
}

const STATUS_ACTION_KEYS = {
  PAUSED: {
    action: "finance.budgets.actionPaused",
    fail: "finance.budgets.actionFailPaused",
    status: "finance.budgets.status.paused",
  },
  ACTIVE_RESUME: {
    action: "finance.budgets.actionResumed",
    fail: "finance.budgets.actionFailResumed",
    status: "finance.budgets.status.active",
  },
  CLOSED: {
    action: "finance.budgets.actionClosed",
    fail: "finance.budgets.actionFailClosed",
    status: "finance.budgets.status.closed",
  },
  ACTIVE_REOPEN: {
    action: "finance.budgets.actionReopened",
    fail: "finance.budgets.actionFailReopened",
    status: "finance.budgets.status.active",
  },
} as const

export function BudgetsView() {
  const queryClient = useQueryClient()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const [urlState, setUrlState] = useUrlState(BUDGETS_URL_DEFAULTS)
  const layoutMode: "grid" | "table" =
    urlState.layout === "table" ? "table" : "grid"

  const { data: settings } = useGetSettingsQuery({}, { enabled: !!spaceId })
  const baseCurrency = settings?.baseCurrency || "USD"

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const exchangeRates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )

  const [statusFilter, setStatusFilter] = useState<
    "ACTIVE" | "PAUSED" | "CLOSED" | "ALL"
  >("ACTIVE")

  const statusesParam = useMemo<Budget_Status[]>(() => {
    if (statusFilter === "ALL") return ["ACTIVE", "PAUSED", "CLOSED"]
    return [statusFilter]
  }, [statusFilter])

  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL", statuses: statusesParam },
    { enabled: !!settings }
  )
  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  const accountsById = useMemo(() => {
    const map = new Map<string, (typeof accounts)[number]>()
    accounts.forEach((acc) => {
      if (acc.id) map.set(acc.id, acc)
    })
    return map
  }, [accounts])

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeBudget, setActiveBudget] = useState<Budget | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [selectedBudgetId, setSelectedBudgetId] = useState("")

  const handleAddExpenseTrigger = (budget: Budget) => {
    setSelectedBudgetId(budget.id || "")
    setTxOpen(true)
  }

  const handleViewHistoryTrigger = (budget: Budget) => {
    setActiveBudget(budget)
    setHistoryOpen(true)
  }

  // Compute Period Budget Summary KPIs in baseCurrency
  const summaryStats = useMemo(() => {
    const now = tz.now()
    let totalBudgetedCents = 0
    let totalSpentCents = 0
    let activeCount = 0
    let aheadOfPaceCount = 0

    for (const b of budgets) {
      if (!isStatusActive(b.status)) continue
      activeCount++

      const limitBase = b.currentPeriod?.limitInBase
        ? Number(b.currentPeriod.limitInBase)
        : convertCentsToBase(
            b.limitAmount,
            b.currency,
            baseCurrency,
            exchangeRates
          )

      const spentBase = b.currentPeriod?.spentInBase
        ? Number(b.currentPeriod.spentInBase)
        : convertCentsToBase(
            b.currentPeriod?.spentAmount || 0,
            b.currency,
            baseCurrency,
            exchangeRates
          )

      totalBudgetedCents += limitBase
      totalSpentCents += spentBase

      const limitLocal = Number(b.limitAmount || 0)
      const spentLocal = Number(b.currentPeriod?.spentAmount || 0)
      const actualPct = limitLocal > 0 ? (spentLocal / limitLocal) * 100 : 0
      const pacePct = computeBudgetPacePercent(b, now)

      if (
        (limitLocal > 0 && spentLocal > limitLocal) ||
        (pacePct !== null && actualPct - pacePct > 5)
      ) {
        aheadOfPaceCount++
      }
    }

    const remainingCents = totalBudgetedCents - totalSpentCents
    const spentPct =
      totalBudgetedCents > 0
        ? Math.round((totalSpentCents / totalBudgetedCents) * 100)
        : 0

    return {
      totalBudgetedCents,
      totalSpentCents,
      remainingCents,
      spentPct,
      activeCount,
      aheadOfPaceCount,
    }
  }, [budgets, baseCurrency, exchangeRates, tz])

  const handlePeriodLoaded = () => {}

  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const deleteMutation = useDeleteBudgetMutation()

  const handleDelete = (budget: Budget) => {
    setDeleteTarget(budget)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteMutation.mutateAsync({
        id: deleteTarget.id || "",
        req: {
          id: deleteTarget.id || "",
          version: deleteTarget.version,
        },
      })
      toast.add({
        type: "success",
        title: t("finance.budgets.deletedTitle"),
        description: t("finance.budgets.deletedDescription", {
          name: deleteTarget.name || "",
        }),
      })
      setDeleteTarget(null)
      await invalidateFinanceQueries(queryClient)
    } catch (err) {
      toast.add({
        type: "error",
        title: t("finance.budgets.deleteFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.budgets.deleteFailedDescription"),
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const updateMutation = useUpdateBudgetMutation()

  const handleUpdateStatus = async (
    budget: Budget,
    newStatus: "ACTIVE" | "PAUSED" | "CLOSED",
    actionKeys: (typeof STATUS_ACTION_KEYS)[keyof typeof STATUS_ACTION_KEYS]
  ) => {
    if (!budget.id) return
    try {
      await updateMutation.mutateAsync({
        id: budget.id,
        req: {
          id: budget.id,
          version: budget.version,
          budget: {
            ...budget,
            status: newStatus,
          },
          propagation: "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
          updateMask: { paths: ["status"] },
        },
      })
      toast.add({
        type: "success",
        title: t("finance.budgets.statusChangedTitle", {
          action: t(actionKeys.action),
        }),
        description: t("finance.budgets.statusChangedDescription", {
          name: budget.name || "",
          status: t(actionKeys.status),
        }),
      })
      await invalidateFinanceQueries(queryClient)
    } catch (err) {
      toast.add({
        type: "error",
        title: t("finance.budgets.statusFailedTitle", {
          action: t(actionKeys.fail),
        }),
        description:
          err instanceof Error
            ? err.message
            : t("finance.budgets.unexpectedError"),
      })
    }
  }

  const handlePause = (budget: Budget) =>
    handleUpdateStatus(budget, "PAUSED", STATUS_ACTION_KEYS.PAUSED)
  const handleResume = (budget: Budget) =>
    handleUpdateStatus(budget, "ACTIVE", STATUS_ACTION_KEYS.ACTIVE_RESUME)
  const handleClose = (budget: Budget) =>
    handleUpdateStatus(budget, "CLOSED", STATUS_ACTION_KEYS.CLOSED)
  const handleReopen = (budget: Budget) =>
    handleUpdateStatus(budget, "ACTIVE", STATUS_ACTION_KEYS.ACTIVE_REOPEN)

  const handleEditTrigger = (budget: Budget) => {
    setActiveBudget(budget)
    setEditOpen(true)
  }

  useRegisterCopilotView({
    viewId: "finance.budgets",
    title: t("finance.budgets.copilotTitle"),
    suggestions: [
      t("finance.budgets.suggestion.pacingAhead"),
      t("finance.budgets.suggestion.activeLimits"),
      t("finance.budgets.suggestion.adjustments"),
    ],
  })

  const now = tz.now()

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-w-0 flex-1">
        <FinancePageLayout
          title={t("finance.budgets.title")}
          description={t("finance.budgets.description")}
          actions={
            isWritable && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 font-medium sm:w-auto"
              >
                {t("finance.budgets.createTemplate")}
              </Button>
            )
          }
        >
          <div className="space-y-6">
            {/* Period Budget Summary KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-5 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PieChart className="size-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("finance.budgets.totalBudgeted")}
                  </span>
                  <MoneyAmount
                    cents={summaryStats.totalBudgetedCents}
                    currency={baseCurrency}
                    size="xl"
                    className="mt-0.5 block truncate text-foreground"
                  />
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {summaryStats.activeCount === 1
                      ? t("finance.budgets.activeTemplatesCountOne")
                      : t("finance.budgets.activeTemplatesCount", {
                          count: summaryStats.activeCount,
                        })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-5 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                  <Wallet className="size-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("finance.budgets.totalSpent")}
                  </span>
                  <MoneyAmount
                    cents={summaryStats.totalSpentCents}
                    currency={baseCurrency}
                    size="xl"
                    className="mt-0.5 block truncate text-foreground"
                  />
                  <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">
                    {t("finance.budgets.pctOfTotalLimit", {
                      pct: summaryStats.spentPct,
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-5 shadow-2xs">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg",
                    summaryStats.aheadOfPaceCount > 0
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                  )}
                >
                  <Gauge className="size-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("finance.budgets.remainingAndPace")}
                  </span>
                  <MoneyAmount
                    cents={summaryStats.remainingCents}
                    currency={baseCurrency}
                    size="xl"
                    colored={summaryStats.remainingCents < 0}
                    className="mt-0.5 block truncate text-foreground"
                  />
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {summaryStats.aheadOfPaceCount > 0
                      ? t("finance.budgets.aheadOfPace", {
                          count: summaryStats.aheadOfPaceCount,
                        })
                      : t("finance.budgets.allOnPace")}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter & View Toggle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs
                value={statusFilter}
                onValueChange={(val) =>
                  setStatusFilter(val as "ACTIVE" | "PAUSED" | "CLOSED" | "ALL")
                }
              >
                <TabsList className="rounded-lg bg-muted/60 p-1">
                  {(["ACTIVE", "PAUSED", "CLOSED", "ALL"] as const).map(
                    (st) => (
                      <TabsTrigger
                        key={st}
                        value={st}
                        className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium data-active:bg-card data-active:text-foreground data-active:shadow-2xs"
                      >
                        {st === "ALL"
                          ? t("finance.budgets.allBudgets")
                          : getLocalizedEnumLabel(
                              "finance",
                              "status",
                              st,
                              language
                            )}
                      </TabsTrigger>
                    )
                  )}
                </TabsList>
              </Tabs>

              {/* Grid / Table View Toggle */}
              <div
                role="group"
                aria-label={t("finance.budgets.layoutView")}
                className="flex items-center rounded-lg bg-muted/60 p-1"
              >
                <button
                  type="button"
                  aria-label={t("finance.budgets.gridView")}
                  aria-pressed={layoutMode === "grid"}
                  onClick={() => setUrlState({ layout: "grid" })}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    layoutMode === "grid"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="size-3.5" />
                  <span>{t("finance.budgets.grid")}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("finance.budgets.tableView")}
                  aria-pressed={layoutMode === "table"}
                  onClick={() => setUrlState({ layout: "table" })}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    layoutMode === "table"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="size-3.5" />
                  <span>{t("finance.budgets.table")}</span>
                </button>
              </div>
            </div>

            {/* Budgets Content: Empty, Grid, or Table */}
            {budgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Globe className="size-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  {t("finance.budgets.emptyTitle")}
                </h4>
                <p className="mt-1 max-w-xs px-4 text-xs leading-relaxed text-muted-foreground">
                  {t("finance.budgets.emptyDescription")}
                </p>
              </div>
            ) : layoutMode === "table" ? (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-3">
                        {t("finance.budgets.thBudget")}
                      </th>
                      <th className="px-4 py-3">
                        {t("finance.budgets.thInterval")}
                      </th>
                      <th className="px-4 py-3">
                        {t("finance.budgets.thAccount")}
                      </th>
                      <th className="px-4 py-3 text-right">
                        {t("finance.budgets.thSpent")}
                      </th>
                      <th className="px-4 py-3 text-right">
                        {t("finance.budgets.thLimit")}
                      </th>
                      <th className="px-4 py-3 text-right">
                        {t("finance.budgets.thRemaining")}
                      </th>
                      <th className="min-w-[160px] px-4 py-3">
                        {t("finance.budgets.thPace")}
                      </th>
                      <th className="px-4 py-3 text-right">
                        {t("finance.budgets.thActions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {budgets.map((b) => {
                      const account = b.defaultAccountId
                        ? accountsById.get(b.defaultAccountId)
                        : undefined
                      const themeColors = getBudgetColors(b.color)
                      const limitCents = Number(b.limitAmount || 0)
                      const spentCents = Number(
                        b.currentPeriod?.spentAmount || 0
                      )
                      const remainingCents = limitCents - spentCents
                      const isOverBudget =
                        limitCents > 0 && spentCents > limitCents
                      const progressPct =
                        limitCents > 0
                          ? Math.min((spentCents / limitCents) * 100, 100)
                          : 0
                      const actualPct =
                        limitCents > 0
                          ? Math.round((spentCents / limitCents) * 100)
                          : 0
                      const isNearLimit = !isOverBudget && actualPct >= 85
                      const pacePercent = computeBudgetPacePercent(b, now)
                      const isClosed = b.status === "CLOSED"
                      const isPaused = b.status === "PAUSED"
                      const isActive = b.status === "ACTIVE" || !b.status

                      return (
                        <tr
                          key={b.id}
                          tabIndex={0}
                          onClick={() => handleViewHistoryTrigger(b)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              handleViewHistoryTrigger(b)
                            }
                          }}
                          className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={cn(
                                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                                  themeColors.bg,
                                  themeColors.text,
                                  themeColors.border
                                )}
                              >
                                {createElement(getBudgetIcon(b.icon), {
                                  className: "size-4",
                                })}
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate font-medium text-foreground">
                                  {b.name}
                                </span>
                                {(isClosed || isPaused) && (
                                  <span className="text-xs text-muted-foreground">
                                    {getLocalizedEnumLabel(
                                      "finance",
                                      "status",
                                      b.status,
                                      language
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/80">
                              {getLocalizedEnumLabel(
                                "finance",
                                "interval",
                                b.interval,
                                language
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {account?.name || "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MoneyAmount
                              cents={spentCents}
                              currency={b.currency}
                              size="sm"
                              className="text-foreground"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MoneyAmount
                              cents={limitCents}
                              currency={b.currency}
                              size="sm"
                              className="text-muted-foreground"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MoneyAmount
                              cents={remainingCents}
                              currency={b.currency}
                              size="sm"
                              colored={remainingCents < 0}
                              className={
                                remainingCents >= 0
                                  ? "text-foreground"
                                  : undefined
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1 py-1">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      isOverBudget
                                        ? "bg-destructive"
                                        : isNearLimit
                                          ? "bg-warning"
                                          : themeColors.bar
                                    )}
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                                {pacePercent !== null && (
                                  <div
                                    title={t("finance.budgets.paceTick", {
                                      pct: Math.round(pacePercent),
                                    })}
                                    className="pointer-events-none absolute top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70 ring-1 ring-card"
                                    style={{ left: `${pacePercent}%` }}
                                  />
                                )}
                              </div>
                              <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
                                {actualPct}%
                              </span>
                            </div>
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              {b.id && (
                                <CopilotAttachButton
                                  item={{
                                    key: buildCopilotEntityKey("budget", b.id),
                                    kind: "budget",
                                    id: b.id,
                                    label:
                                      b.name ||
                                      t("finance.budgets.copilotFallback"),
                                    summary: {
                                      currency: b.currency,
                                      limitAmount: Number(b.limitAmount || 0),
                                      interval: b.interval,
                                      status: b.status,
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
                                      aria-label={t(
                                        "finance.budgets.budgetActionsAria",
                                        {
                                          name: b.name || "",
                                        }
                                      )}
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
                                    onClick={() => handleViewHistoryTrigger(b)}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                                  >
                                    <History className="size-3.5" />
                                    {t("finance.budgets.viewActivity")}
                                  </DropdownMenuItem>
                                  {isWritable && (
                                    <>
                                      {isActive && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleAddExpenseTrigger(b)
                                          }
                                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                                        >
                                          <Plus className="size-3.5" />
                                          {t("finance.budgets.recordExpense")}
                                        </DropdownMenuItem>
                                      )}
                                      {isActive && (
                                        <DropdownMenuItem
                                          onClick={() => handlePause(b)}
                                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-warning"
                                        >
                                          <PauseCircle className="size-3.5" />
                                          {t("finance.budgets.pauseBudget")}
                                        </DropdownMenuItem>
                                      )}
                                      {isPaused && (
                                        <DropdownMenuItem
                                          onClick={() => handleResume(b)}
                                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-success"
                                        >
                                          <PlayCircle className="size-3.5" />
                                          {t("finance.budgets.resumeBudget")}
                                        </DropdownMenuItem>
                                      )}
                                      {!isClosed && (
                                        <DropdownMenuItem
                                          onClick={() => handleClose(b)}
                                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-warning"
                                        >
                                          <Lock className="size-3.5" />
                                          {t("finance.budgets.closeBudget")}
                                        </DropdownMenuItem>
                                      )}
                                      {isClosed && (
                                        <DropdownMenuItem
                                          onClick={() => handleReopen(b)}
                                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-success"
                                        >
                                          <Unlock className="size-3.5" />
                                          {t("finance.budgets.reopenBudget")}
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator className="my-1 border-border/60" />
                                      <DropdownMenuItem
                                        onClick={() => handleEditTrigger(b)}
                                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                                      >
                                        <Edit2 className="size-3.5" />
                                        {t("finance.budgets.editTemplate")}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleDelete(b)}
                                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
                                      >
                                        <Trash2 className="size-3.5" />
                                        {t("finance.budgets.delete")}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {budgets.map((b) => (
                  <BudgetCard
                    key={b.id}
                    budget={b}
                    account={
                      b.defaultAccountId
                        ? accountsById.get(b.defaultAccountId)
                        : undefined
                    }
                    isWritable={isWritable}
                    onEdit={handleEditTrigger}
                    onDelete={handleDelete}
                    onPause={handlePause}
                    onResume={handleResume}
                    onClose={handleClose}
                    onReopen={handleReopen}
                    onAddExpense={handleAddExpenseTrigger}
                    onPeriodLoaded={handlePeriodLoaded}
                    onViewHistory={handleViewHistoryTrigger}
                  />
                ))}
              </div>
            )}

            <CreateBudgetSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              spaceId={spaceId}
              baseCurrency={settings?.baseCurrency || "USD"}
              accounts={accounts}
            />

            <EditBudgetSheet
              open={editOpen}
              onOpenChange={setEditOpen}
              activeBudget={activeBudget}
              spaceId={spaceId}
              accounts={accounts}
              baseCurrency={settings?.baseCurrency || "USD"}
            />

            <CreateTransactionSheet
              open={txOpen}
              onOpenChange={setTxOpen}
              spaceId={spaceId}
              baseCurrency={settings?.baseCurrency || "USD"}
              budgets={budgets}
              accounts={accounts}
              preselectedBudgetId={selectedBudgetId}
            />

            <AlertDialog
              open={!!deleteTarget}
              onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("finance.budgets.deleteTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("finance.budgets.deleteDescription", {
                      name: deleteTarget?.name || "",
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    {t("common.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={isDeleting}
                    onClick={handleConfirmDelete}
                  >
                    {isDeleting
                      ? t("finance.budgets.deleting")
                      : t("finance.budgets.deleteConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </FinancePageLayout>
      </div>

      <BudgetHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        budget={activeBudget}
      />
    </div>
  )
}
