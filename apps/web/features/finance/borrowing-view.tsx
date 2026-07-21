import { useState } from "react"
import {
  useListBorrowingsQuery,
  useDeleteBorrowingMutation,
  type Borrowing,
  type BorrowingStatus,
  type BorrowingDirection,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { CreateBorrowingSheet } from "./components/create-borrowing-sheet"
import { BorrowingDetailSheet } from "./components/borrowing-detail-sheet"
import { formatCents } from "./utils"
import {
  HandCoins,
  TrendingUp,
  TrendingDown,
  Search,
  Info,
  Edit,
  Trash2,
  Plus,
  Calendar,
  User,
} from "lucide-react"

export function BorrowingView() {
  const [now] = useState(() => Date.now())
  const { spaceId, isWritable, settings } = useWorkspaceFinance()
  const baseCurrency = settings?.baseCurrency || "USD"

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [directionFilter, setDirectionFilter] = useState<string>("ALL")

  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editBorrowing, setEditBorrowing] = useState<Borrowing | null>(null)
  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(
    null
  )

  const { data, refetch: refetchBorrowings } = useListBorrowingsQuery(
    {
      status:
        statusFilter === "ALL" ? undefined : (statusFilter as BorrowingStatus),
      direction:
        directionFilter === "ALL"
          ? undefined
          : (directionFilter as BorrowingDirection),
      pageSize: 100,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )

  const deleteBorrowingMutation = useDeleteBorrowingMutation()

  const handleDelete = async (b: Borrowing) => {
    if (
      !confirm(
        `Are you sure you want to delete this borrowing record with ${b.counterparty}? This will delete all logged repayments and associated ledger transactions.`
      )
    ) {
      return
    }

    try {
      await deleteBorrowingMutation.mutateAsync({
        id: b.id,
        req: {
          id: b.id,
        },
      })
      refetchBorrowings()
    } catch (err) {
      console.error("Failed to delete borrowing", err)
    }
  }

  const borrowings = data?.borrowings || []
  const filteredBorrowings = borrowings.filter((b) =>
    b.counterparty.toLowerCase().includes(search.toLowerCase())
  )

  // Calculate totals for active borrowings
  const activeBorrowings = borrowings.filter(
    (b) => b.status === "BORROWING_STATUS_ACTIVE"
  )
  const totalLent = activeBorrowings
    .filter((b) => b.direction === "BORROWING_DIRECTION_LENT")
    .reduce((sum, b) => sum + parseFloat(b.remainingAmount), 0)
  const totalBorrowed = activeBorrowings
    .filter((b) => b.direction === "BORROWING_DIRECTION_BORROWED")
    .reduce((sum, b) => sum + parseFloat(b.remainingAmount), 0)

  const handleOpenCreate = () => {
    setEditBorrowing(null)
    setCreateOpen(true)
  }

  const handleOpenEdit = (b: Borrowing, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditBorrowing(b)
    setCreateOpen(true)
  }

  const handleOpenDetail = (b: Borrowing) => {
    setSelectedBorrowing(b)
    setDetailOpen(true)
  }

  return (
    <FinancePageLayout
      title="Personal Borrowing"
      description="Track informal lends and borrows with family, friends, and colleagues."
      icon={HandCoins}
      actions={
        isWritable && (
          <Button
            onClick={handleOpenCreate}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
          >
            <Plus className="h-4.5 w-4.5" />
            Record Borrowing
          </Button>
        )
      }
    >
      <div className="mt-2 animate-in space-y-6 duration-300 fade-in">
        {/* KPI Widgets */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-md backdrop-blur-xl transition-all hover:shadow-lg">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-emerald-500/5 blur-2xl"></div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-inner">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Owed to Me (Lent)
                </span>
                <h3 className="mt-0.5 text-2xl font-black tracking-tight text-foreground">
                  {formatCents(totalLent).toFixed(2)}{" "}
                  <span className="text-xs font-normal text-muted-foreground uppercase">
                    {baseCurrency}
                  </span>
                </h3>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-md backdrop-blur-xl transition-all hover:shadow-lg">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-rose-500/5 blur-2xl"></div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 shadow-inner">
                <TrendingDown className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  I Owe to Others (Borrowed)
                </span>
                <h3 className="mt-0.5 text-2xl font-black tracking-tight text-foreground">
                  {formatCents(totalBorrowed).toFixed(2)}{" "}
                  <span className="text-xs font-normal text-muted-foreground uppercase">
                    {baseCurrency}
                  </span>
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Control bar */}
        <div className="flex flex-col gap-4 border-b border-border/10 pb-4 md:flex-row md:items-center md:justify-between">
          <InputGroup className="w-full max-w-sm">
            <InputGroupInput
              placeholder="Search counterparty name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <Search size={16} />
            </InputGroupAddon>
          </InputGroup>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filters */}
            <div className="flex rounded-xl border border-border/30 bg-muted/65 p-1">
              {[
                "ALL",
                "BORROWING_STATUS_ACTIVE",
                "BORROWING_STATUS_PAID_OFF",
              ].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
                    statusFilter === status
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {status === "ALL"
                    ? "All Statuses"
                    : status === "BORROWING_STATUS_ACTIVE"
                      ? "Active"
                      : "Paid Off"}
                </button>
              ))}
            </div>

            {/* Direction Filters */}
            <div className="flex rounded-xl border border-border/30 bg-muted/65 p-1">
              {[
                "ALL",
                "BORROWING_DIRECTION_LENT",
                "BORROWING_DIRECTION_BORROWED",
              ].map((dir) => (
                <button
                  key={dir}
                  onClick={() => setDirectionFilter(dir)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
                    directionFilter === dir
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {dir === "ALL"
                    ? "All types"
                    : dir === "BORROWING_DIRECTION_LENT"
                      ? "Lent"
                      : "Borrowed"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        {filteredBorrowings.length === 0 ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/20 p-8 text-center backdrop-blur-sm">
            <HandCoins className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-muted-foreground">
              No borrowings registered
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Log your first lending or borrowing agreement using the button in
              the top right.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBorrowings.map((b) => {
              const total = parseFloat(b.totalAmount)
              const remaining = parseFloat(b.remainingAmount)
              const paid = total - remaining
              const percentage = Math.min(
                100,
                Math.max(0, (paid / total) * 100)
              )

              const isLent = b.direction === "BORROWING_DIRECTION_LENT"
              const isPaid = b.status === "BORROWING_STATUS_PAID_OFF"

              // Check if overdue
              const isOverdue =
                b.status === "BORROWING_STATUS_ACTIVE" &&
                b.dueAt &&
                new Date(b.dueAt).getTime() < now

              return (
                <div
                  key={b.id}
                  onClick={() => handleOpenDetail(b)}
                  className="group relative cursor-pointer overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-5 shadow-sm backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:bg-card/75 hover:shadow-md"
                >
                  {/* Top header row */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground/75" />
                        <h4 className="max-w-[120px] truncate font-bold text-foreground">
                          {b.counterparty}
                        </h4>
                      </div>
                      {b.contactInfo && (
                        <span className="mt-0.5 block max-w-[125px] truncate text-[10px] text-muted-foreground">
                          {b.contactInfo}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Direction Badge */}
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[8px] font-black tracking-wider uppercase ${
                          isLent
                            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                            : "border border-rose-500/20 bg-rose-500/10 text-rose-500"
                        }`}
                      >
                        {isLent ? "LENT" : "BORROWED"}
                      </span>

                      {/* Status badge */}
                      {isPaid ? (
                        <span className="rounded-lg bg-muted-foreground/10 px-2 py-0.5 text-[8px] font-bold text-muted-foreground">
                          PAID
                        </span>
                      ) : isOverdue ? (
                        <span className="animate-pulse rounded-lg bg-destructive/10 px-2 py-0.5 text-[8px] font-extrabold text-destructive">
                          OVERDUE
                        </span>
                      ) : (
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[8px] font-bold text-primary">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Main Financial stats */}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                        Remaining Balance
                      </span>
                      <p className="mt-0.5 truncate text-lg font-black text-foreground">
                        {formatCents(b.remainingAmount).toFixed(2)}{" "}
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          {b.currency}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                        Original Total
                      </span>
                      <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
                        {formatCents(b.totalAmount).toFixed(2)}{" "}
                        <span className="text-[9px] uppercase">
                          {b.currency}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>Paid Off</span>
                      <span className="font-semibold">
                        {percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPaid
                            ? "bg-muted-foreground"
                            : isLent
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Bottom actions & dates */}
                  <div className="mt-5 flex items-center justify-between border-t border-border/10 pt-3 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(b.establishedAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {isWritable && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-md hover:bg-muted"
                            onClick={(e) => handleOpenEdit(b, e)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-md hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(b)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-md hover:bg-muted"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Slide-out Sheets */}
      <CreateBorrowingSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        baseCurrency={baseCurrency}
        editBorrowing={editBorrowing}
        refetchBorrowings={refetchBorrowings}
      />

      <BorrowingDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        spaceId={spaceId}
        borrowing={selectedBorrowing}
        refetchBorrowings={refetchBorrowings}
      />
    </FinancePageLayout>
  )
}
