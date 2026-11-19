import { createElement } from "react"
import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { useListTransactionEventsQuery } from "@saturn/api/gen/saturn/finance/v1/finance"
import { useTimezone } from "@saturn/hooks"
import {
  Loader2,
  Calendar,
  CreditCard,
  FileCheck,
  FileText,
  Settings,
  Activity,
  Clock,
} from "lucide-react"

interface TransactionEventsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  txnId: string | null
  txnDescription: string | null
}

export function TransactionEventsSheet({
  open,
  onOpenChange,
  txnId,
  txnDescription,
}: TransactionEventsSheetProps) {
  const tz = useTimezone()
  // Fetch transaction events
  const { data, isLoading } = useListTransactionEventsQuery(
    { txnId: txnId || "" },
    { enabled: open && !!txnId }
  )

  const events = data?.events || []

  const getEventConfig = (type: string) => {
    switch (type) {
      case "EXPENSE_SCHEDULED":
        return {
          title: "Expense Scheduled",
          icon: Calendar,
          color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
        }
      case "BANK_CONFIRM_RECEIVED":
        return {
          title: "Bank Payment Confirmed",
          icon: CreditCard,
          color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        }
      case "INVOICE_RECEIVED":
        return {
          title: "Invoice Generated",
          icon: FileText,
          color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        }
      case "RECEIPT_RECEIVED":
        return {
          title: "Provider Receipt Verified",
          icon: FileCheck,
          color: "bg-teal-500/10 text-teal-500 border-teal-500/20",
        }
      case "MANUAL_EDIT":
        return {
          title: "Manual Modification",
          icon: Settings,
          color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
        }
      default:
        return {
          title: type.replace(/_/g, " "),
          icon: Activity,
          color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
        }
    }
  }

  const parseMetadata = (metaStr: string) => {
    try {
      return metaStr ? JSON.parse(metaStr) : {}
    } catch {
      return {}
    }
  }

  return (
    <WorkspaceInspectorPanel
      open={open}
      onOpenChange={onOpenChange}
      icon={<Clock className="size-4" />}
      title="Transaction Timeline"
      description={
        <>
          Lifecycle events for{" "}
          <span className="font-medium text-foreground">
            {txnDescription || "this transaction"}
          </span>
        </>
      }
    >
      {isLoading ? (
        <div className="flex h-[250px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
          <Activity className="mb-3 h-9 w-9 text-muted-foreground/30" />
          <p className="text-xs font-semibold text-muted-foreground">
            No lifecycle events found
          </p>
          <p className="mt-1 max-w-[250px] text-xs text-muted-foreground/80">
            This transaction was recorded directly and has no associated
            ingestion or reconciliation events.
          </p>
        </div>
      ) : (
        <div className="relative ml-3 space-y-6 border-l border-border/50 py-1 pl-6">
          {events.map((e) => {
            const config = getEventConfig(e.eventType)
            const meta = parseMetadata(e.metadata)
            const metaKeys = Object.keys(meta)

            return (
              <div key={e.id} className="relative">
                {/* Timeline Dot (Icon Badge) */}
                <div
                  className={`absolute top-0 -left-[37px] flex h-7 w-7 items-center justify-center rounded-lg border ${config.color} bg-card`}
                >
                  {createElement(config.icon, { className: "h-3.5 w-3.5" })}
                </div>

                {/* Flat hairline-separated event entry */}
                <div className="space-y-2 border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">
                      {config.title}
                    </h4>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground tabular-nums">
                      {e.createTime
                        ? tz.formatDateTime(e.createTime, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>

                  {metaKeys.length > 0 && (
                    <div className="space-y-1.5 border-t border-border/40 pt-2">
                      {metaKeys.map((key) => {
                        const value = meta[key]
                        const label = key
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())

                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-muted-foreground">
                              {label}
                            </span>
                            <span className="max-w-[190px] truncate font-mono font-medium text-foreground select-all">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WorkspaceInspectorPanel>
  )
}

export { TransactionEventsSheet as TransactionEventsInspector }
