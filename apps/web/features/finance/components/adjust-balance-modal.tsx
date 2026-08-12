import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  type Account,
  useAdjustAccountBalanceMutation,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
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

const adjustBalanceSchema = z.object({
  targetBalance: z.string().min(1, "Target balance is required"),
  notes: z.string().optional(),
})

type AdjustBalanceFormValues = z.infer<typeof adjustBalanceSchema>

interface AdjustBalanceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
  refetchAccounts: () => void
  refetchTransfers: () => void
}

export function AdjustBalanceModal({
  open,
  onOpenChange,
  account,
  refetchAccounts,
  refetchTransfers,
}: AdjustBalanceModalProps) {
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(adjustBalanceSchema),
    defaultValues: {
      targetBalance: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (open && account) {
      reset({
        targetBalance: (Number(account.currentBalance || 0) / 100).toFixed(2),
        notes: "",
      })
    }
  }, [open, account, reset])

  const targetBalanceStr = useWatch({ control, name: "targetBalance" }) || ""

  const adjustMutation = useAdjustAccountBalanceMutation({
    onSuccess: () => {
      refetchAccounts()
      refetchTransfers()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      setAdjustError(
        err instanceof Error ? err.message : "Failed to adjust balance"
      )
    },
  })

  const onSubmit = (data: AdjustBalanceFormValues) => {
    if (!account?.id) return

    const parsedNum = parseFloat(data.targetBalance)
    if (isNaN(parsedNum)) {
      setAdjustError("Please enter a valid numeric target balance")
      return
    }

    const targetBalanceCents = Math.round(parsedNum * 100)
    setAdjustError(null)
    adjustMutation.mutate({
      account_id: account.id,
      req: {
        accountId: account.id,
        targetBalance: targetBalanceCents.toString(),
        note: data.notes || undefined,
      },
    })
  }

  if (!account) return null

  const currentCents = Number(account.currentBalance || 0)
  const parsedNum = parseFloat(targetBalanceStr)
  const targetCents = isNaN(parsedNum)
    ? currentCents
    : Math.round(parsedNum * 100)
  const deltaCents = targetCents - currentCents

  const currentBalFormatted = formatAmount(currentCents, account.currency)
  const targetBalFormatted = formatAmount(targetCents, account.currency)
  const deltaFormatted = formatAmount(Math.abs(deltaCents), account.currency)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-border/60 bg-background/95 p-6 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Scale className="h-5 w-5 text-emerald-400" />
            Adjust Account Balance
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter the current real-world balance for{" "}
            <span className="font-semibold text-foreground">
              {account.name}
            </span>
            . Saturn will log a system reconciliation transaction to match.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Current vs Target Card */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-muted/20 p-3.5">
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                Current Saturn Balance
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {currentBalFormatted}{" "}
                <span className="text-xs font-semibold text-muted-foreground">
                  {account.currency}
                </span>
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                Target Real-World Balance
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {targetBalFormatted}{" "}
                <span className="text-xs font-semibold text-muted-foreground">
                  {account.currency}
                </span>
              </span>
            </div>
          </div>

          {/* Live Preview Delta Callout */}
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border p-3 text-xs font-semibold transition-all",
              deltaCents > 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : deltaCents < 0
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  : "border-border/40 bg-muted/20 text-muted-foreground"
            )}
          >
            <span>Adjustment Type</span>
            <span className="font-bold">
              {deltaCents > 0
                ? `+${deltaFormatted} ${account.currency} (Income)`
                : deltaCents < 0
                  ? `-${deltaFormatted} ${account.currency} (Expense)`
                  : `0.00 ${account.currency} (No Change)`}
            </span>
          </div>

          {/* Inputs */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              Actual Real-World Balance
            </Label>
            <AmountInput
              control={control}
              name="targetBalance"
              currency={account.currency}
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="adjust-notes"
              className="text-xs font-bold text-muted-foreground uppercase"
            >
              Reconciliation Note (Optional)
            </Label>
            <Input
              id="adjust-notes"
              {...register("notes")}
              placeholder="e.g. Monthly statement reconciliation"
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
              Confirm & Adjust Balance
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
