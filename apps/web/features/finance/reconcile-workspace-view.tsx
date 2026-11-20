import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListStatementsQuery,
  useListStatementLinesQuery,
  useUpdateStatementLineMutation,
  useUpdateStatementMutation,
  useCompleteStatementMutation,
  useDeleteStatementMutation,
  useInvertStatementSignsMutation,
  useListAccountsQuery,
  useListBudgetsQuery,
  useListBorrowingsQuery,
  useListScheduledTransactionsQuery,
  type StatementLine,
  type Statement,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  useActiveSpaceContext,
  resolveSpacePath,
} from "@/features/space/use-space"
import { useI18n } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { buildCopilotEntityKey } from "@saturn/core"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/toast"
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
import { formatAmount, formatCents, toCentsString } from "./utils"
import { ReconciliationRow } from "./components/reconciliation-row"

export function ReconciliationWorkspaceView() {
  const { statementId } = useParams<{ statementId: string }>()
  const navigate = useNavigate()
  const { spaceId } = useActiveSpaceContext()
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // Dialog States
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false)
  const [isInvertAllDialogOpen, setIsInvertAllDialogOpen] = useState(false)
  const [isInvertingAllSigns, setIsInvertingAllSigns] = useState(false)

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
  const invertSignsMutation = useInvertStatementSignsMutation()

  const statements = useMemo(
    () => statementsResponse?.statements || [],
    [statementsResponse]
  )
  const activeStmt = useMemo(
    () => statements.find((s) => s.id === statementId),
    [statements, statementId]
  )

  const lines = useMemo(
    () => linesResponse?.lines || [],
    [linesResponse?.lines]
  )

  const accounts = useMemo(
    () => accountsResponse?.accounts || [],
    [accountsResponse?.accounts]
  )
  const budgets = useMemo(
    () => budgetsResponse?.budgets || [],
    [budgetsResponse?.budgets]
  )
  const scheduledTxns = useMemo(
    () => scheduledResponse?.scheduledTransactions || [],
    [scheduledResponse?.scheduledTransactions]
  )
  const borrowings = useMemo(
    () => borrowingsResponse?.borrowings || [],
    [borrowingsResponse?.borrowings]
  )

  const targetAccount = useMemo(
    () => accounts.find((a) => a.id === activeStmt?.accountId),
    [accounts, activeStmt]
  )

  useRegisterCopilotView({
    viewId: "finance.reconcile",
    title: t("finance.reconcile.copilotTitle"),
    activeEntity:
      activeStmt?.id && statementId
        ? {
            key: buildCopilotEntityKey("statement", statementId),
            kind: "statement",
            id: statementId,
            label:
              activeStmt.filename || t("finance.reconcile.card.fileFallback"),
            summary: {
              accountId: activeStmt.accountId || "",
              currency: targetAccount?.currency || "",
              statementDate: activeStmt.statementDate || "",
              status: activeStmt.status || "",
            },
          }
        : undefined,
    suggestions: [
      t("finance.reconcile.suggestion.discrepancies"),
      t("finance.reconcile.suggestion.hardLines"),
      t("finance.reconcile.suggestion.progress"),
    ],
  })

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
      formatCents(activeStmt.statementStartingBalance).toFixed(2)
    )
    setEditEndingAmount(
      formatCents(activeStmt.statementEndingBalance).toFixed(2)
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
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/statements"],
      })
      await refetchStatements()
      setIsEditingBalances(false)
      toast.add({
        title: t("finance.reconcile.workspace.balancesUpdatedTitle"),
        description: t(
          "finance.reconcile.workspace.balancesUpdatedDescription"
        ),
        type: "success",
      })
    } catch (err) {
      console.error("Failed to update statement balances:", err)
      toast.add({
        title: t("finance.reconcile.workspace.updateFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.balancesFailedDescription"),
        type: "error",
      })
    }
  }

  const handleInvertAllSigns = async () => {
    if (!activeStmt || !activeStmt.id || lines.length === 0) return
    setIsInvertingAllSigns(true)
    try {
      await invertSignsMutation.mutateAsync({
        id: activeStmt.id,
        req: { id: activeStmt.id },
      })

      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/statements"],
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/finance/statements/${statementId}/lines`],
      })
      await Promise.all([refetchStatements(), refetchLines()])

      setIsInvertAllDialogOpen(false)
      toast.add({
        title: t("finance.reconcile.workspace.signsInvertedTitle"),
        description: t("finance.reconcile.workspace.signsInvertedDescription", {
          count: lines.length,
        }),
        type: "success",
      })
    } catch (err) {
      console.error("Failed to invert statement signs:", err)
      toast.add({
        title: t("finance.reconcile.workspace.inversionFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.inversionFailedDescription"),
        type: "error",
      })
    } finally {
      setIsInvertingAllSigns(false)
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
          suggestedAction: t("finance.reconcile.diagnostics.signFlipAction", {
            name:
              line.description ||
              t("finance.reconcile.diagnostics.lineItemFallback"),
            amount: formatAmount(amt, targetAccount?.currency),
          }),
          actionLabel: t("finance.reconcile.diagnostics.signFlipLabel", {
            amount: formatAmount(-amt, targetAccount?.currency),
          }),
        })
      }

      // Check 2: Exact Discrepancy Match (Skipping this line reduces netFlow by amt)
      if (amt === discrepancyCents) {
        diagnostics.push({
          id: line.id || "",
          type: "exact_match",
          line,
          suggestedAction: t("finance.reconcile.diagnostics.exactMatchAction", {
            name:
              line.description ||
              t("finance.reconcile.diagnostics.lineItemFallback"),
            amount: formatAmount(amt, targetAccount?.currency),
          }),
          actionLabel: t("finance.reconcile.diagnostics.exactMatchLabel"),
        })
      }
    }

    return diagnostics
  }, [discrepancyCents, lines, targetAccount, t])

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
    let actionField = "create_expense"
    const linePayload: Partial<StatementLine> = {
      id: targetLine.id,
      statementId: targetLine.statementId,
      status: "IMPORTED",
    }

    if (actionType === "match") {
      actionField = "match"
      linePayload.status = "MATCHED"
      linePayload.match = {
        transactionId: actionPayload.transactionId!,
        overwriteTransaction: actionPayload.overwriteTransaction,
      }
      linePayload.matchedTransactionId = actionPayload.transactionId
    } else if (actionType === "expense") {
      actionField = "create_expense"
      linePayload.status = "IMPORTED"
      linePayload.createExpense = { budgetId: actionPayload.budgetId! }
    } else if (actionType === "income") {
      actionField = "create_income"
      linePayload.status = "IMPORTED"
      linePayload.createIncome = {}
    } else if (actionType === "transfer") {
      actionField = "create_transfer"
      linePayload.status = "IMPORTED"
      linePayload.createTransfer = {
        counterpartAccountId: actionPayload.counterpartAccountId!,
      }
    } else if (actionType === "scheduled") {
      actionField = "confirm_scheduled"
      linePayload.status = "IMPORTED"
      linePayload.confirmScheduled = {
        scheduledTransactionId: actionPayload.scheduledTransactionId!,
      }
    } else if (actionType === "repayment") {
      actionField = "create_repayment"
      linePayload.status = "IMPORTED"
      linePayload.createRepayment = {
        borrowingId: actionPayload.borrowingId!,
      }
    } else if (actionType === "skip") {
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
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/finance/statements/${statementId}/lines`],
      })
      refetchLines()
    } catch (err) {
      console.error("Saving line draft failed:", err)
      toast.add({
        title: t("finance.reconcile.workspace.actionFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.actionFailedDescription"),
        type: "error",
      })
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
          updateMask: { paths: ["status", "action", "matched_transaction_id"] },
        },
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/finance/statements/${statementId}/lines`],
      })
      refetchLines()
    } catch (err) {
      console.error("Undo line failed:", err)
      toast.add({
        title: t("finance.reconcile.workspace.undoFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.undoFailedDescription"),
        type: "error",
      })
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
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/finance/statements/${statementId}/lines`],
      })
      refetchLines()
    } catch (err) {
      console.error("Updating line details failed:", err)
      toast.add({
        title: t("finance.reconcile.workspace.updateFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.lineDetailsFailedDescription"),
        type: "error",
      })
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
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/finance/statements/${statementId}/lines`],
      })
      refetchLines()
      toast.add({
        title: t("finance.reconcile.workspace.matchesApprovedTitle"),
        description:
          matchableLines.length === 1
            ? t("finance.reconcile.workspace.matchesApprovedOne", {
                count: matchableLines.length,
              })
            : t("finance.reconcile.workspace.matchesApprovedOther", {
                count: matchableLines.length,
              }),
        type: "success",
      })
    } catch (err) {
      console.error("Batch match approval failed:", err)
      toast.add({
        title: t("finance.reconcile.workspace.approvalFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.approvalFailedDescription"),
        type: "error",
      })
    } finally {
      setIsBatchMatching(false)
    }
  }

  const handleConfirmComplete = async () => {
    if (!activeStmt || !activeStmt.id) return
    try {
      await completeMutation.mutateAsync({
        id: activeStmt.id,
        req: { id: activeStmt.id },
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/statements"],
        }),
        queryClient.invalidateQueries({
          queryKey: [`/api/v1/finance/statements/${activeStmt.id}/lines`],
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/transactions"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/accounts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/scheduled-transactions"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/borrowings"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/budgets"],
        }),
      ])
      setIsCompleteDialogOpen(false)
      toast.add({
        title: t("finance.reconcile.workspace.reconciledTitle"),
        description: t("finance.reconcile.workspace.reconciledDescription", {
          name: targetAccount?.name || t("finance.reconcile.accountFallback"),
        }),
        type: "success",
      })
      navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
    } catch (err) {
      console.error("Statement completion failed:", err)
      toast.add({
        title: t("finance.reconcile.workspace.finalizationFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.workspace.finalizationFailedDescription"),
        type: "error",
      })
    }
  }

  const handleConfirmDiscard = async () => {
    if (!activeStmt || !activeStmt.id) return
    try {
      await deleteMutation.mutateAsync({
        id: activeStmt.id,
        req: { id: activeStmt.id },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/statements"],
      })
      await queryClient.removeQueries({
        queryKey: [`/api/v1/finance/statements/${activeStmt.id}/lines`],
      })
      setIsDiscardDialogOpen(false)
      toast.add({
        title: t("finance.reconcile.discard.toastTitle"),
        description: t("finance.reconcile.discard.toastDescription"),
        type: "info",
      })
      navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
    } catch (err) {
      console.error("Statement discard failed:", err)
      toast.add({
        title: t("finance.reconcile.discard.failedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.reconcile.discard.failedDescription"),
        type: "error",
      })
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
        <h2 className="text-lg font-bold">
          {t("finance.reconcile.workspace.notFoundTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("finance.reconcile.workspace.notFoundDescription")}
        </p>
        <Button
          onClick={() =>
            navigate(resolveSpacePath("/finance/reconcile", spaceId, true))
          }
        >
          {t("finance.reconcile.workspace.backToDashboard")}
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
                    ? t("finance.reconcile.workspace.reconciledHeading", {
                        name:
                          targetAccount?.name ||
                          t("finance.reconcile.accountFallback"),
                      })
                    : t("finance.reconcile.workspace.reconcilingHeading", {
                        name:
                          targetAccount?.name ||
                          t("finance.reconcile.accountFallback"),
                      })}
                </h1>
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {targetAccount?.currency}
                </span>
                {activeStmt?.status === "COMPLETED" && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    {t("finance.reconcile.workspace.badgeReconciled")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t("finance.reconcile.workspace.startingLabel")}{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatAmount(
                      activeStmt.statementStartingBalance,
                      targetAccount?.currency
                    )}
                  </span>
                  {" → "}
                  {t("finance.reconcile.workspace.targetEndingLabel")}{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatAmount(
                      activeStmt.statementEndingBalance,
                      targetAccount?.currency
                    )}
                  </span>
                </span>
                {activeStmt?.status !== "COMPLETED" && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={openEditBalances}
                      className="h-5 rounded-md px-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      <Pencil className="mr-1 h-2.5 w-2.5" />
                      {t("finance.reconcile.workspace.editBalances")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsInvertAllDialogOpen(true)}
                      className="h-5 rounded-md px-1.5 text-[11px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                      title={t("finance.reconcile.workspace.invertAllTooltip")}
                    >
                      <ArrowUpDown className="mr-1 h-2.5 w-2.5" />
                      {t("finance.reconcile.workspace.invertAllSigns")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: Live Discrepancy & Progress Pill */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold tracking-wider text-muted-foreground uppercase">
                  {t("finance.reconcile.workspace.progress")}
                </span>
                <span className="font-mono font-bold text-foreground">
                  {t("finance.reconcile.workspace.progressCount", {
                    reviewed: reviewedCount,
                    total: lines.length,
                    percent: progressPercent,
                  })}
                </span>
              </div>
              <div className="h-2 w-44 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Discrepancy Status */}
            <div className="rounded-2xl border border-border/40 bg-background/50 p-2.5 px-4">
              <span className="block text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                {t("finance.reconcile.workspace.reconciliationBalance")}
              </span>
              {discrepancyCents === 0 ? (
                <div className="mt-0.5 flex items-center space-x-1.5 text-xs font-extrabold text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t("finance.reconcile.workspace.balanced")}</span>
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
                    {t("finance.reconcile.workspace.remaining")}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {activeStmt?.status === "COMPLETED" ? (
                <div className="flex items-center space-x-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-500 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {t("finance.reconcile.workspace.reconciliationFinalized")}
                  </span>
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
                      {t("finance.reconcile.workspace.approveAllMatches", {
                        count: matchableCount,
                      })}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDiscardDialogOpen(true)}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("common.discard")}
                  </Button>

                  <Button
                    disabled={!isReadyToComplete || completeMutation.isPending}
                    onClick={() => setIsCompleteDialogOpen(true)}
                    className="h-9 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90"
                  >
                    {completeMutation.isPending && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    {t("finance.reconcile.workspace.finishAndReconcile")}
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
                    {t("finance.reconcile.diagnostics.heading")}
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
          <div className="w-5/12">
            {t("finance.reconcile.workspace.bankStatementRecord")}
          </div>
          <div className="w-7/12 pl-4">
            {t("finance.reconcile.workspace.yourLedgerAction")}
          </div>
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
              {t("finance.reconcile.balances.title")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("finance.reconcile.balances.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                {t("finance.reconcile.balances.startingLabel", {
                  currency: targetAccount?.currency ?? "",
                })}
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
                {t("finance.reconcile.balances.endingLabel", {
                  currency: targetAccount?.currency ?? "",
                })}
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
              {t("common.cancel")}
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
              {t("finance.reconcile.balances.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Alert Dialog */}
      <AlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 className="h-6 w-6" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("finance.reconcile.discard.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("finance.reconcile.discard.descriptionStart")}
              <span className="font-bold text-foreground">
                {targetAccount?.name || t("finance.reconcile.accountFallback")}
              </span>
              {activeStmt?.statementDate && (
                <>
                  {" "}
                  {t("finance.reconcile.discard.dateSuffix", {
                    date: activeStmt.statementDate,
                  })}
                </>
              )}
              {t("finance.reconcile.workspace.discardEnd", {
                count: lines.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDiscard()
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("finance.reconcile.discard.discarding")}
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {t("finance.reconcile.discard.confirm")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Confirmation Alert Dialog */}
      <AlertDialog
        open={isCompleteDialogOpen}
        onOpenChange={setIsCompleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("finance.reconcile.complete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("finance.reconcile.complete.descriptionStart")}
              <span className="font-bold text-foreground">
                {targetAccount?.name || t("finance.reconcile.accountFallback")}
              </span>
              {t("finance.reconcile.complete.descriptionEnd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMutation.isPending}>
              {t("finance.reconcile.complete.reviewLines")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={completeMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmComplete()
              }}
              className="bg-primary font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("finance.reconcile.complete.finalizing")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {t("finance.reconcile.complete.confirm")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invert All Signs Confirmation Alert Dialog */}
      <AlertDialog
        open={isInvertAllDialogOpen}
        onOpenChange={setIsInvertAllDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ArrowUpDown className="h-6 w-6" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("finance.reconcile.invert.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("finance.reconcile.invert.description", {
                count: lines.length,
              })}
              <br />
              <br />
              {t("finance.reconcile.invert.guidance")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isInvertingAllSigns}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isInvertingAllSigns}
              onClick={(e) => {
                e.preventDefault()
                handleInvertAllSigns()
              }}
              className="bg-amber-600 font-bold text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              {isInvertingAllSigns ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("finance.reconcile.invert.inverting")}
                </>
              ) : (
                <>
                  <ArrowUpDown className="mr-1.5 h-4 w-4" />
                  {t("finance.reconcile.invert.confirm")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
