import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  useConfirmScheduledPaymentMutation,
  type ScheduledPayment,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2, CheckCircle2 } from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { toCentsString, formatCents } from "../utils"

interface ConfirmPaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: ScheduledPayment | null
  refetchPayments: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function ConfirmPaymentSheet({
  open,
  onOpenChange,
  payment,
  refetchPayments,
  getConversionPreview,
}: ConfirmPaymentSheetProps) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState("")
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date())
  const [confirmedTxn, setConfirmedTxn] = useState<Transaction | null>(null)

  const confirmMutation = useConfirmScheduledPaymentMutation()

  const [prevPaymentId, setPrevPaymentId] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(false)

  const currentPaymentId = payment?.id || null
  if (currentPaymentId !== prevPaymentId || open !== prevOpen) {
    setPrevPaymentId(currentPaymentId)
    setPrevOpen(open)
    if (payment) {
      setAmount(formatCents(payment.amount).toString())
      setTransactionDate(new Date())
      setEffectiveDate(new Date(payment.dueDate))
      setConfirmedTxn(null) // reset success state on reopen
    }
  }

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payment) return

    const centsAmount = toCentsString(amount)
    const txDateStr = toLocalISODate(transactionDate)
    const effDateStr = toLocalISODate(effectiveDate)

    const res = await confirmMutation.mutateAsync({
      payment_id: payment.id,
      req: {
        paymentId: payment.id,
        transactionDate: txDateStr,
        effectiveDate: effDateStr,
        actualAmount: centsAmount,
      },
    })

    refetchPayments()
    setConfirmedTxn(res)
  }

  const isPending = confirmMutation.isPending
  const conversion = payment
    ? getConversionPreview(amount, payment.currency)
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:!max-w-xl sm:rounded-l-3xl sm:border-l md:p-8">
        {confirmedTxn ? (
          // Success State Screen
          <div className="flex h-full flex-col justify-between pt-8">
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-inner">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  Payment Cleared!
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The scheduled payment was successfully cleared and registered
                  as a transaction.
                </p>
              </div>

              <div className="space-y-3.5 rounded-2xl border border-border/40 bg-background/50 p-5 text-left text-xs shadow-sm">
                <div className="flex justify-between border-b border-border/10 pb-2">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="ml-4 text-right font-mono font-semibold break-all text-foreground select-all">
                    {confirmedTxn.id}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/10 pb-2">
                  <span className="text-muted-foreground">Cleared Amount:</span>
                  <span className="font-bold text-foreground">
                    {formatCents(confirmedTxn.amount).toFixed(2)}{" "}
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {confirmedTxn.currency}
                    </span>
                  </span>
                </div>
                {confirmedTxn.currency !==
                  (confirmedTxn.amountInBase ? "USD" : "") &&
                  confirmedTxn.amountInBase && (
                    <div className="flex justify-between border-b border-border/10 pb-2">
                      <span className="text-muted-foreground">
                        Amount in Base:
                      </span>
                      <span className="font-bold text-foreground">
                        {formatCents(confirmedTxn.amountInBase).toFixed(2)}{" "}
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          USD
                        </span>
                      </span>
                    </div>
                  )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="max-w-[200px] truncate font-semibold text-foreground">
                    {confirmedTxn.description || "Scheduled Outflow"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  navigate("/finance/transactions")
                }}
                className="h-12 cursor-pointer rounded-xl border-border/60 text-xs font-bold hover:bg-muted/10"
              >
                View Transactions
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                className="h-12 cursor-pointer rounded-xl bg-gradient-to-r from-primary to-accent text-xs font-bold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          // Confirmation Form Screen
          <div className="flex h-full flex-col justify-between">
            <div>
              <SheetHeader className="p-0">
                <SheetTitle className="text-xl font-bold">
                  Confirm Payment
                </SheetTitle>
                <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Verify the details for clearing this scheduled outflow.
                </SheetDescription>
              </SheetHeader>

              {payment && (
                <form
                  id="confirm-payment-form"
                  onSubmit={handleConfirm}
                  className="mt-8 space-y-6"
                >
                  <div className="space-y-2 rounded-2xl border border-muted/20 bg-muted/5 p-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Source Type:
                      </span>
                      <span className="font-bold text-foreground capitalize">
                        {payment.sourceType.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Original Due Date:
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {new Date(payment.dueDate).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          }
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="actualAmount"
                      className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                    >
                      Amount Paid
                    </Label>
                    <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
                      <input
                        id="actualAmount"
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

                      <div className="px-4 text-xs font-bold text-muted-foreground select-none">
                        {payment.currency}
                      </div>
                    </div>
                  </div>

                  <CurrencyConversionPreview
                    conversion={conversion}
                    fromCurrency={payment.currency}
                  />

                  <div className="space-y-2">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Date Cleared
                    </Label>
                    <DatePicker
                      date={transactionDate}
                      setDate={(d) => d && setTransactionDate(d)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Effective Date
                    </Label>
                    <DatePicker
                      date={effectiveDate}
                      setDate={(d) => d && setEffectiveDate(d)}
                    />
                  </div>
                </form>
              )}
            </div>

            <div className="mt-8 flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-12 flex-1 cursor-pointer rounded-xl border-border/60 text-xs font-bold hover:bg-muted/10"
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="confirm-payment-form"
                className="h-12 flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-primary to-accent text-xs font-bold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  "Clear Payment"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
