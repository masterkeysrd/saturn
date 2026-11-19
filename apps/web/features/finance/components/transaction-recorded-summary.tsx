import { useEffect, useRef, type ReactNode } from "react"
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { Button } from "@/components/ui/button"
import { MoneyAmount } from "@/components/ui/money-amount"

export interface RecordedDetailRow {
  label: string
  value: ReactNode
}

export interface TransactionRecordedSummaryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  amountCents: number | string
  currency: string
  colored?: boolean
  showSign?: boolean
  secondaryAmountHint?: ReactNode
  summaryTitle?: string
  details: RecordedDetailRow[]
  sessionCount?: number
  addAnotherLabel: string
  onAddAnother: () => void
  onChooseAnotherType?: () => void
  onDone: () => void
}

export function TransactionRecordedSummary({
  open,
  onOpenChange,
  title,
  description = "Review your entry below before finishing or adding another.",
  amountCents,
  currency,
  colored = false,
  showSign = false,
  secondaryAmountHint,
  summaryTitle,
  details,
  sessionCount = 1,
  addAnotherLabel,
  onAddAnother,
  onChooseAnotherType,
  onDone,
}: TransactionRecordedSummaryProps) {
  const doneButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      doneButtonRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const headerTitle = (
    <span className="inline-flex items-center gap-2">
      <span>{title}</span>
      {sessionCount > 1 && (
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {sessionCount} recorded
        </span>
      )}
    </span>
  )

  const headerIcon = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-4" />
    </span>
  )

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      icon={headerIcon}
      title={headerTitle}
      description={description}
      submitLabel="Done"
      onSubmit={(e) => {
        e.preventDefault()
        onDone()
      }}
      customFooter={
        <>
          {onChooseAnotherType ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onChooseAnotherType}
              className="-ml-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              <span>All types</span>
            </Button>
          ) : (
            <span />
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onAddAnother}>
              <Plus className="size-4" />
              <span>{addAnotherLabel}</span>
            </Button>
            <Button
              ref={doneButtonRef}
              type="button"
              onClick={onDone}
              className="min-w-24"
            >
              Done
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Recorded amount
          </span>
          <div className="mt-1">
            <MoneyAmount
              cents={amountCents}
              currency={currency}
              colored={colored}
              showSign={showSign}
              size="xl"
            />
          </div>
          {secondaryAmountHint && (
            <div className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
              {secondaryAmountHint}
            </div>
          )}
          {summaryTitle && (
            <p className="mt-2 text-sm font-medium text-foreground">
              {summaryTitle}
            </p>
          )}
        </div>

        <div className="divide-y divide-border/60 border-y border-border/60">
          {details.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 py-2.5 text-[13px]"
            >
              <span className="shrink-0 text-muted-foreground">
                {row.label}
              </span>
              <span className="truncate font-medium text-foreground">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </FormDrawer>
  )
}
