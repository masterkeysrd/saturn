import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Loader2, FastForward } from "lucide-react"

interface SkipPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isPending?: boolean
  paymentName?: string
  amountFormatted?: string
  currency?: string
}

export function SkipPaymentDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  paymentName = "Scheduled Payment",
  amountFormatted,
  currency,
}: SkipPaymentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-amber-500/10 text-amber-500">
            <FastForward className="h-6 w-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>Skip Scheduled Payment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to skip{" "}
            <span className="font-bold text-foreground">{paymentName}</span>
            {amountFormatted && (
              <>
                {" "}for{" "}
                <span className="font-bold text-foreground">
                  {amountFormatted} {currency}
                </span>
              </>
            )}{" "}
            for this cycle? No ledger transaction will be logged.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isPending}
            className="border border-amber-500/30 bg-amber-500/10 font-bold text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Skipping...
              </>
            ) : (
              <>
                <FastForward className="mr-1.5 h-4 w-4" />
                Skip Cycle
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
