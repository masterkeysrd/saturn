import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import {
  type Borrowing,
  useAdjustBorrowingBalanceMutation,
  useListAccountsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { AccountSelect } from "./account-select"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Controller } from "react-hook-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Scale, AlertTriangle, Loader2 } from "lucide-react"
import { formatAmount } from "../utils"
import { cn } from "@/lib/utils"

const adjustBorrowingSchema = z.object({
  targetBalance: z.string().min(1, "Target balance is required"),
  adjustmentDate: z.date(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
})

type AdjustBorrowingFormValues = z.infer<typeof adjustBorrowingSchema>

interface AdjustBorrowingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  borrowing: Borrowing | null
  spaceId: string
  refetchBorrowings: () => void
  refetchRepayments?: () => void
}

export function AdjustBorrowingModal({
  open,
  onOpenChange,
  borrowing,
  spaceId,
  refetchBorrowings,
  refetchRepayments,
}: AdjustBorrowingModalProps) {
  const queryClient = useQueryClient()
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AdjustBorrowingFormValues>({
    resolver: zodResolver(adjustBorrowingSchema),
    defaultValues: {
      targetBalance: "",
      adjustmentDate: new Date(),
      accountId: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (open && borrowing) {
      reset({
        targetBalance: (Number(borrowing.remainingAmount || 0) / 100).toFixed(
          2
        ),
        adjustmentDate: new Date(),
        accountId: "",
        notes: "",
      })
    }
  }, [open, borrowing, reset])

  const targetBalanceStr = useWatch({ control, name: "targetBalance" }) || ""

  const adjustMutation = useAdjustBorrowingBalanceMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/borrowings"],
      })
      refetchBorrowings()
      if (refetchRepayments) refetchRepayments()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      setAdjustError(
        err instanceof Error ? err.message : "Failed to adjust balance"
      )
    },
  })

  const onSubmit = (data: AdjustBorrowingFormValues) => {
    if (!borrowing?.id) return

    const parsedNum = parseFloat(data.targetBalance)
    if (isNaN(parsedNum) || parsedNum < 0) {
      setAdjustError("Please enter a valid non-negative target balance")
      return
    }

    const targetCents = Math.round(parsedNum * 100)
    setAdjustError(null)

    adjustMutation.mutate({
      borrowing_id: borrowing.id,
      req: {
        borrowingId: borrowing.id,
        targetBalance: targetCents.toString(),
        adjustmentDate: data.adjustmentDate.toISOString(),
        notes: data.notes || undefined,
        accountId: data.accountId || undefined,
      },
    })
  }

  if (!borrowing) return null

  const currentCents = Number(borrowing.remainingAmount || 0)
  const parsedNum = parseFloat(targetBalanceStr)
  const targetCents = isNaN(parsedNum)
    ? currentCents
    : Math.round(parsedNum * 100)
  const deltaCents = targetCents - currentCents

  const currency = borrowing.currency || "USD"
  const currentBalFormatted = formatAmount(currentCents, currency)
  const targetBalFormatted = formatAmount(targetCents, currency)
  const deltaFormatted = formatAmount(Math.abs(deltaCents), currency)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-border/60 bg-background/95 p-6 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Scale className="h-5 w-5 text-emerald-400" />
            Adjust Borrowing Balance
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Directly adjust the remaining balance for{" "}
            <span className="font-semibold text-foreground">
              {borrowing.direction === "LENT" ? "Lent to" : "Borrowed from"}{" "}
              {borrowing.counterparty}
            </span>
            . Saturn will record a balance adjustment in the borrowing timeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Current vs Target Card */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-muted/20 p-3.5">
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                Current Remaining
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {currentBalFormatted}{" "}
                <span className="text-xs font-semibold text-muted-foreground">
                  {currency}
                </span>
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                Target Balance
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {targetBalFormatted}{" "}
                <span className="text-xs font-semibold text-muted-foreground">
                  {currency}
                </span>
              </span>
            </div>
          </div>

          {/* Live Preview Delta Callout */}
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border p-3 text-xs font-semibold transition-all",
              deltaCents > 0
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : deltaCents < 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-border/40 bg-muted/20 text-muted-foreground"
            )}
          >
            <span>Adjustment Type</span>
            <span className="font-bold">
              {deltaCents > 0
                ? `+${deltaFormatted} ${currency} (Balance Increase)`
                : deltaCents < 0
                  ? `-${deltaFormatted} ${currency} (Balance Reduction)`
                  : `0.00 ${currency} (No Change)`}
            </span>
          </div>

          {/* Inputs */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              New Remaining Balance
            </Label>
            <AmountInput
              control={control}
              name="targetBalance"
              currency={currency}
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              Adjustment Date
            </Label>
            <Controller
              control={control}
              name="adjustmentDate"
              render={({ field }) => (
                <DatePicker
                  date={field.value}
                  setDate={(d) => d && field.onChange(d)}
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              Account for Bank Transaction (Optional)
            </Label>
            <AccountSelect
              control={control}
              name="accountId"
              accounts={activeAccounts}
              placeholder="None (Adjust borrowing balance only)"
              allowNone
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="adjust-borrowing-notes"
              className="text-xs font-bold text-muted-foreground uppercase"
            >
              Adjustment Note / Reason
            </Label>
            <Input
              id="adjust-borrowing-notes"
              {...register("notes")}
              placeholder="e.g. Debt forgiveness, fee adjustment, reconciliation"
              className="h-11 rounded-xl text-xs"
            />
            {errors.notes && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {adjustError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{adjustError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={adjustMutation.isPending || deltaCents === 0}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary text-white shadow-lg"
            >
              {adjustMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Confirm Adjustment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
