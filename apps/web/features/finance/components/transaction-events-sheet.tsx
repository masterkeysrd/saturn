import { createElement } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { useListTransactionEventsQuery } from "@/gen/saturn/finance/v1/finance"
import { ScrollArea } from "@/components/ui/scroll-area"
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:!max-w-xl sm:border-l">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Clock className="h-5 w-5 text-primary" />
            Transaction Timeline
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Chronological record and verification events for:{" "}
            <span className="font-semibold text-foreground">
              {txnDescription || "this transaction"}
            </span>
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex h-[250px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
            <Activity className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs font-semibold text-muted-foreground">
              No lifecycle events found
            </p>
            <p className="mt-1 max-w-[250px] text-[10px] text-muted-foreground/80">
              This transaction was recorded directly and has no associated
              ingestion or reconciliation events.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-180px)] pr-3">
            {/* Vertical Timeline container */}
            <div className="relative ml-3 space-y-8 border-l border-border/20 py-2 pl-6">
              {events.map((e) => {
                const config = getEventConfig(e.eventType)
                const meta = parseMetadata(e.metadata)
                const metaKeys = Object.keys(meta)

                return (
                  <div key={e.id} className="relative">
                    {/* Timeline Dot (Icon Badge) */}
                    <div
                      className={`absolute top-0 -left-[38px] flex h-8 w-8 items-center justify-center rounded-xl border ${config.color} bg-card/90 shadow-sm transition-all`}
                    >
                      {createElement(config.icon, { className: "h-4 w-4" })}
                    </div>

                    {/* Content Card */}
                    <div className="rounded-2xl border border-border/40 bg-background/50 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-background/80">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">
                            {config.title}
                          </h4>
                          <span className="mt-1 block font-mono text-[9.5px] font-semibold text-muted-foreground">
                            {e.createTime
                              ? new Date(e.createTime).toLocaleString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "UTC",
                                  }
                                )
                              : ""}
                          </span>
                        </div>
                      </div>

                      {/* Metadata Details */}
                      {metaKeys.length > 0 && (
                        <div className="mt-3 space-y-1.5 border-t border-border/10 pt-2.5">
                          {metaKeys.map((key) => {
                            const value = meta[key]
                            const label = key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())

                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between text-[10px]"
                              >
                                <span className="font-semibold text-muted-foreground/80">
                                  {label}
                                </span>
                                <span className="max-w-[200px] truncate font-mono font-bold text-foreground select-all">
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
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}
