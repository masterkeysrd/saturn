import { useState } from "react"
import {
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  type Borrowing,
  type BorrowingDirection,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { toCentsString, formatCents } from "../utils"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { useWorkspaceFinance } from "../use-workspace-finance"
import { CurrencyConversionPreview } from "./currency-conversion-preview"

interface CreateBorrowingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  editBorrowing?: Borrowing | null
  refetchBorrowings: () => void
}

export function CreateBorrowingSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editBorrowing,
  refetchBorrowings,
}: CreateBorrowingSheetProps) {
  const { currencies, getConversionPreview } = useWorkspaceFinance()
  const fallbackCurrencies = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
  ]
  const currencyList =
    currencies && currencies.length > 0 ? currencies : fallbackCurrencies

  const [direction, setDirection] = useState<BorrowingDirection>(
    () => editBorrowing?.direction || "BORROWING_DIRECTION_LENT"
  )
  const [counterparty, setCounterparty] = useState(
    () => editBorrowing?.counterparty || ""
  )
  const [contactInfo, setContactInfo] = useState(
    () => editBorrowing?.contactInfo || ""
  )
  const [amount, setAmount] = useState(() =>
    editBorrowing ? formatCents(editBorrowing.totalAmount).toString() : ""
  )
  const [currency, setCurrency] = useState(
    () => editBorrowing?.currency || baseCurrency || "USD"
  )
  const [establishedAt, setEstablishedAt] = useState<Date>(() =>
    editBorrowing ? new Date(editBorrowing.establishedAt) : new Date()
  )
  const [dueAt, setDueAt] = useState<Date | undefined>(() =>
    editBorrowing?.dueAt ? new Date(editBorrowing.dueAt) : undefined
  )
  const [hasDueDate, setHasDueDate] = useState(() => !!editBorrowing?.dueAt)
  const [notes, setNotes] = useState(() => editBorrowing?.notes || "")
  const [createAsTransaction, setCreateAsTransaction] = useState(() =>
    editBorrowing ? editBorrowing.createAsTransaction : true
  )

  const createBorrowingMutation = useCreateBorrowingMutation()
  const updateBorrowingMutation = useUpdateBorrowingMutation()

  const conversion = createAsTransaction
    ? getConversionPreview(amount, currency)
    : null

  const isPending =
    createBorrowingMutation.isPending || updateBorrowingMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!counterparty || !amount) return

    const cents = parseInt(toCentsString(amount))
    if (isNaN(cents) || cents <= 0) return

    const borrowingInput = {
      direction,
      counterparty,
      contactInfo,
      totalAmount: cents.toString(),
      currency,
      establishedAt: establishedAt.toISOString(),
      dueAt: (hasDueDate && dueAt
        ? dueAt.toISOString()
        : undefined) as unknown as string,
      notes,
      createAsTransaction: !editBorrowing ? createAsTransaction : false,
    }

    try {
      if (editBorrowing) {
        await updateBorrowingMutation.mutateAsync({
          space_id: spaceId,
          id: editBorrowing.id,
          req: {
            spaceId,
            id: editBorrowing.id,
            borrowing: borrowingInput,
          },
        })
      } else {
        await createBorrowingMutation.mutateAsync({
          space_id: spaceId,
          req: {
            spaceId,
            borrowing: borrowingInput,
          },
        })
      }
      refetchBorrowings()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save borrowing", err)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-lg md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editBorrowing ? "Edit Borrowing" : "Record Borrowing"}
          </SheetTitle>
          <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {editBorrowing
              ? "Modify logged lending or borrowing agreement details. Saturn will recompute general ledger entries automatically."
              : "Record a new personal lent or borrowed money record. This will log corresponding transaction flows in your general ledger."}
          </SheetDescription>
        </SheetHeader>

        <form
          key={`${editBorrowing?.id || "new"}-${open}`}
          onSubmit={handleSubmit}
          className="mt-8 space-y-6"
        >
          {/* Type Selector Dropdown */}
          <div className="space-y-2">
            <Label
              htmlFor="direction"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Type
            </Label>
            <Select
              value={direction}
              onValueChange={(val) =>
                val && setDirection(val as BorrowingDirection)
              }
            >
              <SelectTrigger
                id="direction"
                className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Select type...">
                  {direction === "BORROWING_DIRECTION_LENT"
                    ? "I Lent Money"
                    : "I Borrowed Money"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                <SelectItem value="BORROWING_DIRECTION_LENT">
                  I Lent Money
                </SelectItem>
                <SelectItem value="BORROWING_DIRECTION_BORROWED">
                  I Borrowed Money
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Counterparty Name */}
          <div className="space-y-2">
            <Label
              htmlFor="counterparty"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Name
            </Label>
            <Input
              id="counterparty"
              placeholder="e.g. Uncle Bob, John Doe"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              required
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          {/* Contact Information */}
          <div className="space-y-2">
            <Label
              htmlFor="contactInfo"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Contact Info (Optional)
            </Label>
            <Input
              id="contactInfo"
              placeholder="e.g. bob@email.com, +1 234..."
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          {/* Combined Amount and Currency */}
          <div className="space-y-2">
            <Label
              htmlFor="amount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="h-full w-full flex-1 bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <div className="h-6 w-px shrink-0 bg-border/40" />

              <Select
                value={currency}
                onValueChange={(val) => val && setCurrency(val)}
              >
                <SelectTrigger
                  id="currency"
                  className="!h-full w-24 shrink-0 cursor-pointer rounded-none border-0 bg-transparent px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted/10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                >
                  <SelectValue placeholder="USD" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                  {currencyList.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Established Date */}
          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Date Established
            </Label>
            <DatePicker
              date={establishedAt}
              setDate={(d) => d && setEstablishedAt(d)}
            />
          </div>

          {/* Optional Target Due Date */}
          <div className="space-y-3.5 pt-1">
            <div className="flex items-center gap-2.5 select-none">
              <input
                id="hasDueDate"
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-border/60 text-primary focus:ring-primary focus:ring-offset-0"
                checked={hasDueDate}
                onChange={(e) => setHasDueDate(e.target.checked)}
              />
              <Label
                htmlFor="hasDueDate"
                className="cursor-pointer text-xs font-semibold text-foreground/80"
              >
                Set a target due date
              </Label>
            </div>
            {hasDueDate && (
              <div className="slide-in-from-top-1.5 animate-in space-y-2 duration-200 fade-in">
                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Due Date
                </Label>
                <DatePicker date={dueAt} setDate={setDueAt} />
              </div>
            )}
          </div>

          {/* Create as Transaction Toggle */}
          {!editBorrowing && (
            <div className="flex items-center gap-2.5 pt-1 select-none">
              <input
                id="createAsTransaction"
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-border/60 text-primary focus:ring-primary focus:ring-offset-0"
                checked={createAsTransaction}
                onChange={(e) => setCreateAsTransaction(e.target.checked)}
              />
              <Label
                htmlFor="createAsTransaction"
                className="cursor-pointer text-xs font-semibold text-foreground/80"
              >
                Create as transaction
              </Label>
            </div>
          )}

          {/* Notes Area */}
          <div className="space-y-2">
            <Label
              htmlFor="notes"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Notes
            </Label>
            <textarea
              id="notes"
              placeholder="Add extra context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex min-h-[90px] w-full rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <CurrencyConversionPreview
            conversion={conversion}
            fromCurrency={currency}
          />

          <Button
            type="submit"
            className="mt-8 h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            disabled={
              isPending ||
              !counterparty ||
              !!(conversion && "error" in conversion)
            }
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editBorrowing ? "Save Changes" : "Create Record"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
