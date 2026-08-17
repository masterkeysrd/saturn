import { useState, useMemo, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  useListStatementsQuery,
  useListAccountsQuery,
  type Statement,
  type Account,
} from "@/gen/saturn/finance/v1/finance"
import {
  useActiveSpaceContext,
  resolveSpacePath,
} from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  FileSpreadsheet,
  Plus,
  Loader2,
  Calendar,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { formatAmount } from "./utils"
import { cn } from "@/lib/utils"
import { FinancePageLayout } from "./components/finance-page-layout"
import { ImportStatementModal } from "./components/import-statement-modal"

export function ReconciliationDashboardView() {
  const { spaceId } = useActiveSpaceContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const queryAccountId = searchParams.get("accountId") || undefined
  const shouldOpenImport = searchParams.get("action") === "import"

  const [isImportModalOpen, setIsImportModalOpen] = useState(shouldOpenImport)
  const [activeTab, setActiveTab] = useState<string>("in_progress")

  useEffect(() => {
    if (shouldOpenImport) {
      setIsImportModalOpen(true)
    }
  }, [shouldOpenImport])

  // Fetch accounts to map account names
  const { data: accountsData, isLoading: accsLoading } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  // Fetch statements
  const {
    data: statementsData,
    isLoading: stmtLoading,
    refetch,
  } = useListStatementsQuery(
    {
      pageSize: 100,
      pageToken: "",
      accountId: queryAccountId || "",
    },
    { enabled: !!spaceId }
  )

  const statements = useMemo(
    () => statementsData?.statements || [],
    [statementsData?.statements]
  )

  const inProgressStatements = useMemo(
    () => statements.filter((s) => s.status === "IN_PROGRESS"),
    [statements]
  )

  const completedStatements = useMemo(
    () => statements.filter((s) => s.status === "COMPLETED"),
    [statements]
  )

  const handleOpenImport = () => {
    setIsImportModalOpen(true)
  }

  const handleCloseImport = (open: boolean) => {
    setIsImportModalOpen(open)
    if (!open && shouldOpenImport) {
      searchParams.delete("action")
      setSearchParams(searchParams)
    }
  }

  const handleImportSuccess = (statementId: string) => {
    refetch()
    navigate(
      resolveSpacePath(`/finance/reconcile/${statementId}`, spaceId, true)
    )
  }

  const handleOpenWorkspace = (statementId: string) => {
    navigate(
      resolveSpacePath(`/finance/reconcile/${statementId}`, spaceId, true)
    )
  }

  return (
    <FinancePageLayout
      title="Bank Statement Reconciliation"
      description="Upload and match your official bank statements against Saturn ledger records."
      actions={
        <Button
          onClick={handleOpenImport}
          className="rounded-xl bg-gradient-to-r from-primary to-accent text-xs font-bold text-white shadow-lg transition-all hover:scale-[1.02]"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Import Statement
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Total Statements
            </span>
            <p className="mt-1 text-2xl font-black text-foreground">
              {statements.length}
            </p>
          </Card>
          <Card className="rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              In Progress
            </span>
            <p className="mt-1 text-2xl font-black text-amber-500">
              {inProgressStatements.length}
            </p>
          </Card>
          <Card className="rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Reconciled & Closed
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-500">
              {completedStatements.length}
            </p>
          </Card>
        </div>

        {/* Dashboard Tabs & Streams */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-3">
            <TabsList className="h-10 rounded-xl bg-muted/40 p-1">
              <TabsTrigger
                value="in_progress"
                className="rounded-lg px-4 text-xs font-bold"
              >
                In Progress ({inProgressStatements.length})
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="rounded-lg px-4 text-xs font-bold"
              >
                Completed History ({completedStatements.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* In Progress Tab Content */}
          <TabsContent value="in_progress" className="space-y-3 outline-none">
            {stmtLoading || accsLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : inProgressStatements.length === 0 ? (
              <Card className="flex flex-col items-center justify-center rounded-2xl border-dashed border-border/60 bg-card/20 p-12 text-center">
                <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500 opacity-80" />
                <h3 className="text-base font-bold text-foreground">
                  All Statements Reconciled
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  You have no pending draft reconciliations. Upload a new bank
                  CSV statement to begin matching transactions.
                </p>
                <Button
                  onClick={handleOpenImport}
                  className="mt-5 rounded-xl bg-primary text-xs font-bold text-white shadow-md"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Import Statement
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {inProgressStatements.map((stmt) => (
                  <StatementDashboardCard
                    key={stmt.id}
                    statement={stmt}
                    accounts={accounts}
                    onOpen={() => handleOpenWorkspace(stmt.id || "")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Completed Tab Content */}
          <TabsContent value="completed" className="space-y-3 outline-none">
            {completedStatements.length === 0 ? (
              <Card className="flex flex-col items-center justify-center rounded-2xl border-dashed border-border/60 bg-card/20 p-12 text-center">
                <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <h3 className="text-base font-bold text-foreground">
                  No Past Statements
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Completed reconciliation periods and finalized statements will
                  be archived here.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedStatements.map((stmt) => (
                  <StatementDashboardCard
                    key={stmt.id}
                    statement={stmt}
                    accounts={accounts}
                    onOpen={() => handleOpenWorkspace(stmt.id || "")}
                    isCompleted
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* CSV Import Modal */}
      <ImportStatementModal
        open={isImportModalOpen}
        onOpenChange={handleCloseImport}
        accounts={accounts}
        preselectedAccountId={queryAccountId}
        onImportSuccess={handleImportSuccess}
      />
    </FinancePageLayout>
  )
}

interface StatementDashboardCardProps {
  statement: Statement
  accounts: Account[]
  onOpen: () => void
  isCompleted?: boolean
}

function StatementDashboardCard({
  statement,
  accounts,
  onOpen,
  isCompleted: isCompletedProp,
}: StatementDashboardCardProps) {
  const isCompleted = isCompletedProp ?? statement.status === "COMPLETED"
  const account = accounts.find((a) => a.id === statement.accountId)

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "group relative flex cursor-pointer flex-col items-start justify-between gap-4 rounded-2xl border border-border/50 p-5 shadow-sm transition-all duration-200 sm:flex-row sm:items-center",
        isCompleted
          ? "bg-card/30 hover:bg-card/60"
          : "bg-card/50 hover:border-primary/50 hover:bg-card hover:shadow-md"
      )}
    >
      <div className="flex min-w-0 items-start space-x-4 sm:items-center">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            isCompleted
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-amber-500/10 text-amber-500"
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-foreground">
              {statement.filename || "Bank Statement"}
            </h3>
            <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Landmark className="mr-1 h-3 w-3" />
              {account?.name || "Unknown Account"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span className="flex items-center">
              <Calendar className="mr-1 h-3.5 w-3.5 opacity-70" />
              {statement.statementDate}
            </span>
            <span>•</span>
            <span>
              Ending Balance:{" "}
              <span className="font-mono font-semibold text-foreground">
                {formatAmount(
                  statement.statementEndingBalance,
                  account?.currency
                )}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-between space-x-3 border-t border-border/30 pt-2 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase",
            isCompleted
              ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
              : "border border-amber-500/20 bg-amber-500/10 text-amber-500"
          )}
        >
          {isCompleted ? "Reconciled" : "Draft In-Progress"}
        </span>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-xl px-3 text-xs font-bold transition-all group-hover:bg-primary group-hover:text-white"
        >
          {isCompleted ? "Review" : "Resume"}
          <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </Card>
  )
}
