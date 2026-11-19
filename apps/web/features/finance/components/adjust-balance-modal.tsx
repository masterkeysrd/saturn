import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  type Account,
  useAdjustAccountBalanceMutation,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  AdjustBalanceSchema,
  type AdjustBalanceFormValues,
} from "@saturn/schemas"
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

  const currentBalance = account?.currentBalance
  const adjustBalanceDefaultValues = useMemo<AdjustBalanceFormValues>(() => {
    return {
      targetBalance:
        currentBalance !== undefined
          ? (Number(currentBalance || 0) / 100).toFixed(2)
          : "",
      notes: "",
    }
  }, [currentBalance])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(AdjustBalanceSchema),
    defaultValues: {
      targetBalance: "",
      notes: "",
    },
    values: adjustBalanceDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const targetBalanceStr = useWatch({ control, name: "targetBalance" }) || ""

  const adjustMutation = useAdjustAccountBalanceMutation({
    onSuccess: () => {
      refetchAccounts()
      refetchTransfers()
      reset()
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
      <DialogContent className="flex max-h-[min(88svh,44rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg font-semibold tracking-tight text-foreground">
            <Scale className="h-4.5 w-4.5 text-primary" />
            <span>Adjust Account Balance</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter the current real-world balance for{" "}
            <span className="font-medium text-foreground">{account.name}</span>.
            Saturn will log a system reconciliation transaction to match.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* Current vs Target Summary */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/30 p-3.5">
              <div>
                <span className="block text-xs text-muted-foreground">
                  Current Balance
                </span>
                <span className="mt-0.5 block font-mono text-sm font-semibold text-foreground tabular-nums">
                  {currentBalFormatted}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {account.currency}
                  </span>
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  Target Balance
                </span>
                <span className="mt-0.5 block font-mono text-sm font-semibold text-foreground tabular-nums">
                  {targetBalFormatted}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {account.currency}
                  </span>
                </span>
              </div>
            </div>

            {/* Live Preview Delta Callout */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-colors",
                deltaCents > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : deltaCents < 0
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-border/60 bg-muted/20 text-muted-foreground"
              )}
            >
              <span>Adjustment Type</span>
              <span className="font-mono font-semibold tabular-nums">
                {deltaCents > 0
                  ? `+${deltaFormatted} ${account.currency} (Income)`
                  : deltaCents < 0
                    ? `-${deltaFormatted} ${account.currency} (Expense)`
                    : `0.00 ${account.currency} (No Change)`}
              </span>
            </div>

            {/* Inputs */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/90">
                Actual Real-World Balance
              </Label>
              <AmountInput
                control={control}
                name="targetBalance"
                currency={account.currency}
                placeholder="0.00"
                allowNegative
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="adjust-notes"
                className="text-[13px] font-medium text-foreground/90"
              >
                Reconciliation Note (Optional)
              </Label>
              <Input
                id="adjust-notes"
                {...register("notes")}
                placeholder="e.g. Monthly statement reconciliation"
              />
              {errors.notes && (
                <p className="text-xs font-medium text-destructive">
                  {errors.notes.message}
                </p>
              )}
            </div>

            {adjustError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{adjustError}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 bg-card px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={adjustMutation.isPending || deltaCents === 0}
            >
              {adjustMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <span>Confirm & Adjust Balance</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
