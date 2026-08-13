import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  ChevronRight,
  Search,
} from "lucide-react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  type Borrowing,
  useListBorrowingsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { formatCents } from "../utils"

interface BorrowingSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  onSelect: (borrowing: Borrowing) => void
  onBack: () => void
}

export function BorrowingSelector({
  open,
  onOpenChange,
  spaceId,
  onSelect,
  onBack,
}: BorrowingSelectorProps) {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState("")

  // Fetch active borrowings
  const { data: borrowingsData } = useListBorrowingsQuery(
    {
      status: "ACTIVE",
      pageSize: 100,
      pageToken: "",
    },
    { enabled: open && !!spaceId }
  )

  const activeBorrowings = useMemo(() => {
    return borrowingsData?.borrowings || []
  }, [borrowingsData])

  const filteredBorrowings = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    if (!q) return activeBorrowings
    return activeBorrowings.filter((b) => {
      const counterparty = (b.counterparty || "").toLowerCase()
      const notes = (b.notes || "").toLowerCase()
      return counterparty.includes(q) || notes.includes(q)
    })
  }, [activeBorrowings, searchText])

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Select Borrowing Agreement"
      description="Choose an active borrowing or lending record to log a payment or disbursement."
      submitLabel="Select a borrowing above"
      disabled
      hideSubmitButton
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="-ml-2 h-8 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted/10 hover:text-foreground"
          >
            ← Back to types
          </Button>

          <Button
            type="button"
            variant="link"
            onClick={() => {
              onOpenChange(false)
              navigate("/finance/borrowing")
            }}
            className="h-8 cursor-pointer px-0 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            Manage Borrowings
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search counterparties or description..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-10 rounded-xl border-border/60 bg-background/40 pr-4 pl-9 text-xs focus-visible:ring-primary"
          />
        </div>

        {/* List items */}
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {filteredBorrowings.length === 0 ? (
            <div className="py-12 text-center">
              <HandCoins className="mx-auto h-12 w-12 text-muted-foreground/20" />
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                No active borrowing records found.
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[11px] text-muted-foreground/80">
                Go to the Personal Borrowing tab to register a new lending or
                borrowing agreement.
              </p>
            </div>
          ) : (
            filteredBorrowings.map((b) => {
              const isLent = b.direction === "LENT"
              const balance = Number(b.remainingAmount || 0)

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelect(b)}
                  className="group flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/40 p-4.5 text-left transition-all outline-none hover:scale-[1.005] hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`shrink-0 rounded-lg p-2 ${
                        isLent
                          ? "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
                          : "bg-rose-500/10 text-rose-500 dark:bg-rose-500/20"
                      }`}
                    >
                      {isLent ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-bold text-foreground">
                        {b.counterparty}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{isLent ? "You Lent" : "You Borrowed"}</span>
                        {b.notes && (
                          <>
                            <span>•</span>
                            <span className="max-w-[120px] truncate">
                              {b.notes}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <span className="block text-xs font-black text-foreground">
                        {formatCents(balance).toFixed(2)}{" "}
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          {b.currency}
                        </span>
                      </span>
                      <span className="block text-[9px] font-bold text-muted-foreground uppercase">
                        Remaining
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </FormDrawer>
  )
}
