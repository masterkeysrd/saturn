import type { CopilotEntityKind, CopilotEntityRef } from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { cn } from "@/lib/utils"
import {
  CalendarIcon,
  FileSpreadsheetIcon,
  LandmarkIcon,
  MailIcon,
  MapPinIcon,
  PieChartIcon,
  ReceiptTextIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"

export function CopilotEntityIcon({
  kind,
  className,
}: {
  kind: CopilotEntityKind
  className?: string
}) {
  const iconClass = cn("size-3 shrink-0", className)
  switch (kind) {
    case "transaction":
      return <ReceiptTextIcon className={iconClass} />
    case "budget":
      return <PieChartIcon className={iconClass} />
    case "account":
      return <LandmarkIcon className={iconClass} />
    case "statement":
      return <FileSpreadsheetIcon className={iconClass} />
    case "mail_thread":
      return <MailIcon className={iconClass} />
    case "calendar_event":
      return <CalendarIcon className={iconClass} />
    case "workflow":
      return <WorkflowIcon className={iconClass} />
  }
}

export function CopilotEntityBadge({
  item,
  ambient = false,
  onDismiss,
  className,
}: {
  item: CopilotEntityRef
  ambient?: boolean
  onDismiss?: () => void
  className?: string
}) {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium",
        ambient
          ? "border-primary/25 bg-primary/8 text-foreground"
          : "border-border bg-muted/60 text-foreground",
        className
      )}
    >
      {ambient ? (
        <MapPinIcon className="size-3 shrink-0 text-primary" />
      ) : (
        <CopilotEntityIcon kind={item.kind} className="text-primary" />
      )}
      <span className="max-w-[180px] truncate">{item.label}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={
            ambient
              ? t("copilot.dismissFrom", { name: item.label })
              : t("copilot.removeFrom", { name: item.label })
          }
          className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  )
}
