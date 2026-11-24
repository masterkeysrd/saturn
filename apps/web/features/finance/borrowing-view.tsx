import { useState, useEffect } from "react"
import { useUrlState } from "@/lib/use-url-state"
import { useSpacePermissions } from "@/features/space/use-space"
import {
  invalidateFinanceQueries,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { convertCentsToBase } from "@saturn/core"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListBorrowingsQuery,
  useDeleteBorrowingMutation,
  useListExchangeRatesQuery,
  type Borrowing,
  type Borrowing_Status,
  type Borrowing_Direction,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { Button } from "@/components/ui/button"
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { CreateBorrowingSheet } from "./components/create-borrowing-sheet"
import { BorrowingDetailSheet } from "./components/borrowing-detail-sheet"
import { AdjustBorrowingModal } from "./components/adjust-borrowing-modal"
import { formatAmount } from "./utils"
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
  Scale,
  MoreVertical,
} from "lucide-react"

const BORROWING_FILTER_DEFAULTS = {
  q: "",
  status: "ALL",
  direction: "ALL",
  sort: "_default",
}

export function BorrowingView() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { t } = useI18n()
  const [now] = useState(() => Date.now())
  const { spaceId, isWritable } = useSpacePermissions()

  useRegisterCopilotView({
    viewId: "finance.borrowing",
    title: t("finance.borrowing.copilotTitle"),
    suggestions: [
      t("finance.borrowing.suggestion.balances"),
      t("finance.borrowing.suggestion.overdue"),
      t("finance.borrowing.suggestion.priorities"),
    ],
  })

  const { data: settings } = useGetSettingsQuery({}, { enabled: !!spaceId })
  const baseCurrency = settings?.baseCurrency || "USD"

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const exchangeRates = ratesData?.exchangeRates || []

  const [urlState, setUrlState] = useUrlState(BORROWING_FILTER_DEFAULTS)
  const [searchQuery, setSearchQuery] = useState(urlState.q)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    setUrlState({ q: debouncedSearchQuery })
  }, [debouncedSearchQuery, setUrlState])

  const [prevUrlQ, setPrevUrlQ] = useState(urlState.q)
  if (urlState.q !== prevUrlQ) {
    setPrevUrlQ(urlState.q)
    setSearchQuery(urlState.q)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [editBorrowing, setEditBorrowing] = useState<Borrowing | null>(null)
  const [adjustBorrowing, setAdjustBorrowing] = useState<Borrowing | null>(null)
  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = useState<Borrowing | null>(null)

  const { data, refetch: refetchBorrowings } = useListBorrowingsQuery(
    {
      status:
        urlState.status === "ALL"
          ? undefined
          : (urlState.status as Borrowing_Status),
      direction:
        urlState.direction === "ALL"
          ? undefined
          : (urlState.direction as Borrowing_Direction),
      orderBy: urlState.sort === "_default" ? undefined : urlState.sort,
      pageSize: 100,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )

  const deleteBorrowingMutation = useDeleteBorrowingMutation()

  const handleDelete = (b: Borrowing) => {
    setDeleteTarget(b)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return
    try {
      await deleteBorrowingMutation.mutateAsync({
        id: deleteTarget.id,
        req: {
          id: deleteTarget.id,
        },
      })
      toast.add({
        type: "success",
        title: t("finance.borrowing.delete.deletedTitle"),
        description: t("finance.borrowing.delete.deletedDescription", {
          name: deleteTarget.counterparty || "",
        }),
      })
      setDeleteTarget(null)
      await invalidateFinanceQueries(queryClient)
      refetchBorrowings()
    } catch (err) {
      toast.add({
        type: "error",
        title: t("finance.borrowing.delete.failedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.borrowing.delete.failedDescription"),
      })
    }
  }

  const borrowings = data?.borrowings || []
  const filteredBorrowings = borrowings.filter((b) =>
    b.counterparty.toLowerCase().includes(urlState.q.toLowerCase())
  )

  // Calculate totals for active borrowings (converted to workspace base currency)
  const activeBorrowings = borrowings.filter((b) => b.status === "ACTIVE")
  const totalLent = activeBorrowings
    .filter((b) => b.direction === "LENT")
    .reduce(
      (sum, b) =>
        sum +
        convertCentsToBase(
          b.remainingAmount,
          b.currency,
          baseCurrency,
          exchangeRates
        ),
      0
    )
  const totalBorrowed = activeBorrowings
    .filter((b) => b.direction === "BORROWED")
    .reduce(
      (sum, b) =>
        sum +
        convertCentsToBase(
          b.remainingAmount,
          b.currency,
          baseCurrency,
          exchangeRates
        ),
      0
    )

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
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-start">
      <div className="@container min-w-0 flex-1">
        <FinancePageLayout
          title={t("finance.borrowing.title")}
          description={t("finance.borrowing.description")}
          icon={HandCoins}
          actions={
            isWritable && (
              <Button
                onClick={handleOpenCreate}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 pt-0.5 font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
              >
                <Plus className="h-4.5 w-4.5" />
                {t("finance.borrowing.recordBorrowing")}
              </Button>
            )
          }
        >
          <div className="mt-2 animate-in space-y-6 duration-300 fade-in">
            {/* KPI Widgets */}
            <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-md backdrop-blur-xl transition-all hover:shadow-lg">
                <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-emerald-500/5 blur-2xl"></div>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-inner">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {t("finance.borrowing.owedToMe")}
                    </span>
                    <h3 className="mt-0.5 text-2xl font-black tracking-tight text-foreground">
                      {formatAmount(totalLent, baseCurrency)}
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
                      {t("finance.borrowing.iOweOthers")}
                    </span>
                    <h3 className="mt-0.5 text-2xl font-black tracking-tight text-foreground">
                      {formatAmount(totalBorrowed, baseCurrency)}
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters & Control bar */}
            <div className="flex flex-col gap-4 border-b border-border/10 pb-4 md:flex-row md:items-center md:justify-between">
              <InputGroup className="w-full max-w-sm">
                <InputGroupInput
                  placeholder={t("finance.borrowing.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <Search size={16} />
                </InputGroupAddon>
              </InputGroup>

              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filters */}
                <div className="flex rounded-xl border border-border/30 bg-muted/65 p-1">
                  {["ALL", "ACTIVE", "PAID_OFF"].map((status) => (
                    <button
                      key={status}
                      onClick={() => setUrlState({ status })}
                      className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
                        urlState.status === status
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {status === "ALL"
                        ? t("common.all")
                        : status === "ACTIVE"
                          ? t("common.active")
                          : t("finance.borrowing.filterPaidOff")}
                    </button>
                  ))}
                </div>

                {/* Direction Filters */}
                <div className="flex rounded-xl border border-border/30 bg-muted/65 p-1">
                  {["ALL", "LENT", "BORROWED"].map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setUrlState({ direction: dir })}
                      className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
                        urlState.direction === dir
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {dir === "ALL"
                        ? t("common.all")
                        : dir === "LENT"
                          ? t("finance.borrowing.filterLent")
                          : t("finance.borrowing.filterBorrowed")}
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
                  {t("finance.borrowing.emptyTitle")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  {t("finance.borrowing.emptyDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
                {filteredBorrowings.map((b) => {
                  const total = parseFloat(b.totalAmount)
                  const remaining = parseFloat(b.remainingAmount || "0")
                  const paid = total - remaining
                  const percentage = Math.min(
                    100,
                    Math.max(0, (paid / total) * 100)
                  )

                  const isLent = b.direction === "LENT"
                  const isPaid = b.status === "PAID_OFF"

                  // Check if overdue
                  const isOverdue =
                    b.status === "ACTIVE" &&
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
                            {isLent
                              ? t("finance.borrowing.badgeLent")
                              : t("finance.borrowing.badgeBorrowed")}
                          </span>

                          {/* Status badge */}
                          {isPaid ? (
                            <span className="rounded-lg bg-muted-foreground/10 px-2 py-0.5 text-[8px] font-bold text-muted-foreground">
                              {t("finance.borrowing.badgePaid")}
                            </span>
                          ) : isOverdue ? (
                            <span className="animate-pulse rounded-lg bg-destructive/10 px-2 py-0.5 text-[8px] font-extrabold text-destructive">
                              {t("finance.borrowing.badgeOverdue")}
                            </span>
                          ) : (
                            <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[8px] font-bold text-primary">
                              {t("finance.borrowing.badgeActive")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Main Financial stats */}
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                            {t("finance.borrowing.remainingBalance")}
                          </span>
                          <p className="mt-0.5 truncate text-lg font-black text-foreground">
                            {formatAmount(b.remainingAmount, b.currency)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                            {t("finance.borrowing.originalTotal")}
                          </span>
                          <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
                            {formatAmount(b.totalAmount, b.currency)}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4 space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span>{t("finance.borrowing.paidOffLabel")}</span>
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
                            {tz.format(b.establishedAt, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent className="rounded-xl border border-border/50 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenDetail(b)
                                }}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                              >
                                <Info className="h-3.5 w-3.5" />
                                {t("finance.borrowing.viewDetails")}
                              </DropdownMenuItem>
                              {isWritable && (
                                <>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setAdjustBorrowing(b)
                                      setAdjustOpen(true)
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-400 focus:bg-emerald-500/10"
                                  >
                                    <Scale className="h-3.5 w-3.5" />
                                    {t("finance.borrowing.adjustBalance")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleOpenEdit(b, e)}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                    {t("finance.borrowing.editAgreement")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="my-1 bg-border/40" />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(b)
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-500 focus:bg-rose-500/10"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {t("finance.borrowing.deleteRecord")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Composer Modals */}
          <CreateBorrowingSheet
            open={createOpen}
            onOpenChange={setCreateOpen}
            baseCurrency={baseCurrency}
            editBorrowing={editBorrowing}
            refetchBorrowings={refetchBorrowings}
          />

          <AdjustBorrowingModal
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            borrowing={adjustBorrowing}
            spaceId={spaceId}
            refetchBorrowings={refetchBorrowings}
          />

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("finance.borrowing.delete.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("finance.borrowing.delete.description", {
                    name: deleteTarget?.counterparty || "",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteBorrowingMutation.isPending}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteBorrowingMutation.isPending}
                  onClick={handleConfirmDelete}
                >
                  {deleteBorrowingMutation.isPending
                    ? t("finance.borrowing.delete.deleting")
                    : t("finance.borrowing.delete.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </FinancePageLayout>
      </div>

      <BorrowingDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        spaceId={spaceId}
        borrowing={selectedBorrowing}
        refetchBorrowings={refetchBorrowings}
      />
    </div>
  )
}
