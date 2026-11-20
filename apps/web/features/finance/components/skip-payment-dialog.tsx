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
import { useI18n } from "@saturn/hooks"

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
  paymentName,
  amountFormatted,
  currency,
}: SkipPaymentDialogProps) {
  const { t } = useI18n()
  const resolvedName =
    paymentName || t("finance.recurring.skip.paymentFallback")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-amber-500/10 text-amber-500">
            <FastForward className="h-6 w-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("finance.recurring.skip.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {amountFormatted
              ? t("finance.recurring.skip.descriptionWithAmount", {
                  name: resolvedName,
                  amount: amountFormatted,
                  currency: currency || "",
                })
              : t("finance.recurring.skip.description", {
                  name: resolvedName,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("common.cancel")}
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
                {t("finance.recurring.skip.skipping")}
              </>
            ) : (
              <>
                <FastForward className="mr-1.5 h-4 w-4" />
                {t("finance.recurring.skip.confirm")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
