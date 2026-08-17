import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  useListStatementsQuery,
  useListStatementLinesQuery,
  useUpdateStatementLineMutation,
  useUpdateStatementMutation,
  useCompleteStatementMutation,
  useDeleteStatementMutation,
  useListAccountsQuery,
  useListBudgetsQuery,
  useListBorrowingsQuery,
  useListScheduledTransactionsQuery,
  type StatementLine,
  type Statement,
} from "@/gen/saturn/finance/v1/finance"
import {
  useActiveSpaceContext,
  resolveSpacePath,
} from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AmountInput } from "@/components/ui/amount-input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Pencil,
  Lightbulb,
  ArrowUpDown,
  SkipForward,
} from "lucide-react"
import { formatAmount, toCentsString } from "./utils"
import { ReconciliationRow } from "./components/reconciliation-row"

export function ReconciliationWorkspaceView() {
  const { statementId } = useParams<{ statementId: string }>()
  const navigate = useNavigate()
  const { spaceId } = useActiveSpaceContext()

  // Queries
  const {
    data: statementsResponse,
    isLoading: stmtLoading,
    refetch: refetchStatements,
  } = useListStatementsQuery({ pageSize: 100, pageToken: "" })

  const {
    data: linesResponse,
    isLoading: linesLoading,
    refetch: refetchLines,
  } = useListStatementLinesQuery(
    { statementId: statementId || "" },
    { enabled: !!statementId }
  )

  const { data: accountsResponse } = useListAccountsQuery({
    pageSize: 100,
    pageToken: "",
  })
  const { data: budgetsResponse } = useListBudgetsQuery({
    pageSize: 100,
    pageToken: "",
  })
  const { data: scheduledResponse } = useListScheduledTransactionsQuery({
    pageSize: 100,
    pageToken: "",
    status: "PENDING",
    startDate: "",
    endDate: "",
    view: "FULL",
  })
  const { data: borrowingsResponse } = useListBorrowingsQuery({
    pageSize: 100,
    pageToken: "",
    status: "ACTIVE",
  })

  // Mutations
  const updateStatementMutation = useUpdateStatementMutation()
  const updateLineMutation = useUpdateStatementLineMutation()
  const completeMutation = useCompleteStatementMutation()
  const deleteMutation = useDeleteStatementMutation()

  const statements = useMemo(
    () => statementsResponse?.statements || [],
    [statementsResponse]
  )
  const activeStmt = useMemo(
    () => statements.find((s) => s.id === statementId),
    [statements, statementId]
  )
  const lines = useMemo(() => linesResponse?.lines || [], [linesResponse])
  const accounts = useMemo(
    () => accountsResponse?.accounts || [],
    [accountsResponse]
  )
  const budgets = useMemo(
    () => budgetsResponse?.budgets || [],
    [budgetsResponse]
  )
  const scheduledTxns = useMemo(
    () => scheduledResponse?.scheduledTransactions || [],
    [scheduledResponse]
  )
  const borrowings = useMemo(
    () => borrowingsResponse?.borrowings || [],
    [borrowingsResponse]
  )

  const targetAccount = useMemo(
    () => accounts.find((a) => a.id === activeStmt?.accountId),
    [accounts, activeStmt]
  )

  // Reconciliation Math
  const netFlowCents = useMemo(() => {
    return lines.reduce((acc, line) => {
      if (line.status !== "SKIPPED") {
        return acc + Number(line.amount || 0)
      }
      return acc
    }, 0)
  }, [lines])

  const expectedFlowCents = useMemo(() => {
    if (!activeStmt) return 0
    return (
      Number(activeStmt.statementEndingBalance || 0) -
      Number(activeStmt.statementStartingBalance || 0)
    )
  }, [activeStmt])

  const discrepancyCents = useMemo(() => {
    return Math.round(netFlowCents - expectedFlowCents)
  }, [netFlowCents, expectedFlowCents])

  const isReadyToComplete = useMemo(() => {
    if (!activeStmt || lines.length === 0) return false
    const allProcessed = lines.every((l) => l.status !== "UNMATCHED")
    return allProcessed && Math.abs(discrepancyCents) === 0
  }, [activeStmt, lines, discrepancyCents])

  // Statement Starting / Ending Balances Edit Dialog State
  const [isEditingBalances, setIsEditingBalances] = useState(false)
  const [editStartingAmount, setEditStartingAmount] = useState("")
  const [editEndingAmount, setEditEndingAmount] = useState("")

  const openEditBalances = () => {
    if (!activeStmt) return
    setEditStartingAmount(
      (Number(activeStmt.statementStartingBalance || 0) / 100).toFixed(2)
    )
    setEditEndingAmount(
      (Number(activeStmt.statementEndingBalance || 0) / 100).toFixed(2)
    )
    setIsEditingBalances(true)
  }

  const handleSaveBalances = async () => {
    if (!activeStmt || !activeStmt.id) return
    try {
      const startingCents = toCentsString(editStartingAmount)
      const endingCents = toCentsString(editEndingAmount)
      await updateStatementMutation.mutateAsync({
        id: activeStmt.id,
        req: {
          id: activeStmt.id,
          statement: {
            ...activeStmt,
            statementStartingBalance: startingCents,
            statementEndingBalance: endingCents,
          } as Statement,
          updateMask: {
            paths: ["statement_starting_balance", "statement_ending_balance"],
          },
        },
      })
      await refetchStatements()
      setIsEditingBalances(false)
    } catch (err) {
      console.error("Failed to update statement balances:", err)
    }
  }

  // Smart Discrepancy Diagnostics: Analyze lines to detect anomaly patterns
  interface DiscrepancyDiagnostic {
    id: string
    type: "sign_flip" | "exact_match"
    line: StatementLine
    suggestedAction: string
    actionLabel: string
  }

  const discrepancyDiagnostics = useMemo<DiscrepancyDiagnostic[]>(() => {
    if (discrepancyCents === 0 || lines.length === 0) return []
    const diagnostics: DiscrepancyDiagnostic[] = []

    for (const line of lines) {
      if (line.status === "SKIPPED") continue
      const amt = Number(line.amount || 0)

      // Check 1: Sign Inversion Match (Inverting line from amt to -amt reduces netFlow by 2*amt)
      if (2 * amt === discrepancyCents) {
        diagnostics.push({
          id: line.id || "",
          type: "sign_flip",
          line,
          suggestedAction: `Inverting the sign (+/-) on "${line.description || "Line item"}" (${formatAmount(amt, targetAccount?.currency)}) will perfectly balance your reconciliation ($0.00 difference).`,
          actionLabel: `Invert Sign (+/-) to ${formatAmount(-amt, targetAccount?.currency)}`,
        })
      }

      // Check 2: Exact Discrepancy Match (Skipping this line reduces netFlow by amt)
      if (amt === discrepancyCents) {
        diagnostics.push({
          id: line.id || "",
          type: "exact_match",
          line,
          suggestedAction: `"${line.description || "Line item"}" matches the exact remaining discrepancy of ${formatAmount(amt, targetAccount?.currency)}. If this transaction does not belong to this statement or was already recorded, skipping it will balance the statement.`,
          actionLabel: "Skip / Ignore Line",
        })
      }
    }

    return diagnostics
  }, [discrepancyCents, lines, targetAccount])

  const suspectLineIds = useMemo(() => {
    return new Set(discrepancyDiagnostics.map((d) => d.id))
  }, [discrepancyDiagnostics])

  // Handlers
  const handleSaveChoice = async (
    targetLine: StatementLine,
    actionType: string,
    actionPayload: {
      transactionId?: string
      overwriteTransaction?: boolean
      budgetId?: string
      counterpartAccountId?: string
      scheduledTransactionId?: string
      borrowingId?: string
    }
  ) => {
    let nextStatus: StatementLine["status"] = "IMPORTED"
    let actionField = "create_expense"
    const linePayload: Partial<StatementLine> = {
      id: targetLine.id,
      statementId: targetLine.statementId,
      status: nextStatus,
    }

    if (actionType === "match") {
      nextStatus = "MATCHED"
      actionField = "match"
      linePayload.status = "MATCHED"
      linePayload.match = {
        transactionId: actionPayload.transactionId!,
        overwriteTransaction: actionPayload.overwriteTransaction,
      }
      linePayload.matchedTransactionId = actionPayload.transactionId
    } else if (actionType === "expense") {
      nextStatus = "IMPORTED"
      actionField = "create_expense"
      linePayload.status = "IMPORTED"
      linePayload.createExpense = { budgetId: actionPayload.budgetId! }
    } else if (actionType === "income") {
      nextStatus = "IMPORTED"
      actionField = "create_income"
      linePayload.status = "IMPORTED"
      linePayload.createIncome = {}
    } else if (actionType === "transfer") {
      nextStatus = "IMPORTED"
      actionField = "create_transfer"
      linePayload.status = "IMPORTED"
      linePayload.createTransfer = {
        counterpartAccountId: actionPayload.counterpartAccountId!,
      }
    } else if (actionType === "scheduled") {
      nextStatus = "IMPORTED"
      actionField = "confirm_scheduled"
      linePayload.status = "IMPORTED"
      linePayload.confirmScheduled = {
        scheduledTransactionId: actionPayload.scheduledTransactionId!,
      }
    } else if (actionType === "repayment") {
      nextStatus = "IMPORTED"
      actionField = "create_repayment"
      linePayload.status = "IMPORTED"
      linePayload.createRepayment = {
        borrowingId: actionPayload.borrowingId!,
      }
    } else if (actionType === "skip") {
      nextStatus = "SKIPPED"
      actionField = "skip"
      linePayload.status = "SKIPPED"
      linePayload.skip = {}
    }

    try {
      if (!targetLine.id) return
      await updateLineMutation.mutateAsync({
        id: targetLine.id,
        req: {
          id: targetLine.id,
          statementLine: linePayload as StatementLine,
          updateMask: { paths: ["status", actionField] },
        },
      })
      refetchLines()
    } catch (err) {
      console.error("Saving line draft failed:", err)
    }
  }

  const handleUndoLine = async (targetLine: StatementLine) => {
    try {
      if (!targetLine.id) return
      await updateLineMutation.mutateAsync({
        id: targetLine.id,
        req: {
          id: targetLine.id,
          statementLine: {
            id: targetLine.id,
            statementId: targetLine.statementId,
            status: "UNMATCHED",
          } as StatementLine,
          updateMask: { paths: ["status"] },
        },
      })
      refetchLines()
    } catch (err) {
      console.error("Undo line failed:", err)
    }
  }

  const handleUpdateLineDetails = async (
    targetLine: StatementLine,
    updates: { description?: string; amount?: number | string }
  ) => {
    try {
      if (!targetLine.id) return
      const maskPaths: string[] = []
      if (updates.description !== undefined) maskPaths.push("description")
      if (updates.amount !== undefined) maskPaths.push("amount")

      await updateLineMutation.mutateAsync({
        id: targetLine.id,
        req: {
          id: targetLine.id,
          statementLine: {
            ...targetLine,
            ...updates,
            amount:
              updates.amount !== undefined
                ? String(updates.amount)
                : targetLine.amount,
          },
          updateMask: { paths: maskPaths },
        },
      })
      refetchLines()
    } catch (err) {
      console.error("Updating line details failed:", err)
    }
  }

  const [isBatchMatching, setIsBatchMatching] = useState(false)
  const handleBatchApproveMatches = async () => {
    const matchableLines = lines.filter(
      (l) =>
        l.status === "UNMATCHED" &&
        l.suggestions?.matches &&
        l.suggestions.matches.length > 0 &&
        !!l.id
    )
    if (matchableLines.length === 0) return

    setIsBatchMatching(true)
    try {
      await Promise.all(
        matchableLines.map((line) =>
          updateLineMutation.mutateAsync({
            id: line.id!,
            req: {
              id: line.id!,
              statementLine: {
                id: line.id,
                statementId: line.statementId,
                status: "MATCHED",
                match: {
                  transactionId: line.suggestions!.matches![0].id!,
                },
                matchedTransactionId: line.suggestions!.matches![0].id,
              } as StatementLine,
              updateMask: { paths: ["status", "match"] },
            },
          })
        )
      )
      refetchLines()
    } catch (err) {
      console.error("Batch match approval failed:", err)
    } finally {
      setIsBatchMatching(false)
    }
  }

  const handleComplete = async () => {
    if (!activeStmt || !activeStmt.id) return
    try {
      await completeMutation.mutateAsync({
        id: activeStmt.id,
        req: { id: activeStmt.id },
      })
      navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
    } catch (err) {
      console.error("Statement completion failed:", err)
    }
  }

  const handleDiscard = async () => {
    if (!activeStmt || !activeStmt.id) return
    if (!confirm("Are you sure you want to discard this draft statement?"))
      return
    try {
      await deleteMutation.mutateAsync({
        id: activeStmt.id,
        req: { id: activeStmt.id },
      })
      navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
    } catch (err) {
      console.error("Statement discard failed:", err)
    }
  }

  if (stmtLoading || linesLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!activeStmt) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center space-y-4 bg-background">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-bold">Statement Not Found</h2>
        <p className="text-xs text-muted-foreground">
          The statement you are looking for does not exist or has been removed.
        </p>
        <Button
          onClick={() =>
            navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
          }
        >
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const reviewedCount = lines.filter((l) => l.status !== "UNMATCHED").length
  const progressPercent =
    lines.length > 0 ? Math.round((reviewedCount / lines.length) * 100) : 0
  const matchableCount = lines.filter(
    (l) =>
      l.status === "UNMATCHED" &&
      l.suggestions?.matches &&
      l.suggestions.matches.length > 0
  ).length

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-background">
      {/* Sticky Header & Summary Bar */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background p-4 px-6 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl border border-border/40 bg-background/50 hover:bg-background/80"
              onClick={() =>
                navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
              }
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-foreground">
                  {activeStmt?.status === "COMPLETED"
                    ? `Reconciled: ${targetAccount?.name || "Account"}`
                    : `Reconciling ${targetAccount?.name || "Account"}`}
                </h1>
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {targetAccount?.currency}
                </span>
                {activeStmt?.status === "COMPLETED" && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    RECONCILED
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Starting:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatAmount(
                      activeStmt.statementStartingBalance,
                      targetAccount?.currency
                    )}
                  </span>
                  {" → "}Target Ending:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatAmount(
                      activeStmt.statementEndingBalance,
                      targetAccount?.currency
                    )}
                  </span>
                </span>
                {activeStmt?.status !== "COMPLETED" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openEditBalances}
                    className="h-5 rounded-md px-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <Pencil className="mr-1 h-2.5 w-2.5" />
                    Edit Balances
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Center: Live Discrepancy & Progress Pill */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold tracking-wider text-muted-foreground uppercase">
                  Progress
                </span>
                <span className="font-mono font-bold text-foreground">
                  {reviewedCount} of {lines.length} ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 w-44 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Discrepancy Status */}
            <div className="rounded-2xl border border-border/40 bg-background/50 p-2.5 px-4">
              <span className="block text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                Reconciliation Balance
              </span>
              {discrepancyCents === 0 ? (
                <div className="mt-0.5 flex items-center space-x-1.5 text-xs font-extrabold text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Balanced ($0.00 difference)</span>
                </div>
              ) : (
                <div className="mt-0.5 flex items-center space-x-1.5 text-xs font-extrabold text-rose-500">
                  <AlertTriangle className="h-4 w-4 animate-pulse" />
                  <span>
                    {discrepancyCents < 0 ? "-" : "+"}
                    {formatAmount(
                      Math.abs(discrepancyCents),
                      targetAccount?.currency
                    )}{" "}
                    remaining
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {activeStmt?.status === "COMPLETED" ? (
                <div className="flex items-center space-x-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-500 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Reconciliation Finalized</span>
                </div>
              ) : (
                <>
                  {matchableCount > 0 && (
                    <Button
                      size="sm"
                      onClick={handleBatchApproveMatches}
                      disabled={isBatchMatching}
                      className="rounded-xl bg-blue-600 text-xs font-bold text-white shadow-md transition-all hover:bg-blue-700"
                    >
                      {isBatchMatching ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve All Exact Matches ({matchableCount})
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDiscard}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Discard
                  </Button>

                  <Button
                    disabled={!isReadyToComplete || completeMutation.isPending}
                    onClick={handleComplete}
                    className="h-9 rounded-xl bg-gradient-to-r from-primary to-accent px-4 text-xs font-bold text-white shadow-lg transition-all hover:scale-[1.01]"
                  >
                    {completeMutation.isPending && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Finish & Reconcile
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Smart Discrepancy Diagnostics Card */}
      {activeStmt?.status !== "COMPLETED" &&
        discrepancyCents !== 0 &&
        discrepancyDiagnostics.length > 0 && (
          <div className="mx-auto mt-4 w-full max-w-7xl px-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-xl bg-amber-500/20 p-2 text-amber-500">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400">
                    Possible Discrepancy Cause Detected
                  </h4>
                  <p className="text-xs leading-relaxed font-medium text-foreground/90">
                    {discrepancyDiagnostics[0].suggestedAction}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                {discrepancyDiagnostics[0].type === "sign_flip" ? (
                  <Button
                    size="sm"
                    className="rounded-xl bg-amber-600 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
                    onClick={() =>
                      handleUpdateLineDetails(discrepancyDiagnostics[0].line, {
                        amount: -Number(
                          discrepancyDiagnostics[0].line.amount || 0
                        ),
                      })
                    }
                  >
                    <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                    {discrepancyDiagnostics[0].actionLabel}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-xl bg-amber-600 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
                    onClick={() =>
                      handleSaveChoice(
                        discrepancyDiagnostics[0].line,
                        "skip",
                        {}
                      )
                    }
                  >
                    <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                    {discrepancyDiagnostics[0].actionLabel}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Main Content Stream: Side-by-Side Comparison Table */}
      <div className="mx-auto w-full max-w-7xl space-y-4 p-6">
        <div className="flex items-center justify-between px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <div className="w-5/12">Bank Statement Record</div>
          <div className="w-7/12 pl-4">Your Ledger Action</div>
        </div>

        <div className="space-y-3">
          {lines.map((line) => (
            <ReconciliationRow
              key={line.id}
              line={line}
              budgets={budgets}
              accounts={accounts}
              scheduledTxns={scheduledTxns}
              borrowings={borrowings}
              targetAccount={targetAccount}
              isSuspectDiscrepancy={
                activeStmt?.status !== "COMPLETED" &&
                suspectLineIds.has(line.id || "")
              }
              isReadOnly={activeStmt?.status === "COMPLETED"}
              onSaveChoice={handleSaveChoice}
              onUndo={handleUndoLine}
              onUpdateDetails={handleUpdateLineDetails}
              isPending={updateLineMutation.isPending}
            />
          ))}
        </div>
      </div>

      {/* Edit Statement Balances Dialog */}
      <Dialog open={isEditingBalances} onOpenChange={setIsEditingBalances}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Edit Statement Starting & Ending Balances
            </DialogTitle>
            <DialogDescription className="text-xs">
              Adjust the statement starting balance and target closing balance
              to match your official bank statement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Starting Balance ({targetAccount?.currency})
              </Label>
              <AmountInput
                currency={targetAccount?.currency}
                value={editStartingAmount}
                onValueChange={setEditStartingAmount}
                allowNegative={true}
                placeholder="0.00"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Target Ending Balance ({targetAccount?.currency})
              </Label>
              <AmountInput
                currency={targetAccount?.currency}
                value={editEndingAmount}
                onValueChange={setEditEndingAmount}
                allowNegative={true}
                placeholder="0.00"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setIsEditingBalances(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={updateStatementMutation.isPending}
              onClick={handleSaveBalances}
              className="rounded-xl bg-primary font-bold"
            >
              {updateStatementMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save Balances
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
