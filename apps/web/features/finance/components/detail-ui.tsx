import type { ReactNode, ElementType } from "react"
import { AlertCircle } from "lucide-react"
import { useI18n } from "@saturn/hooks"
import { DocumentPage } from "@/components/ui/page-shells"
import { Skeleton } from "@/components/ui/skeleton"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

export function DetailError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="size-4 shrink-0" />
      {children}
    </div>
  )
}
export function DetailPending({
  title,
  error,
  actions,
}: {
  title: string
  error: boolean
  actions?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <DocumentPage title={title} maxWidth="xl" actions={actions}>
      {error ? (
        <DetailError>{t("finance.detail.error")}</DetailError>
      ) : (
        <div role="status" className="space-y-4">
          <span className="sr-only">{t("common.loading")}</span>
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-56" />
        </div>
      )}
    </DocumentPage>
  )
}
export function DetailMetric({
  label,
  icon: Icon,
  tone,
  cents,
  currency,
  sign,
  colored,
  embedded,
  children,
}: {
  label: string
  icon: ElementType
  tone: string
  cents: number | undefined
  currency?: string
  colored?: boolean
  embedded?: boolean
  sign?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={
        embedded
          ? "min-w-0"
          : "min-w-0 rounded-xl border border-border bg-card p-4 shadow-2xs"
      }
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        <Icon className={`size-4 ${tone}`} />
      </div>
      {cents !== undefined ? (
        <MoneyAmount
          className="mt-2 block"
          size="lg"
          colored={colored}
          showSign={sign}
          cents={cents}
          currency={currency}
        />
      ) : (
        <Skeleton className="mt-2 h-6 w-20" />
      )}
      {children}
    </div>
  )
}
export function DetailProgress({
  label,
  value,
  max,
  tone = "primary",
  embedded,
  children,
}: {
  label: string
  value: number
  max: number
  tone?: "primary" | "success" | "warning" | "destructive" | "neutral"
  embedded?: boolean
  children?: ReactNode
}) {
  const pct = Math.round((100 * value) / (max || 1))
  return (
    <div
      className={
        embedded
          ? "space-y-3 border-t pt-4"
          : "space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs"
      }
    >
      <div className="flex items-center justify-between text-sm font-semibold">
        {label}
        <Badge
          className="font-mono tabular-nums"
          variant={tone === "primary" ? "default" : tone}
        >
          {pct}%
        </Badge>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max || 1}
        aria-valuenow={Math.min(max, value)}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={`h-full rounded-full ${{ primary: "bg-primary", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive", neutral: "bg-muted-foreground" }[tone]}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {children}
    </div>
  )
}
export function DetailSegments<T extends string>({
  values,
  active,
  label,
  onChange,
}: {
  values: readonly T[]
  active: T
  label: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap items-center rounded-lg bg-muted/60 p-0.5">
      {values.map((v) => (
        <button
          type="button"
          key={v}
          aria-pressed={v === active}
          onClick={() => onChange(v)}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${v === active ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label(v)}
        </button>
      ))}
    </div>
  )
}
export function DetailConfirm({
  open,
  onClose,
  title,
  description,
  label,
  pending,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  label: string
  pending: boolean
  onConfirm: () => void
}) {
  const { t } = useI18n()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
